import type { Engine } from '@/engine/core/Engine'
import { buildMiniProgramScene } from '@/engine/export/miniProgram'

export interface WechatComponentSource {
  wxml: string
  js: string
  json: string
  wxss: string
  sceneJsonText: string
}

/**
 * 生成可直接粘贴到微信小程序的自定义 xr-frame 组件源码。
 * 组件运行时会读取 scene-json 属性并动态挂载模型/网格到 xr-scene。
 */
export function buildWechatComponentSource(engine: Engine): WechatComponentSource {
  const scene = buildMiniProgramScene(engine)

  const wxml = `<xr-scene
  ar-system="modes:Plane Marker; planeMode:1; camera:Back"
  id="xr-scene"
  width="{{width}}"
  height="{{height}}"
  style="width:{{cw}}px;height:{{ch}}px;display:block;"
  bind:ready="onReady"
  bind:ar-ready="onArReady"
  bind:ar-error="onArError"
  bind:touchstart="onTouchStart"
  bind:touchmove="onTouchMove"
  bind:touchend="onTouchEnd"
  bind:tap="onTap"
>
  <xr-assets bind:loaded="onAssetsLoaded"></xr-assets>
  <xr-light type="ambient" color="1 1 1" intensity="1" />
  <xr-light type="directional" rotation="40 70 0" color="1 1 1" intensity="2" />
  <xr-node>
    <xr-ar-tracker mode="Plane" bind:tracker-switch="onTrackerSwitch"></xr-ar-tracker>
  </xr-node>
  <xr-shadow id="content-shadow" />
  <xr-camera id="camera" background="ar" is-ar-camera></xr-camera>
</xr-scene>
`

  const js = `const { createXrGameComponent } = require('../../utils/wxar-runtime.js')

Component(createXrGameComponent())
`

  const json = `{
  "component": true,
  "renderer": "xr-frame",
  "usingComponents": {}
}
`

  const wxss = `xr-scene {
  width: 100%;
  height: 100%;
  display: block;
}
`

  // 把场景 JSON 也附在注释里，方便页面直接传 scene-json
  const sceneJsonText = JSON.stringify(scene, null, 2)

  return {
    wxml,
    js,
    json,
    wxss,
    sceneJsonText,
  }
}

export function copyWechatComponentSource(engine: Engine): Promise<void> {
  const src = buildWechatComponentSource(engine)
  const text = [
    '// 微信小程序 xr-frame 组件源码',
    '// 1. 把 wxar-runtime.js 复制到 utils/wxar-runtime.js',
    '// 2. 用下面的 wxml/js/json/wxss 创建组件 xr-game-scene',
    '// 3. 页面里传 scene-json="{{sceneJson}}"',
    '// ============================================',
    '',
    '--- wxml ---',
    src.wxml,
    '--- js ---',
    src.js,
    '--- json ---',
    src.json,
    '--- wxss ---',
    src.wxss,
    '--- scene json ---',
    src.sceneJsonText,
  ].join('\n')

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
  return Promise.reject(new Error('当前环境不支持剪贴板 API'))
}
