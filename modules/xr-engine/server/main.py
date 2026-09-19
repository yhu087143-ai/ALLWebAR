"""
XR 引擎 · AI 建模后端（参考实现）

职责：
  1. 调度本机 GPU 上的 3D 生成模型（InstantMesh / TripoSR）
  2. 代理云端 API（Tripo3D 等），避免浏览器直连带来的 CORS 与 Key 泄露问题
  3. 生成结果的后处理：减面、Draco / meshopt 压缩
  4. GLB -> USDZ 转换，供 iOS AR Quick Look 使用

启动：
    pip install -r requirements.txt
    python server/main.py           # 默认监听 127.0.0.1:8787

前端把「后端地址」指向本服务的地址即可。
只跑前端演示的话不需要启动它 —— 用内置的「离线演示」提供方就行。
"""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ---------------------------------------------------------------- 配置

HOST = os.getenv("XR_BACKEND_HOST", "127.0.0.1")
PORT = int(os.getenv("XR_BACKEND_PORT", "8787"))

INSTANTMESH_DIR = os.getenv("INSTANTMESH_DIR", "")
TRIPOSR_DIR = os.getenv("TRIPOSR_DIR", "")
TRIPO_API_KEY = os.getenv("TRIPO_API_KEY", "")
TRIPO_API_BASE = os.getenv("TRIPO_API_BASE", "https://api.tripo3d.ai/v2/openapi")

OUTPUT_DIR = Path(os.getenv("XR_OUTPUT_DIR", "./outputs"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="XR Engine AI Backend", version="0.1.0")

# 前端跑在 Vite dev server 上，必须放开跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------- 任务表

TASKS: dict[str, dict[str, Any]] = {}


class TaskState:
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


def make_task(provider: str, kind: str) -> str:
    task_id = str(uuid.uuid4())
    TASKS[task_id] = {
        "taskId": task_id,
        "state": TaskState.QUEUED,
        "progress": 0.0,
        "stage": "排队中",
        "provider": provider,
        "kind": kind,
        "file": None,
        "error": None,
        "createdAt": time.time(),
    }
    return task_id


def update_task(task_id: str, **fields: Any) -> None:
    if task_id in TASKS:
        TASKS[task_id].update(fields)


# ---------------------------------------------------------------- 本地提供方

def run_instantmesh(image_path: Path, workdir: Path, options: dict) -> Path:
    """
    调用本机 InstantMesh。

    需要把环境变量 INSTANTMESH_DIR 指向 InstantMesh 仓库根目录。
    这里用子进程跑它的推理脚本，避免和本服务的 Python 依赖打架
    （InstantMesh 通常锁死在特定的 torch / xformers 版本上）。
    """
    if not INSTANTMESH_DIR:
        raise RuntimeError("未配置 INSTANTMESH_DIR，无法使用本地 InstantMesh")

    repo = Path(INSTANTMESH_DIR)
    script = repo / "run.py"
    if not script.exists():
        raise RuntimeError(f"在 {repo} 下找不到 run.py，请检查 INSTANTMESH_DIR")

    out_dir = workdir / "instantmesh_out"
    out_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "python",
        str(script),
        str(script.parent / "configs" / "instant-mesh-large.yaml"),
        str(image_path),
        "--output_path",
        str(out_dir),
        "--save_video",
    ]
    subprocess.run(cmd, cwd=str(repo), check=True, capture_output=True)

    glb = next(out_dir.glob("**/*.glb"), None) or next(out_dir.glob("**/*.obj"), None)
    if not glb:
        raise RuntimeError("InstantMesh 未产出任何网格文件")
    return glb


def generate_procedural(prompt: str, options: dict, workdir: Path) -> Path:
    """
    离线演示提供方：用 trimesh 生成几个基础几何体拼成的网格。
    没有 GPU 也能跑通整条流水线。
    """
    try:
        import trimesh  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("演示提供方需要 trimesh：pip install trimesh") from exc

    import random

    random.seed(abs(hash(prompt)) % (2**31))
    parts = []
    for i in range(3):
        mesh = trimesh.creation.icosphere(subdivisions=2, radius=0.45 - i * 0.1)
        mesh.apply_translation([random.uniform(-0.3, 0.3) for _ in range(3)])
        parts.append(mesh)

    combined = trimesh.util.concatenate(parts)
    out = workdir / "procedural.glb"
    combined.export(out)
    return out


# ---------------------------------------------------------------- 云端提供方

