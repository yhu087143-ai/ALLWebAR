/**
 * AR 引擎入口
 *
 * 启动流程：
 *  1. 从 URL 查询参数读取配置
 *  2. 显示"开始 AR 体验"遮罩层
 *  3. 用户点击 → 请求摄像头权限 → 初始化追踪 → 加载模型 → 全屏渲染
 *
 * URL 参数示例：
 *  /?model=https://example.com/model.glb&tracking=image&scale=1.5
 *  /?model=https://example.com/model.glb&tracking=face
 *  /?model=https://example.com/model.glb&tracking=plane
 */

import { getConfigFromURL } from "./config";
import { AREngine } from "./ar-engine";
import { createStartOverlay, showError } from "./ui";
import "./ui/styles.css";

async function main() {
  // 1. 读取配置
  const config = getConfigFromURL();
  const app = document.getElementById("app");
  if (!app) {
    console.error("#app 容器不存在");
    return;
  }

  // 2. 创建开始界面
  const ui = createStartOverlay(app, config, async () => {
    try {
      // 禁用按钮，避免重复点击（通过 UI 内部移除按钮实现）
      ui.setLoading(true);

      // 尝试请求摄像头权限（如果尚未授权，会触发浏览器询问）
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
      } catch (permErr) {
        ui.setLoading(false);
        showError(app, "需要摄像头权限才能使用 AR");
        return;
      }

      // 创建并启动 AR 引擎
      const engine = new AREngine(app, config);
      await engine.start();

      // 成功：移除遮罩层、关闭 loading
      ui.removeStartOverlay();
      ui.setLoading(false);
    } catch (err: any) {
      ui.setLoading(false);

      const errMsg = (typeof err === 'object' && err && err.message) ? err.message : String(err || '');
      if (errMsg === "WEBXR_REQUIRED") {
        showError(app, "您的设备不支持 WebXR，请切换为 image 或 face 追踪模式");
      } else {
        showError(app, errMsg || "AR 启动失败");
      }
    }
  });

  // 如果 URL 中没有 model 参数，在控制台打印提示
  if (!config.modelUrl) {
    console.info(
      "AR 引擎已启动（无模型），请通过 ?model= 指定 .glb 文件 URL，例如：",
      `\n  ${window.location.origin}${window.location.pathname}?model=https://example.com/model.glb&tracking=image&scale=1.5`
    );
  }
}

main();
