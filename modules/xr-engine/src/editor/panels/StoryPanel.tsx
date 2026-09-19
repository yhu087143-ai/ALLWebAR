import { useState } from 'react'
import { engine, useEditor } from '@/editor/store'
import { Section, TextField } from '@/editor/ui/controls'
import { Icon } from '@/editor/ui/Icon'

interface Choice {
  text: string
  next: string
}

interface StoryNode {
  id: string
  speaker?: string
  text: string
  next?: string
  choices?: Choice[]
}

const DEFAULT_NODES: StoryNode[] = [
  {
    id: 'intro',
    speaker: '向导',
    text: '欢迎来到 XR 世界。',
    next: 'choice1',
  },
  {
    id: 'choice1',
    speaker: '向导',
    text: '你想做什么？',
    choices: [
      { text: '开始冒险', next: 'start' },
      { text: '先看看', next: 'look' },
    ],
  },
  { id: 'start', speaker: '向导', text: '冒险开始！' },
  { id: 'look', speaker: '向导', text: '好的，慢慢来。' },
]

const DEFAULT_ANIM = `{
  "states": [
    { "name": "idle", "clip": "idle", "loop": true },
    { "name": "run", "clip": "run", "loop": true },
    { "name": "attack", "clip": "attack", "loop": false }
  ],
  "transitions": [
    { "from": "idle", "to": "run" },
    { "from": "run", "to": "idle" },
    { "from": "idle", "to": "attack" },
    { "from": "attack", "to": "idle" }
  ]
}`

const DEFAULT_TIMELINE = `{
  "id": "intro-camera",
  "duration": 4,
  "loop": false,
  "tracks": [
    {
      "targetId": "camera",
      "property": "position",
      "keyframes": [
        { "time": 0, "value": [0, 1, 3] },
        { "time": 4, "value": [0, 2, 6] }
      ]
    }
  ]
}`

const nodeKey = (n: StoryNode) => n.id || 'node'

function updateNode(nodes: StoryNode[], index: number, patch: Partial<StoryNode>): StoryNode[] {
  const next = [...nodes]
  next[index] = { ...next[index], ...patch }
  return next
}

