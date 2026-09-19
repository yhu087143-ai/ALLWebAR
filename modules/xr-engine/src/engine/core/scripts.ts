import type { Engine } from './Engine'
import type { SceneNode } from './types'

/**
 * 脚本组件 —— 让节点拥有自定义行为，是「能做小游戏」的最后一环。
 *
 * 设计取舍：脚本存的是**源码字符串**，不是函数引用。
 *   - 可序列化（跟着项目文件走）
 *   - AI 可以直接生成源码塞进来（这正是「让 AI 操作引擎」的接口）
 *   - 代价是每次进入播放模式要 new Function 一次，但只发生一次，可接受
 *
 * 沙箱说明：new Function 不是安全沙箱，本地编辑器场景够用；
 * 若脚本要跑在不可信来源上，必须换成 Web Worker + 结构化克隆白名单。
 */
export interface ScriptContext {
  /** 宿主引擎（读写场景图的入口） */
  engine: Engine
  /** 挂了这个脚本的节点 id */
  nodeId: string
  /** 本帧与上一帧的时间差（秒） */
  delta: number
  /** 播放开始以来累计时间（秒） */
  time: number
  /** 输入状态（键盘按住了哪些键） */
  input: InputState
}

export interface ScriptInstance {
  onStart?: (ctx: ScriptContext) => void
  onUpdate?: (ctx: ScriptContext) => void
  onDestroy?: (ctx: ScriptContext) => void
}

export interface InputState {
  /** 当前按住的键（小写，如 'w' 'a'） */
  keys: Set<string>
  /** 本帧刚按下的键（消费后清空） */
  pressed: Set<string>
  /** 主指针/触摸位置（归一化 0-1），无输入为 null */
  pointer: { x: number; y: number } | null
  /** 本帧是否发生了点击/触摸 */
  clicked: boolean
}

export function createInputState(): InputState {
  return { keys: new Set(), pressed: new Set(), pointer: null, clicked: false }
}

/** 把源码字符串编译成脚本实例。编译错误就地报出，不让整条播放链崩掉 */
export function compileScript(source: string): ScriptInstance | null {
  try {
    // eslint-disable-next-line no-new-func
    const factory = new Function('engine', `"use strict";\n${source}`) as (
      engine: Engine
    ) => ScriptInstance
    // engine 在这里只为类型推断服务，实例本身由 PlayController 注入
    return factory(null as unknown as Engine)
  } catch (err) {
    console.error('[scripts] 编译失败：', err)
    return null
  }
}

/**
 * 脚本运行时。播放模式启动时编译全部脚本，每帧统一喂 update。
 */
export class ScriptRuntime {
  private instances: { node: SceneNode; script: ScriptInstance }[] = []
  private time = 0
  readonly input = createInputState()

  /** 编译并启动所有带脚本的节点。返回启动失败的节点名（用于 UI 提示） */
  start(engine: Engine): string[] {
    this.instances = []
    this.time = 0
    this.input.keys.clear()
    this.input.pressed.clear()
    const failures: string[] = []

    engine.graph.traverse((node) => {
      const source = node.script
      if (!source?.trim()) return
      const instance = compileScript(source)
      if (!instance) {
        failures.push(node.name)
        return
      }
      this.instances.push({ node, script: instance })
    })

    for (const { node, script } of this.instances) {
      try {
        script.onStart?.(this.ctx(engine, node.id, 0))
      } catch (err) {
        console.error('[scripts] onStart 抛错：', err)
      }
    }
    return failures
  }

  tick(engine: Engine, delta: number): void {
    this.time += delta
    for (const { node, script } of this.instances) {
      try {
        script.onUpdate?.(this.ctx(engine, node.id, delta))
      } catch (err) {
        // 单个脚本出错只跳过该帧，不拖死其他脚本
        console.error(`[scripts] 节点「${node.name}」onUpdate 抛错：`, err)
      }
    }
    // 「刚按下」是单帧语义，帧末清空
    this.input.pressed.clear()
    this.input.clicked = false
  }

  stop(engine: Engine): void {
    for (const { node, script } of this.instances) {
      try {
        script.onDestroy?.(this.ctx(engine, node.id, 0))
      } catch {
        /* 退出阶段错误直接吞掉 */
      }
    }
    this.instances = []
  }

  private ctx(engine: Engine, nodeId: string | null, delta: number): ScriptContext {
    return { engine, nodeId: nodeId ?? '', delta, time: this.time, input: this.input }
  }
}