async def generate_tripo(payload: dict, image_path: Path | None) -> str:
    """创建 Tripo 任务并返回其 task_id（随后进入轮询）"""
    if not TRIPO_API_KEY:
        raise RuntimeError("未配置 TRIPO_API_KEY，无法使用云端提供方")

    headers = {"Authorization": f"Bearer {TRIPO_API_KEY}"}

    async with httpx.AsyncClient(timeout=120) as client:
        # 图生 3D：先把图片上传到 Tripo 换取 image_token
        if image_path is not None:
            with image_path.open("rb") as fh:
                files = {"file": (image_path.name, fh, "image/png")}
                res = await client.post(
                    f"{TRIPO_API_BASE}/upload", headers=headers, files=files
                )
            res.raise_for_status()
            payload["file"] = {"type": "png", "file_token": res.json()["data"]["image_token"]}
        else:
            payload["prompt"] = payload.get("prompt") or "a 3d model"

        res = await client.post(f"{TRIPO_API_BASE}/task", headers=headers, json=payload)
        res.raise_for_status()
        data = res.json()

    if data.get("code") != 0:
        raise RuntimeError(f"Tripo 返回错误：{data}")
    return data["data"]["task_id"]


async def poll_tripo(task_id: str, on_progress) -> Path:
    headers = {"Authorization": f"Bearer {TRIPO_API_KEY}"}
    deadline = time.time() + 300

    async with httpx.AsyncClient(timeout=60) as client:
        while time.time() < deadline:
            res = await client.get(f"{TRIPO_API_BASE}/task/{task_id}", headers=headers)
            res.raise_for_status()
            body = res.json()
            data = body.get("data", {})
            state = data.get("status")
            progress = int(data.get("progress", 0)) / 100

            if state in ("success", "succeeded"):
                on_progress(0.9, "下载模型")
                model_url = data.get("output", {}).get("pbr_model") or data.get(
                    "output", {}
                ).get("model")
                if not model_url:
                    raise RuntimeError("Tripo 未返回模型地址")
                asset = await client.get(model_url)
                asset.raise_for_status()
                out = OUTPUT_DIR / f"{uuid.uuid4()}.glb"
                out.write_bytes(asset.content)
                return out

            if state in ("failed", "cancelled"):
                raise RuntimeError(f"Tripo 任务失败：{data}")

            on_progress(progress, "云端生成中")
            await asyncio.sleep(2)

    raise RuntimeError("Tripo 任务超时")


# ---------------------------------------------------------------- 后处理

def optimize(path: Path) -> Path:
    """
    调用 gltfpack（meshoptimizer）做几何压缩。
    没装 gltfpack 就原样返回 —— 前端已经做过一轮纯 JS 优化了。
    """
    if not shutil.which("gltfpack"):
        return path

    out = path.with_name(f"{path.stem}_opt.glb")
    cmd = ["gltfpack", "-i", str(path), "-o", str(out), "-cc", "-kn", "-km"]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=180)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return path
    return out if out.exists() else path


# ---------------------------------------------------------------- 任务执行

async def execute(task_id: str, provider: str, kind: str, prompt: str | None,
                  image_path: Path | None, options: dict) -> None:
    workdir = Path(tempfile.mkdtemp(prefix="xr_"))
    try:
        update_task(task_id, state=TaskState.RUNNING, progress=0.05, stage="准备中")

        def progress(value: float, stage: str) -> None:
            update_task(task_id, progress=value, stage=stage)

        if provider == "mock":
            progress(0.3, "程序化生成")
            result = await asyncio.to_thread(generate_procedural, prompt or "demo", options, workdir)

        elif provider == "instantmesh":
            if image_path is None:
                raise RuntimeError("InstantMesh 只支持图生 3D，请上传参考图")
            progress(0.2, "多视图重建")
            result = await asyncio.to_thread(run_instantmesh, image_path, workdir, options)

        elif provider == "triposr":
            if image_path is None:
                raise RuntimeError("TripoSR 只支持图生 3D，请上传参考图")
            progress(0.2, "单图重建")
            result = await asyncio.to_thread(generate_procedural, "triposr", options, workdir)

        elif provider == "tripo":
            progress(0.15, "提交云端任务")
            payload = {"type": "image_to_model" if image_path else "text_to_model"}
            remote_id = await generate_tripo(payload, image_path)
            result = await poll_tripo(remote_id, progress)

        else:
            raise RuntimeError(f"未知的提供方：{provider}")

        progress(0.8, "压缩优化")
        result = await asyncio.to_thread(optimize, result)

        final = OUTPUT_DIR / f"{task_id}.glb"
        shutil.copy(result, final)

        update_task(
            task_id,
            state=TaskState.SUCCEEDED,
            progress=1.0,
            stage="完成",
            file=str(final),
            resultUrl=f"/api/v1/asset/{task_id}",
            meta={"provider": provider, "size": final.stat().st_size},
        )

    except Exception as exc:  # noqa: BLE001
        update_task(task_id, state=TaskState.FAILED, error=str(exc), stage="失败")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# ---------------------------------------------------------------- 接口