export function StoryPanel() {
  const [nodes, setNodes] = useState<StoryNode[]>(DEFAULT_NODES)
  const [timelineText, setTimelineText] = useState(DEFAULT_TIMELINE)
  const [animText, setAnimText] = useState(DEFAULT_ANIM)
  const [prefabText, setPrefabText] = useState(`{
  "id": "plant",
  "name": "植物",
  "root": {
    "name": "植物",
    "type": "group",
    "children": [
      {
        "name": "叶子",
        "type": "mesh",
        "props": { "kind": "mesh", "geometry": "sphere", "geometryParams": { "radius": 0.3 }, "material": { "color": "#4caf50" } },
        "transform": { "position": [0, 0.3, 0] }
      }
    ]
  }
}`)
  const [taskText, setTaskText] = useState(`[
  {
    "id": "plant-3",
    "title": "种下三棵植物",
    "objectives": [
      { "id": "plant", "label": "植物数量", "target": 3 }
    ]
  }
]`)
  const [message, setMessage] = useState('')
  const projectName = useEditor((s) => s.projectName)
  const setProjectName = useEditor((s) => s.setProjectName)

  const applyDialogue = () => {
    try {
      engine.game.dialogue.unregister('editor')
      engine.game.dialogue.register('editor', nodes)
      setMessage('对话已应用到 GameRuntime，可用 interaction/trigger 启动')
    } catch (e) {
      setMessage('对话应用失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const applyTimeline = () => {
    try {
      const data = JSON.parse(timelineText)
      engine.game.timeline.play(data)
      setMessage('时间轴已播放')
    } catch (e) {
      setMessage('时间轴 JSON 错误：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const applyPrefab = () => {
    try {
      const p = JSON.parse(prefabText)
      engine.prefabs.register(p as never)
      setMessage('预制体已注册：' + p.name)
    } catch (e) {
      setMessage('预制体 JSON 错误：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const saveSelectedAsPrefab = () => {
    const state = useEditor.getState()
    const selectedId = state.selectedId
    if (!selectedId) {
      setMessage('请先选中一个节点再保存为预制体')
      return
    }
    const toNode = (id: string): Record<string, unknown> => {
      const n = state.nodes[id]
      if (!n) return {}
      return {
        name: n.name,
        type: n.type,
        transform: n.transform,
        props: n.props,
        children: (n.children ?? []).map((cid) => toNode(cid)),
      }
    }
    const root = toNode(selectedId)
    const prefab = {
      id: 'prefab_' + Date.now(),
      name: state.nodes[selectedId]?.name ?? 'Prefab',
      root,
    }
    engine.prefabs.register(prefab as never)
    setPrefabText(JSON.stringify(prefab, null, 2))
    setMessage('已从选中节点保存为预制体')
  }

  const applyAnim = () => {
    try {
      const data = JSON.parse(animText) as {
        states: { name: string; clip: string; loop?: boolean; speed?: number }[]
        transitions: { from: string; to: string }[]
      }
      engine.game.animator.clear()
      for (const st of data.states) {
        engine.game.animator.addState(st.name, { clip: st.clip, loop: st.loop, speed: st.speed })
      }
      for (const tr of data.transitions) {
        engine.game.animator.addTransition(tr.from, tr.to, (from, to) => from === tr.from && to === tr.to)
      }
      setMessage('动画状态机已应用')
    } catch (e) {
      setMessage('动画状态机 JSON 错误：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const applyTasks = () => {
    try {
      const list = JSON.parse(taskText) as { id: string; title: string; objectives: { id: string; label: string; target: number }[]; rewards?: string[]; dependsOn?: string[] }[]
      for (const t of list) engine.game.tasks.register(t)
      setMessage('任务已注册到 GameRuntime')
    } catch (e) {
      setMessage('任务 JSON 错误：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const save = () => {
    const ok = engine.game.saveGame()
    setMessage(ok ? '已保存到浏览器本地' : '保存失败')
  }

  const load = () => {
    const ok = engine.game.loadGame()
    setMessage(ok ? '已读取存档' : '没有可用存档')
  }

  return (
    <div>
      <Section title="剧情 / 对话节点">
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button className="btn" style={{ flex: 1 }} onClick={applyDialogue}>
            应用对话
          </button>
          <button
            className="btn"
            style={{ flex: 1 }}
            onClick={() => setNodes((n) => [...n, { id: `node${n.length + 1}`, text: '新的对话' }])}
          >
            + 添加节点
          </button>
        </div>

        {nodes.map((node, i) => (
          <div key={nodeKey(node) + i} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <TextField label="ID" value={node.id} onChange={(id) => setNodes((n) => updateNode(n, i, { id }))} />
              <TextField label="说话人" value={node.speaker ?? ''} onChange={(speaker) => setNodes((n) => updateNode(n, i, { speaker }))} />
              <button
                className="btn"
                style={{ flex: 'none', color: 'var(--danger)' }}
                onClick={() => setNodes((n) => n.filter((_, idx) => idx !== i))}
                title="删除节点"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
            <input
              className="textbox"
              style={{ width: '100%', marginBottom: 4 }}
              value={node.text}
              placeholder="对白内容"
              onChange={(e) => setNodes((n) => updateNode(n, i, { text: e.target.value }))}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <TextField label="下一节点" value={node.next ?? ''} onChange={(next) => setNodes((n) => updateNode(n, i, { next: next || undefined }))} />
            </div>
            {node.choices && (
              <div style={{ marginTop: 6 }}>
                <div className="hint">分支选项</div>
                {node.choices.map((choice, ci) => (
                  <div key={ci} style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <input
                      className="textbox"
                      style={{ flex: 1 }}
                      value={choice.text}
                      placeholder="选项文字"
                      onChange={(e) => {
                        setNodes((n) => {
                          const next = [...n]
                          const choices = [...(next[i].choices ?? [])]
                          choices[ci] = { ...choices[ci], text: e.target.value }
                          next[i] = { ...next[i], choices }
                          return next
                        })
                      }}
                    />
                    <input
                      className="textbox"
                      style={{ flex: 1 }}
                      value={choice.next}
                      placeholder="跳转节点"
                      onChange={(e) => {
                        setNodes((n) => {
                          const next = [...n]
                          const choices = [...(next[i].choices ?? [])]
                          choices[ci] = { ...choices[ci], next: e.target.value }
                          next[i] = { ...next[i], choices }
                          return next
                        })
                      }}
                    />
                    <button
                      className="btn"
                      style={{ flex: 'none', color: 'var(--danger)' }}
                      onClick={() => setNodes((n) => {
                        const next = [...n]
                        const choices = [...(next[i].choices ?? [])]
                        choices.splice(ci, 1)
                        next[i] = { ...next[i], choices }
                        return next
                      })}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                ))}
                <button
                  className="btn"
                  style={{ width: '100%', marginTop: 4 }}
                  onClick={() => setNodes((n) => {
                    const next = [...n]
                    next[i] = { ...next[i], choices: [...(next[i].choices ?? []), { text: '新选项', next: '' }] }
                    return next
                  })}
                >
                  + 添加选项
                </button>
              </div>
            )}
          </div>
        ))}
      </Section>

      <Section title="时间轴 / 过场">
        <textarea
          className="textbox"
          style={{ width: '100%', minHeight: 120, fontFamily: 'var(--mono)' }}
          value={timelineText}
          onChange={(e) => setTimelineText(e.target.value)}
        />
        <button className="btn" style={{ width: '100%', marginTop: 6 }} onClick={applyTimeline}>
          播放时间轴
        </button>
      </Section>

      <Section title="预制体（嵌套）">
        <textarea
          className="textbox"
          style={{ width: '100%', minHeight: 120, fontFamily: 'var(--mono)' }}
          value={prefabText}
          onChange={(e) => setPrefabText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button className="btn" style={{ flex: 1 }} onClick={applyPrefab}>应用预制体</button>
          <button className="btn" style={{ flex: 1 }} onClick={saveSelectedAsPrefab}>从选中节点保存</button>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          预制体可包含嵌套 children，微信导出时会完整保留节点树。
        </div>
      </Section>

      <Section title="动画状态机">
        <textarea
          className="textbox"
          style={{ width: '100%', minHeight: 100, fontFamily: 'var(--mono)' }}
          value={animText}
          onChange={(e) => setAnimText(e.target.value)}
        />
        <button className="btn" style={{ width: '100%', marginTop: 6 }} onClick={applyAnim}>
          应用动画状态机
        </button>
        <div className="hint" style={{ marginTop: 6 }}>
          当前状态：{engine.game.animator.current ?? '未设置'}。可在脚本中调用 engine.game.animator.setState('run')。
        </div>
      </Section>

      <Section title="任务系统">
        <textarea
          className="textbox"
          style={{ width: '100%', minHeight: 100, fontFamily: 'var(--mono)' }}
          value={taskText}
          onChange={(e) => setTaskText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button className="btn" style={{ flex: 1 }} onClick={applyTasks}>应用任务</button>
          <button className="btn" style={{ flex: 1 }} onClick={() => { engine.game.tasks.reset(); setMessage('任务进度已重置') }}>重置</button>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          任务进度可通过 DataDriven 的 trigger/interaction 或脚本调用 engine.game.tasks.add(taskId, objectiveId, amount)。
        </div>
      </Section>

      <Section title="存档">
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn" style={{ flex: 1 }} onClick={save}><Icon name="save" size={13} /> 保存</button>
          <button className="btn" style={{ flex: 1 }} onClick={load}><Icon name="folder-open" size={13} /> 读取</button>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          存档包含对话 flag、时间轴进度和世界状态。
        </div>
      </Section>

      <Section title="项目">
        <TextField label="项目名称" value={projectName} onChange={setProjectName} />
      </Section>

      {message && <div className="hint" style={{ padding: 8, color: 'var(--accent)' }}>{message}</div>}
    </div>
  )
}