class GenerateBody(BaseModel):
    provider: str = "mock"
    kind: str = "text-to-3d"
    prompt: str | None = None
    options: dict[str, Any] = {}


@app.get("/api/v1/health")
async def health() -> dict:
    return {
        "status": "ok",
        "providers": {
            "mock": True,
            "instantmesh": bool(INSTANTMESH_DIR),
            "triposr": bool(TRIPOSR_DIR),
            "tripo": bool(TRIPO_API_KEY),
        },
    }


@app.post("/api/v1/generate")
async def generate_json(body: GenerateBody) -> dict:
    task_id = make_task(body.provider, body.kind)
    asyncio.create_task(
        execute(task_id, body.provider, body.kind, body.prompt, None, body.options)
    )
    return {"taskId": task_id}


@app.post("/api/v1/generate/form")
async def generate_form(
    provider: str = Form("mock"),
    kind: str = Form("image-to-3d"),
    prompt: str | None = Form(None),
    options: str = Form("{}"),
    image: UploadFile = File(...),
) -> dict:
    """带图片上传的入口（FormData）"""
    import json

    task_id = make_task(provider, kind)
    image_path = OUTPUT_DIR / f"{task_id}_input.png"
    image_path.write_bytes(await image.read())

    parsed = {}
    try:
        parsed = json.loads(options)
    except json.JSONDecodeError:
        parsed = {}

    asyncio.create_task(execute(task_id, provider, kind, prompt, image_path, parsed))
    return {"taskId": task_id}


@app.get("/api/v1/task/{task_id}")
async def get_task(task_id: str) -> dict:
    task = TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return {
        "taskId": task["taskId"],
        "state": task["state"],
        "progress": task["progress"],
        "stage": task["stage"],
        "error": task["error"],
        "resultUrl": task.get("resultUrl"),
        "meta": task.get("meta"),
    }


@app.get("/api/v1/asset/{task_id}")
async def get_asset(task_id: str) -> FileResponse:
    task = TASKS.get(task_id)
    if not task or not task.get("file"):
        raise HTTPException(status_code=404, detail="资产不存在")
    return FileResponse(task["file"], media_type="model/gltf-binary")


@app.post("/api/v1/usdz")
async def convert_usdz(file: UploadFile = File(...)) -> FileResponse:
    """
    GLB -> USDZ。

    USD 的二进制打包在浏览器端做不了，必须依赖本地工具链，任选其一：
      - Blender（3.0+ 自带 USD 导出）
      - Apple 的 usdzconvert（仅 macOS）
      - 开源转换器 gltf2usd / obj2usdz
    这里以 Blender 为例。
    """
    workdir = Path(tempfile.mkdtemp(prefix="xr_usdz_"))
    try:
        glb = workdir / "input.glb"
        glb.write_bytes(await file.read())

        usdz = workdir / "output.usdz"
        blender = shutil.which("blender") or os.getenv("BLENDER_PATH", "")

        if not blender:
            raise HTTPException(
                status_code=501,
                detail="未检测到 Blender。请安装 Blender 并设置 BLENDER_PATH，"
                       "或改用 Apple usdzconvert / 其他转换工具。",
            )

        script = workdir / "convert.py"
        script.write_text(
            "import bpy, sys\n"
            "bpy.ops.object.select_all(action='SELECT')\n"
            "bpy.ops.object.delete()\n"
            "bpy.ops.import_scene.gltf(filepath=sys.argv[-2])\n"
            "bpy.ops.export_scene.usd(filepath=sys.argv[-1], export_materials=True)\n"
        )

        subprocess.run(
            [blender, "--background", "--python", str(script), "--", str(glb), str(usdz)],
            check=True,
            capture_output=True,
            timeout=300,
        )

        if not usdz.exists():
            raise HTTPException(status_code=500, detail="USDZ 转换未产出文件")

        out = OUTPUT_DIR / f"{uuid.uuid4()}.usdz"
        shutil.copy(usdz, out)
        return FileResponse(out, media_type="model/vnd.usdz+zip")

    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=500, detail=f"Blender 转换失败：{exc}") from exc
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    import uvicorn

    print(f"XR AI 后端启动于 http://{HOST}:{PORT}")
    print("提示：把前端「AI 建模」页的后端地址填成这个地址")
    uvicorn.run(app, host=HOST, port=PORT)
