/**
 * wxar-runtime.js —— 微信小程序 xr-frame 游戏运行时（可复制到 wxar-mini 使用）
 *
 * 这个文件不依赖我们的 Web 编辑器，只有两个能力：
 * 1. 把导出的场景 JSON 动态挂载到 xr-scene 的 shadow 下
 * 2. 处理 GLTF 远程加载、mesh 几何、变换同步、AR 坐标对齐
 *
 * 用法：
 *   const { createXrGameComponent } = require('../../utils/wxar-runtime.js')
 *   Component(createXrGameComponent())
 */
'use strict'

// 微信 xr-frame 内置几何只有 cube/sphere/plane/cylinder；其余退化为近似形状
var GEOMETRY_NAMES = {
  box: 'cube',
  sphere: 'sphere',
  plane: 'plane',
  cylinder: 'cylinder',
  cone: 'cylinder',
  torus: 'sphere',
  icosahedron: 'sphere'
}

// AR 场景全局缩放：手机 AR 里内容锚在脚边地面，人眼距锚点仅 0.6~1.2m，
// Web 编辑器里 1m 级的球怼到 0.7m 距离就是满屏。挂载时对整个场景做一次
// 深度缩放，保证任意导出的 scene-data 比例与 Web 端逐字一致，
// AR 人体工学缩放只在这一处生效。
// 统一策略：只缩 transform（position/scale）+ 世界空间组件参数
// （轨迹点、moveTo target、spawner range）。geometryParams 一律不动——
// mesh/effect 节点的最终尺寸 = transform.scale × _geomScale(geometryParams)，
// 缩放 transform.scale 后盒/球/圆柱/平面的尺寸自动等比跟上；若连
// geometryParams.radius 也缩，球体半径会被乘两次（s²）。
// 注意防重入：同一个 sceneJson 重复挂载只缩放一次。
var AR_SCENE_SCALE = 0.5

function deepScaleSceneNodes(nodes, s) {
  var scaleVec = function (v) {
    if (!v || v.length !== 3) return v
    for (var i = 0; i < 3; i++) v[i] = v[i] * s
    return v
  }
  var walk = function (list) {
    for (var k = 0; k < list.length; k++) {
      var nd = list[k]
      if (!nd) continue
      var t = nd.transform
      if (t) {
        if (t.position) scaleVec(t.position)
        if (t.scale) scaleVec(t.scale)
      }
      var props = nd.props || {}
      var comps = props.components || []
      for (var ci = 0; ci < comps.length; ci++) {
        var c = comps[ci]
        if (!c) continue
        if ((c.type === 'path' || c.type === 'pathFollow') && Array.isArray(c.points)) {
          for (var pi = 0; pi < c.points.length; pi++) scaleVec(c.points[pi])
        }
        // moveTo 目标点是世界坐标，必须随场景等比缩
        if (c.type === 'moveTo' && Array.isArray(c.target)) scaleVec(c.target)
        // spawner/sunSpawner 的生成半径是世界距离，同样等比缩
        if ((c.type === 'spawn' || c.type === 'spawner' || c.type === 'sunSpawner') && typeof c.range === 'number') {
          c.range = c.range * s
        }
      }
      if (nd.children && nd.children.length) walk(nd.children)
    }
  }
  walk(nodes)
}

// 粒子预设 -> xr-particle 属性映射（fire/smoke/energy/snow）
var PARTICLE_PRESET_CFG = {
  fire: { lifeTime: '0.6 1.2', speed: '0.6 1.4', startColor: '1 0.55 0.2 1', startColor2: '1 0.8 0.3 1', endColor: '0.8 0.2 0.05 0', emitterType: 'CircleShape', emitterProps: 'radius:0.6,direction:0 1 0', gravity: -2 },
  smoke: { lifeTime: '2 3.5', speed: '0.2 0.5', startColor: '0.6 0.6 0.65 0.4', startColor2: '0.7 0.7 0.75 0.4', endColor: '0.9 0.9 0.9 0', emitterType: 'SphereShape', emitterProps: 'radius:0.5', gravity: -0.4 },
  energy: { lifeTime: '1 2', speed: '0.2 0.8', startColor: '0 0.9 1 1', startColor2: '0.4 1 1 1', endColor: '0 1 1 0', emitterType: 'SphereShape', emitterProps: 'radius:0.6,randomizeDirection:0.8', gravity: 0 },
  snow: { lifeTime: '2 4', speed: '0.3 0.8', startColor: '1 1 1 1', startColor2: '0.9 0.95 1 1', endColor: '1 1 1 0.1', emitterType: 'BoxShape', emitterProps: 'minEmitBox:-3 1 -3,maxEmitBox:3 2 3,direction:0 -1 0,direction2:0 -1 0', gravity: 1.5 }
}

function str(v) {
  return v == null ? '0' : String(v)
}

function vec3(v, fallback) {
  if (!v || v.length !== 3) return (fallback || '0 0 0')
  return str(v[0]) + ' ' + str(v[1]) + ' ' + str(v[2])
}

// 弧度 -> 度（xr-frame 的 rotation 属性按“度”解析）
function degVec3(v) {
  if (!v || v.length !== 3) return '0 0 0'
  return str(v[0] * 180 / Math.PI) + ' ' + str(v[1] * 180 / Math.PI) + ' ' + str(v[2] * 180 / Math.PI)
}

// 度 -> 弧度：从 xr-frame 节点读回来的 rotation 单位是度，做三角运算前必须换算
var DEG2RAD = Math.PI / 180

function colorToUniforms(c) {
  if (!c) return ''
  var hex = String(c).replace('#', '')
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  if (hex.length !== 6) return ''
  var r = parseInt(hex.slice(0, 2), 16) / 255
  var g = parseInt(hex.slice(2, 4), 16) / 255
  var b = parseInt(hex.slice(4, 6), 16) / 255
  return r.toFixed(3) + ' ' + g.toFixed(3) + ' ' + b.toFixed(3) + ' 1'
}

// 内置特效 id（含别名）-> xr-frame effect 资产名；未识别返回 null。
// 别名表与导出侧 compatibility.ts 的 KNOWN_EFFECTS 保持一致。
function fxEffectName(effect) {
  var e = String(effect || '')
  if (e === 'blackhole' || e === 'black-hole' || e === 'black_hole') return 'xr-engine-blackhole'
  if (e === 'energy' || e === 'energy-ball' || e === 'energy_ball') return 'xr-engine-energy'
  if (e === 'dissolve') return 'xr-engine-dissolve'
  if (e === 'hologram' || e === 'holo') return 'xr-engine-hologram'
  if (e === 'shockwave' || e === 'shock-wave' || e === 'shock_wave') return 'xr-engine-shockwave'
  return null
}

function makeXrGameComponent() {
  return {
    properties: {
      sceneJson: { type: String, value: '{}' },
      width: { type: Number, value: 750 },
      height: { type: Number, value: 1334 },
      cw: { type: Number, value: 375 },
      ch: { type: Number, value: 600 }
    },

    observers: {
      sceneJson: function (val) {
        this._pendingScene = this._parseScene(val)
        if (this._sceneReady) this._mountScene(this._pendingScene)
      }
    },

    lifetimes: {
      detached: function () {
        this._stopLoop()
        this._clearAll()
      }
    },

    methods: {
      onReady: function (e) {
        var scene = e && e.detail && e.detail.value
        if (!scene) return
        this._scene = scene
        this._xfs = (typeof wx !== 'undefined' && typeof wx.getXrFrameSystem === 'function')
          ? wx.getXrFrameSystem()
          : null
        var dbg = (this._pendingScene && this._pendingScene.debug) || {}
        // noAr 调试模式：内容挂到 tracker 外，绕过平面识别，用来隔离「tracker 未识别导致内容不显示」问题
        this._shadow = scene.getElementById(dbg.noAr ? 'free-shadow' : 'content-shadow') || scene.rootShadow
        if (dbg.noAr) this._log('调试模式 noAr=ON: 内容挂载在场景根，无需识别平面')
        this._nodeMap = {}
        this._nodeData = {}
        this._scripts = {}
        this._assetPromises = {}
        this._input = { keys: {}, pressed: {}, pointer: null, clicked: false }
        this._time = 0
        this._spawnTimes = {}
        this._quality = 'medium'
        this._autoDetectQuality()
        this._sceneReady = true
        this._cacheRect()
        this._log('XR 场景就绪')
        this._registerFxEffects()
        if (this._pendingScene) this._mountScene(this._pendingScene)
        this._startLoop()
        this.triggerEvent('sceneready', { scene: scene })
      },

      onArReady: function (e) {
        this._log('AR 系统就绪，等待识别平面')
        this.triggerEvent('arready', (e && e.detail) || {})
      },

      onArError: function (e) {
        this._log('AR 初始化失败', (e && e.detail) || {})
        this.triggerEvent('arerror', (e && e.detail) || {})
      },

      onAssetsLoaded: function (e) {
        if (e && e.detail && e.detail.errors && e.detail.errors.length) {
          console.warn('[wxar-runtime] asset errors', e.detail.errors)
        }
      },

      onTouchStart: function (e) {
        // rect 还没缓存到时先补一次查询（异步，本次触摸先用组件尺寸兜底）
        if (!this._rect) this._cacheRect()
        var p = this._touchPoint(e)
        if (p) {
          this._input.pointer = { x: p.x, y: p.y }
          // 注意：不在这里置 clicked。微信里一次点按会同时触发 touchstart 和
          // tap（tap 在 touchend 之后才到），两处都置位而 _update 每帧末清
          // clicked，会让一次点击在两帧里各消费一次（tapPlace 放两个、
          // collectible 双倍分）。点击判定统一走 onTap，这里只维护持续输入。
          this.triggerEvent('touchstart', p)
        }
        if (this._gestureTargetId) this._beginGesture(e)
      },

      onTouchMove: function (e) {
        var p = this._touchPoint(e)
        if (p) {
          this._input.pointer = { x: p.x, y: p.y }
          this.triggerEvent('touchmove', p)
        }
        this._applyGesture(e)
      },

      onTouchEnd: function (e) {
        var p = this._touchPoint(e)
        if (p) this.triggerEvent('touchend', p)
        if (!e.touches || e.touches.length === 0) this._gesture = null
      },

      onTap: function (e) {
        var p = this._touchPoint(e)
        if (p) {
          this._input.pointer = { x: p.x, y: p.y }
          // clicked 只在这里置位（唯一点击判定来源，见 onTouchStart 注释）
          this._input.clicked = true
          this.triggerEvent('tap', p)
        }
      },

      // 统一日志：console + 页面 UI 双通道，真机上不用开 vConsole 也能看到
      _log: function (msg, extra) {
        console.log('[wxar]', msg, extra !== undefined ? extra : '')
        this.triggerEvent('debuglog', {
          msg: msg,
          extra: extra == null ? '' : (typeof extra === 'string' ? extra : JSON.stringify(extra))
        })
      },

      onTrackerSwitch: function (e) {
        var d = (e && e.detail) || {}
        this._log(d.isShow || d.show ? '检测到平面，开始放置内容' : '平面丢失')
      },

      // CDN 预检：模型加载前先 HEAD 请求确认网络可达 + 文件大小 + 耗时
      _cdnProbe: function (url) {
        var self = this
        if (typeof wx === 'undefined' || !wx.request) return
        var t0 = Date.now()
        wx.request({
          url: url,
          method: 'HEAD',
          success: function (res) {
            var ms = Date.now() - t0
            var h = res.header || {}
            var len = h['Content-Length'] || h['content-length']
            var size = len ? (Math.round(len / 10485.76) / 100) + 'MB' : '大小未知'
            self._log('CDN预检: HTTP ' + res.statusCode + ', ' + size + ', 耗时 ' + ms + 'ms')
          },
          fail: function (err) {
            self._log('CDN预检失败: ' + ((err && err.errMsg) || err) + ' —— 模型肯定加载不了，检查域名白名单/网络')
          }
        })
      },

      setQuality: function (tier) {
        this._quality = tier === 'high' || tier === 'medium' ? tier : 'low'
        this.triggerEvent('quality', { tier: this._quality })
      },

      // 统一触摸坐标系：clientX/clientY 与 boundingClientRect 同为视口坐标，
      // pageX 仅作兜底（pageX 含滚动偏移，直接与 rect 混用会错位）
      _gestureXY: function (t) {
        if (!t) return null
        return {
          x: t.clientX != null ? t.clientX : (t.pageX || 0),
          y: t.clientY != null ? t.clientY : (t.pageY || 0)
        }
      },

      // 缓存组件在页面里的位置/尺寸：触摸坐标要换算成「相对组件左上角」的
      // 归一化坐标，不减偏移的话组件不在页面 (0,0) 时落点会整体漂移
      _cacheRect: function () {
        var self = this
        try {
          var q = self.createSelectorQuery && self.createSelectorQuery()
          if (!q) return
          q.select('#xr-scene').boundingClientRect(function (rect) {
            if (rect) {
              self._rect = {
                left: rect.left || 0,
                top: rect.top || 0,
                width: rect.width || self.data.cw || 375,
                height: rect.height || self.data.ch || 600
              }
            }
          }).exec()
        } catch (e) {}
      },

      _beginGesture: function (e) {
        var id = this._gestureTargetId
        var data = id && this._nodeData && this._nodeData[id]
        if (!data || !data.transform || !e.touches || !e.touches.length) return
        if (!data.transform.rotation) data.transform.rotation = [0, 0, 0]
        if (!data.transform.scale) data.transform.scale = [1, 1, 1]
        var p0 = this._gestureXY(e.touches[0])
        var p1 = this._gestureXY(e.touches[1])
        if (!p0) return
        this._gesture = {
          startX: p0.x,
          startY: p0.y,
          startDist: p1 ? Math.sqrt(Math.pow(p0.x - p1.x, 2) + Math.pow(p0.y - p1.y, 2)) : 0,
          startRotX: data.transform.rotation[0] || 0,
          startRotY: data.transform.rotation[1] || 0,
          startScale: Math.max(0.01, data.transform.scale[0] || 1)
        }
      },

      _applyGesture: function (e) {
        var self = this
        var id = this._gestureTargetId
        var g = this._gesture
        var data = id && this._nodeData && this._nodeData[id]
        if (!g || !data || !data.transform || !e.touches || !e.touches.length) return
        if (!data.transform.rotation) data.transform.rotation = [0, 0, 0]
        if (!data.transform.scale) data.transform.scale = [1, 1, 1]
        var p0 = this._gestureXY(e.touches[0])
        var p1 = this._gestureXY(e.touches[1])
        if (!p0) return
        if (e.touches.length === 1) {
          var dx = p0.x - g.startX
          var dy = p0.y - g.startY
          data.transform.rotation[1] = g.startRotY + dx * 0.01
          data.transform.rotation[0] = g.startRotX + dy * 0.01
          self.setTransform(id, data.transform)
        } else if (e.touches.length >= 2 && p1 && g.startDist > 0) {
          var dist = Math.sqrt(Math.pow(p0.x - p1.x, 2) + Math.pow(p0.y - p1.y, 2))
          var s = Math.max(0.1, Math.min(5, g.startScale * dist / g.startDist))
          data.transform.scale = [s, s, s]
          self.setTransform(id, data.transform)
        }
      },

      _touchPoint: function (e) {
        var t = (e && e.touches && e.touches[0]) || (e && e.changedTouches && e.changedTouches[0])
        if (!t) return null
        var p0 = this._gestureXY(t)
        var rect = this._rect
        var ox = rect ? rect.left : 0
        var oy = rect ? rect.top : 0
        var cw = (rect && rect.width) || this.data.cw || 375
        var ch = (rect && rect.height) || this.data.ch || 600
        return {
          // 相对组件左上角的归一化坐标（减掉组件在页面里的偏移）
          x: (p0.x - ox) / cw,
          y: (p0.y - oy) / ch,
          pageX: p0.x,
          pageY: p0.y
        }
      },

      _parseScene: function (val) {
        if (typeof val === 'object' && val !== null) return val
        try { return JSON.parse(val || '{}') } catch (e) { return {} }
      },

      _autoDetectQuality: function () {
        var self = this
        try {
          if (typeof wx === 'undefined' || !wx.getSystemInfoSync) return
          var info = wx.getSystemInfoSync()
          var platform = String(info.platform || info.system || '').toLowerCase()
          var model = String(info.model || '')
          var isIOS = platform.indexOf('ios') >= 0
          var oldIOS = /iphone\s*(6|7|8|se|xr|xs)/i.test(model)
          // 注意单位：getSystemInfoSync 的 memorySize/deviceMemory 是 MB；
          // performanceMatrix.ts 的 memoryGB 才是 GB（<4GB 判低配 ↔ 这里 <4096MB）
          var memMB = Number(info.memorySize || info.deviceMemory || 0)
          var lowAndroid = platform.indexOf('android') >= 0 && memMB > 0 && memMB < 4096
          var tier = 'medium'
          if (oldIOS || lowAndroid) tier = 'low'
          else if (isIOS) tier = 'high'
          this._quality = tier
          this._log('设备画质档位: ' + tier + ' (' + platform + ')')
          this._fpsFrames = 0
          this._fpsBase = this._time || 0
          this._fpsChecked = false
          this.triggerEvent('quality', { tier: tier, auto: true, model: model, platform: platform })
        } catch (e) {
          console.warn('[wxar-runtime] auto quality failed', e)
        }
      },

      _updateFpsMonitor: function () {
        if (!this._fpsFrames) this._fpsFrames = 0
        if (!this._fpsBase) this._fpsBase = this._time
        this._fpsFrames++
        if (this._time - this._fpsBase < 3) return
        var fps = this._fpsFrames / Math.max(0.001, this._time - this._fpsBase)
        this._fpsFrames = 0
        this._fpsBase = this._time
        if (fps < 18 && this._quality !== 'low') {
          this._quality = 'low'
          this.triggerEvent('quality', { tier: 'low', auto: true, reason: 'fps', fps: Math.round(fps) })
        } else if (fps > 50 && this._quality === 'low' && !this._fpsChecked) {
          // 允许低端机后期升回中档一次
          this._quality = 'medium'
          this._fpsChecked = true
          this.triggerEvent('quality', { tier: 'medium', auto: true, reason: 'fps-up', fps: Math.round(fps) })
        }
      },

      _startLoop: function () {
        if (this._loopTimer) return
        var self = this
        this._hbCount = 0
        this._hbStart = Date.now()
        this._loopTimer = setInterval(function () {
          self._update(1 / 60)
          self._updateFpsMonitor()
          // 心跳日志：证明帧循环在跑 + 估算逻辑帧率 + 已挂载节点数
          self._hbCount++
          if (self._hbCount === 60 || self._hbCount % 900 === 0) {
            var sec = (Date.now() - self._hbStart) / 1000
            var fps = Math.round(self._hbCount / sec)
            var nObj = 0
            for (var k in self._nodeMap) { if (self._nodeMap[k]) nObj++ }
            self._log('心跳: 逻辑帧率~' + fps + 'fps, 挂载节点:' + nObj + ', 场景时间 ' + self._time.toFixed(1) + 's')
          }
        }, 16)
      },

      _stopLoop: function () {
        if (this._loopTimer) {
          clearInterval(this._loopTimer)
          this._loopTimer = null
        }
      },

      _update: function (dt) {
        dt = dt || 0.016
        this._time += dt
        var self = this
        if (this._fxMaterialRefs) {
          for (var fxKey in this._fxMaterialRefs) {
            var fxMat = this._fxMaterialRefs[fxKey]
            if (fxMat && fxMat.setFloat) {
              try { fxMat.setFloat('uTime', this._time) } catch (e) {}
            }
          }
        }
        if (this._customMaterials) {
          for (var cmKey in this._customMaterials) {
            var cm = this._customMaterials[cmKey]
            if (cm && cm.setFloat) {
              try { cm.setFloat('uTime', this._time) } catch (e) {}
            }
          }
        }
        for (var id in this._nodeData) {
          var node = this._nodeData[id]
          var obj = this._nodeMap[id]
          if (!node || !obj) continue
          this._applyComponents(node, obj, dt)
          var script = this._scripts[id]
          if (script && script.instance && script.instance.onUpdate) {
            script.ctx.delta = dt
            script.ctx.time = this._time
            try { script.instance.onUpdate(script.ctx) } catch (e) { console.error('[wxar-runtime] script update error', id, e) }
          }
        }
        this._input.clicked = false
        this._input.pressed = {}
      },

      _applyComponents: function (node, obj, dt) {
        var comps = (node.props && node.props.components) || node.components || []
        var self = this
        for (var i = 0; i < comps.length; i++) {
          var c = comps[i] || {}
          if (!c.type) continue
          if (!node.transform) node.transform = { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] }
          if (!node.transform.rotation) node.transform.rotation = [0,0,0]
          if (!node.transform.position) node.transform.position = [0,0,0]
          if (c.type === 'spin') {
            node.transform.rotation[1] += (c.speed || 1) * dt
            self.setTransform(node.id, node.transform)
          } else if (c.type === 'bob') {
            node.transform.position[1] += Math.sin(self._time * (c.speed || 2)) * 0.01
            self.setTransform(node.id, node.transform)
          } else if (c.type === 'move') {
            var v = c.velocity || [0, 0, 0]
            node.transform.position[0] += v[0] * dt
            node.transform.position[1] += v[1] * dt
            node.transform.position[2] += v[2] * dt
            self.setTransform(node.id, node.transform)
          } else if (c.type === 'pathFollow') {
            self._handlePathFollow(node, c, obj, dt)
          } else if (c.type === 'tapGame') {
            if (self._input && self._input.clicked) self._handleTapGame()
          } else if (c.type === 'tapPlace') {
            self._handleTapPlace(node, c)
          } else if (c.type === 'spawn' || c.type === 'spawner') {
            self._handleSpawn(node, c, dt)
          } else if (c.type === 'sunSpawner') {
            self._handleSunSpawn(node, c, dt)
          } else if (c.type === 'shooter') {
            self._handleShooter(node, c, dt)
          } else if (c.type === 'moveTo') {
            self._handleMoveTo(node, c, dt)
          } else if (c.type === 'collision') {
            self._handleCollision(node, c, dt)
          } else if (c.type === 'collectible') {
            self._handleCollectible(node, c, dt)
          }
        }
      },

      /**
       * 轨迹跟随：与 Web 端 NodeRenderer.FollowController 行为对齐。
       * pathFollow 组件可内嵌 points 数组，也可通过 pathId 引用另一节点的
       * path 组件（微信端按导出的 JSON 节点表查找，不依赖运行时图）。
       * 坐标系：点集按「父级局部坐标」解释。地面画线场景父链为恒等变换，
       * 与 Web 端的「世界坐标 + worldToLocal」语义等价；Web 端 local=true
       * 的嵌套轨道（卫星绕行星）在本端天然就是局部语义，直接支持。
       * 采样：真线段 centripetal Catmull-Rom 平滑行走；假线段（path.ghost 段索引）
       * 零时间瞬移跳过；loop 周而复始 / pingpong 往返 / once 走到尽头停下。
       * faceDirection（默认开）：节点随轨迹切线转向（平滑插值），pingpong 反向段自动掉头。
       */
      _handlePathFollow: function (node, c, obj, dt) {
        if (!node.transform) return
        var comp = null
        if (Array.isArray(c.points) && c.points.length >= 2) {
          comp = { points: c.points, closed: false, ghost: c.ghost }
        } else if (c.pathId) {
          var pathNode = this._nodeData && this._nodeData[c.pathId]
          if (!pathNode) return
          var pComps = (pathNode.props && pathNode.props.components) || pathNode.components || []
          for (var i = 0; i < pComps.length; i++) {
            if (pComps[i] && pComps[i].type === 'path') {
              comp = pComps[i]
              break
            }
          }
        }
        if (!comp || !Array.isArray(comp.points) || comp.points.length < 2) return
        var pts = comp.points

        // 一次性构建时间线查表（点数/闭环/假线任一变化即重建）
        if (!this._pathCurves) this._pathCurves = {}
        var curveKey = c.pathId || String(node.id)
        var sig = pts.length + ':' + (comp.closed ? 1 : 0) + ':' + (Array.isArray(comp.ghost) ? comp.ghost.join(',') : '')
        var rt = this._pathCurves[curveKey]
        if (!rt || rt._sig !== sig) {
          rt = this._buildPathRuntime(comp)
          if (!rt) return
          rt._sig = sig
          this._pathCurves[curveKey] = rt
        }

        var duration = (c.duration && c.duration > 0.05) ? c.duration : 5
        if (!node._pfLogged) {
          node._pfLogged = true
          var ghostCount = Array.isArray(comp.ghost) ? comp.ghost.length : 0
          this._log('轨迹跟随启动: ' + pts.length + ' 点 / ' + rt.runs.length + ' 真线段 / ' + ghostCount + ' 假线段 / ' + duration + 's / ' + (c.loop || 'loop') + ' / 转向' + (c.faceDirection !== false ? '开' : '关'))
        }
        var elapsed = this._time
        var T = rt.totalReal
        var d
        var dirSign = 1
        if (c.loop === 'once') {
          var tOnce = elapsed / duration
          if (tOnce < 0) tOnce = 0
          if (tOnce > 1) tOnce = 1
          d = tOnce * T
        } else if (c.loop === 'pingpong') {
          var phase = (elapsed / duration) % 2
          dirSign = phase < 1 ? 1 : -1
          var tP = phase < 1 ? phase : 2 - phase
          if (tP < 0) tP = 0
          if (tP > 1) tP = 1
          d = tP * T
        } else {
          d = ((elapsed / duration) % 1) * T
        }

        var p = this._samplePathDistance(rt, d)
        if (!p) return
        node.transform.position[0] = p[0]
        node.transform.position[1] = p[1]
        node.transform.position[2] = p[2]

        // 面向行进方向：切线偏航角 + 最短角差平滑插值（与 Web 端一致）。
        // 跨假线时 q-p 即瞬移方向，角色会转向落点方向再「闪现」。
        if (c.faceDirection !== false) {
          var eps = Math.max(T * 0.01, 1e-4)
          var dAhead = d + dirSign * eps
          if (dAhead < 0) dAhead = 0
          if (dAhead > T) dAhead = T
          var q = this._samplePathDistance(rt, dAhead)
          if (q) {
            var dx = q[0] - p[0]
            var dz = q[2] - p[2]
            if (dx * dx + dz * dz > 1e-10) {
              var targetYaw = Math.atan2(dx, dz)
              var cur = node._yaw == null ? targetYaw : node._yaw
              var diff = targetYaw - cur
              diff = Math.atan2(Math.sin(diff), Math.cos(diff))
              var yaw = cur + diff * Math.min(1, (dt || 0.016) * 8)
              node._yaw = yaw
              if (!node.transform.rotation) node.transform.rotation = [0, 0, 0]
              node.transform.rotation[1] = yaw
            }
          }
        }

        this.setTransform(node.id, node.transform)
      },

      // ---- 统一路径时间线：真线段（行走）+ 假线段（瞬移），与 Web 端逐字对齐 ----
      _buildPathRuntime: function (comp) {
        var src = comp && comp.points
        var pts = []
        for (var i = 0; i < src.length; i++) {
          var p = src[i]
          if (p && p.length === 3 && isFinite(p[0]) && isFinite(p[1]) && isFinite(p[2])) {
            pts.push([p[0], p[1], p[2]])
          }
        }
        if (pts.length < 2) return null
        var n = pts.length
        var closed = Boolean(comp.closed) && n >= 3
        var segCount = closed ? n : n - 1
        var ghost = {}
        if (Array.isArray(comp.ghost)) {
          for (var gi = 0; gi < comp.ghost.length; gi++) ghost[comp.ghost[gi]] = true
        }

        // 连续真线段串成链；假线段是链之间的瞬移跳板
        var chains = []
        var cur = []
        for (var s = 0; s < segCount; s++) {
          if (ghost[s]) {
            if (cur.length) chains.push(cur)
            cur = []
          } else {
            cur.push(s)
          }
        }
        if (cur.length) chains.push(cur)
        if (!chains.length) return null

        var runsRaw = []
        var anyGhost = false
        for (var k in ghost) { anyGhost = true; break }
        if (closed && !anyGhost) {
          // 闭环且全部是真线：单条闭合曲线（接缝圆滑）
          runsRaw.push({ pts: pts, closed: true })
        } else {
          for (var ci = 0; ci < chains.length; ci++) {
            var chain = chains[ci]
            var rp = [pts[chain[0]]]
            for (var si = 0; si < chain.length; si++) {
              var sIdx = chain[si]
              rp.push(sIdx === n - 1 ? pts[0] : pts[sIdx + 1])
            }
            runsRaw.push({ pts: rp, closed: false })
          }
        }

        var runs = []
        var dStart = 0
        for (var ri = 0; ri < runsRaw.length; ri++) {
          var curve = this._buildCatmullRom(runsRaw[ri].pts, runsRaw[ri].closed)
          if (!curve || !(curve.totalLen > 0)) continue
          runs.push({ curve: curve, len: curve.totalLen, dStart: dStart })
          dStart += curve.totalLen
        }
        if (!runs.length) return null
        return { runs: runs, totalReal: dStart }
      },

      // 按弧长距离采样：真线段内插值，假线段零长度天然跳过（瞬移）
      _samplePathDistance: function (rt, dIn) {
        if (!rt || !rt.runs || !rt.runs.length) return null
        if (!(rt.totalReal > 1e-9)) {
          var c0 = rt.runs[0].curve
          return [c0.pts[0][0], c0.pts[0][1], c0.pts[0][2]]
        }
        var d = dIn
        if (d < 0) d = 0
        if (d > rt.totalReal) d = rt.totalReal
        for (var i = 0; i < rt.runs.length; i++) {
          var run = rt.runs[i]
          if (d <= run.dStart + run.len || i === rt.runs.length - 1) {
            var local = run.len > 1e-9 ? (d - run.dStart) / run.len : 0
            if (local < 0) local = 0
            if (local > 1) local = 1
            return this._sampleCatmullRom(run.curve, local)
          }
        }
        return null
      },

      // Catmull-Rom 构建：存控制点表 + 弧长归一化采样表，复用 Web 端的 centripetal 策略
      _buildCatmullRom: function (pts, closed) {
        var pts3 = []
        for (var i = 0; i < pts.length; i++) {
          var p = pts[i]
          if (!p || p.length < 3) continue
          pts3.push([Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0])
        }
        // 去掉相邻重复点：零长度段会让 centripetal 节点 k2==k1，
        // 采样时 (k2-k1) 作分母 0/0 出 NaN，整段轨迹消失
        var dedup = []
        for (var di = 0; di < pts3.length; di++) {
          var dp = pts3[di]
          var dq = dedup[dedup.length - 1]
          if (!dq || Math.abs(dp[0] - dq[0]) > 1e-9 || Math.abs(dp[1] - dq[1]) > 1e-9 || Math.abs(dp[2] - dq[2]) > 1e-9) {
            dedup.push(dp)
          }
        }
        // 闭环时首尾重复同样是零长度段
        if (closed && dedup.length > 1) {
          var fp = dedup[0]
          var lp = dedup[dedup.length - 1]
          if (Math.abs(fp[0] - lp[0]) <= 1e-9 && Math.abs(fp[1] - lp[1]) <= 1e-9 && Math.abs(fp[2] - lp[2]) <= 1e-9) {
            dedup.pop()
          }
        }
        pts3 = dedup
        if (pts3.length < 2) return null
        // 去重后不足 3 个点撑不起闭环，退化为开放路径
        if (closed && pts3.length < 3) closed = false

        var n = pts3.length
        var segCount = closed ? n : n - 1
        var segs = []
        var totalLen = 0
        for (var s = 0; s < segCount; s++) {
          var p0 = pts3[(s - 1 + n) % n]
          var p1 = pts3[s % n]
          var p2 = pts3[(s + 1) % n]
          var p3 = pts3[(s + 2) % n]
          if (!closed) {
            if (s === 0) p0 = p1
            if (s === segCount - 1) p3 = p2
          }
          // centripetal: 用弦长的平方根作为节点间距，避免自相交环路
          var d1 = Math.sqrt(Math.pow(p1[0]-p0[0],2)+Math.pow(p1[1]-p0[1],2)+Math.pow(p1[2]-p0[2],2))
          var d2 = Math.sqrt(Math.pow(p2[0]-p1[0],2)+Math.pow(p2[1]-p1[1],2)+Math.pow(p2[2]-p1[2],2))
          var d3 = Math.sqrt(Math.pow(p3[0]-p2[0],2)+Math.pow(p3[1]-p2[1],2)+Math.pow(p3[2]-p2[2],2))
          var k1 = Math.pow(d1, 0.5)
          var k2 = k1 + Math.pow(d2, 0.5)
          var k3 = k2 + Math.pow(d3, 0.5)
          var segLen = d2
          segs.push({ p0: p0, p1: p1, p2: p2, p3: p3, k1: k1, k2: k2, k3: k3, len: segLen })
          totalLen += segLen
        }
        // 按弧长归一化的累积查表
        var cum = []
        var acc = 0
        for (var s2 = 0; s2 < segs.length; s2++) {
          acc += segs[s2].len
          cum.push(acc / Math.max(0.0001, totalLen))
        }
        return { pts: pts3, segs: segs, cum: cum, totalLen: totalLen }
      },

      // 弧长归一化采样：先定位线段，再做 centripetal Catmull-Rom 插值
      _sampleCatmullRom: function (curve, t) {
        if (!curve || !curve.segs || !curve.segs.length) return null
        var cum = curve.cum
        var idx = 0
        var local = 0
        if (t >= 1) {
          idx = curve.segs.length - 1
          local = 1
        } else {
          while (idx < cum.length - 1 && t > cum[idx]) idx++
          var lo = idx > 0 ? cum[idx - 1] : 0
          var hi = cum[idx]
          local = (hi - lo) > 1e-6 ? (t - lo) / (hi - lo) : 0
        }
        var seg = curve.segs[idx]
        // centripetal 节点：t0=0, t1=k1, t2=k2, t3=k3；本段插值区间 [t1, t2]
        var u = seg.k1 + local * (seg.k2 - seg.k1)
        var b1 = (seg.k2 - u) / seg.k2 * seg.p0[0] + (u / seg.k2) * seg.p1[0]
        var b1y = (seg.k2 - u) / seg.k2 * seg.p0[1] + (u / seg.k2) * seg.p1[1]
        var b1z = (seg.k2 - u) / seg.k2 * seg.p0[2] + (u / seg.k2) * seg.p1[2]
        var b2 = (seg.k3 - u) / (seg.k3 - seg.k1) * seg.p1[0] + (u - seg.k1) / (seg.k3 - seg.k1) * seg.p2[0]
        var b2y = (seg.k3 - u) / (seg.k3 - seg.k1) * seg.p1[1] + (u - seg.k1) / (seg.k3 - seg.k1) * seg.p2[1]
        var b2z = (seg.k3 - u) / (seg.k3 - seg.k1) * seg.p1[2] + (u - seg.k1) / (seg.k3 - seg.k1) * seg.p2[2]
        var w1 = (seg.k2 - u) / (seg.k2 - seg.k1)
        var w2 = (u - seg.k1) / (seg.k2 - seg.k1)
        return [
          w1 * b1 + w2 * b2,
          w1 * b1y + w2 * b2y,
          w1 * b1z + w2 * b2z
        ]
      },

      _spawnId: function (prefix) {
        return (prefix || 'n') + '_' + Date.now() + '_' + Math.floor(Math.random() * 100000)
      },

      _spawnNode: function (prefab, parent) {
        if (!prefab) return null
        var copy = JSON.parse(JSON.stringify(prefab))
        if (!copy.id) copy.id = this._spawnId(copy.name || 'spawned')
        copy.id = this._spawnId(copy.name || 'spawned')
        return this._mountNode(copy, parent || this._shadow || null)
      },

      _handleSpawn: function (node, c, dt) {
        var self = this
        var last = self._spawnTimes[node.id] || 0
        if (self._time - last < (c.interval || 3)) return
        self._spawnTimes[node.id] = self._time
        var parent = node._parent || self._shadow
        if (c.prefab) self._spawnNode(c.prefab, parent)
      },

      _handleSunSpawn: function (node, c, dt) {
        var self = this
        var last = self._spawnTimes[node.id] || 0
        if (self._time - last < (c.interval || 4)) return
        self._spawnTimes[node.id] = self._time
        var prefab = c.prefab || {
          id: self._spawnId('sun'),
          name: '太阳',
          type: 'mesh',
          props: {
            kind: 'mesh',
            geometry: 'sphere',
            effect: 'energy',
            geometryParams: { radius: 0.35 },
            material: { color: '#ffe082' }
          },
          transform: {
            position: [0, 0.8, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          }
        }
        prefab = JSON.parse(JSON.stringify(prefab))
        prefab.id = self._spawnId('sun')
        var range = c.range || 4
        prefab.transform = prefab.transform || { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] }
        prefab.transform.position = [
          (Math.random() * 2 - 1) * range,
          0.8,
          (Math.random() * 2 - 1) * range
        ]
        if (!prefab.props) prefab.props = {}
        prefab.props.components = prefab.props.components || []
        prefab.props.components.push({ type: 'collectible', score: 10 })
        var parent = node._parent || self._shadow
        self._mountNode(prefab, parent)
      },

      _handleShooter: function (node, c, dt) {
        var self = this
        var last = self._spawnTimes[node.id] || 0
        if (self._time - last < (c.interval || 1.2)) return
        self._spawnTimes[node.id] = self._time
        var prefab = c.prefab || {
          id: self._spawnId('pea'),
          name: '豌豆',
          type: 'mesh',
          props: {
            kind: 'mesh',
            geometry: 'sphere',
            geometryParams: { radius: 0.12 },
            effect: 'energy',
            material: { color: '#aeea00' }
          },
          transform: {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          }
        }
        prefab = JSON.parse(JSON.stringify(prefab))
        prefab.id = self._spawnId('pea')
        prefab.transform = prefab.transform || { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] }
        prefab.transform.position = [node.transform.position[0], node.transform.position[1] + 0.3, node.transform.position[2]]
        prefab.props = prefab.props || {}
        prefab.props.components = prefab.props.components || []
        prefab.props.components.push({ type: 'move', velocity: c.velocity || [3, 0, 0] })
        var parent = node._parent || self._shadow
        self._mountNode(prefab, parent)
      },

      _handleMoveTo: function (node, c, dt) {
        if (!node.transform) return
        var self = this
        var target = c.target || [0, 0, 0]
        var dir = [
          target[0] - node.transform.position[0],
          target[1] - node.transform.position[1],
          target[2] - node.transform.position[2]
        ]
        var len = Math.sqrt(dir[0]*dir[0] + dir[1]*dir[1] + dir[2]*dir[2])
        if (len < 0.05) return
        var speed = c.speed || 1
        var k = Math.min(1, (speed * dt) / len)
        node.transform.position[0] += dir[0] * k
        node.transform.position[1] += dir[1] * k
        node.transform.position[2] += dir[2] * k
        self.setTransform(node.id, node.transform)
      },

      _handleCollision: function (node, c, dt) {
        var self = this
        var peas = []
        var zombies = []
        for (var id in self._nodeData) {
          var n = self._nodeData[id]
          if (!n || !n.name || !n.transform) continue
          if (n.name.indexOf('豌豆') === 0) peas.push({ id: id, t: n.transform.position })
          else if (n.name.indexOf('僵尸') === 0) zombies.push({ id: id, t: n.transform.position })
        }
        for (var i = 0; i < peas.length; i++) {
          for (var j = 0; j < zombies.length; j++) {
            var dx = peas[i].t[0] - zombies[j].t[0]
            var dz = peas[i].t[2] - zombies[j].t[2]
            if (Math.sqrt(dx*dx + dz*dz) < 0.85) {
              self.removeNode(peas[i].id)
              self.removeNode(zombies[j].id)
              if (self._score == null) self._score = 0
              self._score += 20
              self.triggerEvent('hud', { sun: self._score, message: '击杀僵尸 +20' })
              return
            }
          }
        }
      },

      _handleCollectible: function (node, c, dt) {
        var self = this
        if (!self._input || !self._input.clicked) return
        // 简单逻辑：点击任意位置得分，并移除当前 collectible
        if (self._score == null) self._score = 0
        self._score += (c.score || 10)
        self.removeNode(node.id)
        self._input.clicked = false
        self.triggerEvent('hud', { sun: self._score, message: '收集 +' + (c.score || 10) })
      },

      _getVec3Attr: function (obj, name) {
        if (!obj) return null
        if (obj[name]) {
          var o = obj[name]
          if (typeof o.x === 'number') return [o.x, o.y, o.z]
          if (Array.isArray(o)) return [o[0], o[1], o[2]]
        }
        try {
          if (obj.getAttribute) {
            var raw = obj.getAttribute(name)
            if (typeof raw === 'string') {
              var parts = raw.trim().split(/\s+/).map(Number)
              if (parts.length >= 3 && parts.every(isFinite)) return parts.slice(0, 3)
            }
          }
        } catch (e) {}
        return null
      },

      // 参考 wxar-mini：AR 相机在 xr-scene 的 camera 节点，拿到位姿后
      // 用“朝前 distance 米”作为放置点，相当于平面落点。
      _cameraGroundPoint: function (distance, height) {
        var scene = this._scene
        if (!scene) return null
        var cam = null
        try {
          cam = scene.getElementById ? scene.getElementById('camera') : null
        } catch (e) {}
        if (!cam && scene.camera) cam = scene.camera
        if (!cam) return null
        var pos = this._getVec3Attr(cam, 'position')
        var rot = this._getVec3Attr(cam, 'rotation')
        if (!pos) return null
        // xr-frame 读回的 rotation 单位是“度”（见 degVec3 的约定），三角运算前先转弧度
        var yaw = rot ? rot[1] * DEG2RAD : 0
        var pitch = rot ? rot[0] * DEG2RAD : 0
        var d = Number(distance || 1.5)
        var dx = -Math.sin(yaw) * Math.cos(pitch)
        var dy = Math.sin(pitch)
        var dz = -Math.cos(yaw) * Math.cos(pitch)
        var x = pos[0] + dx * d
        var z = pos[2] + dz * d
        var y = Math.max(height || 0, pos[1] + dy * d)
        return { x: x, y: y, z: z }
      },

      _handleTapPlace: function (node, c) {
        var self = this
        if (!self._input || !self._input.clicked || !c.prefab) return
        self._input.clicked = false
        var p = self._input.pointer || { x: 0.5, y: 0.5 }
        // 优先使用 AR 相机位姿做真实放置；拿不到相机再用固定范围
        var point = self._cameraGroundPoint(c.distance || 1.5, c.y || 0)
        // 用横向触摸偏移把落点从屏幕中心移到手指位置
        if (point && p) {
          var rot = self._getVec3Attr(self._scene && (self._scene.getElementById ? self._scene.getElementById('camera') : null) || (self._scene && self._scene.camera), 'rotation')
          // 相机 rotation 单位是度，转弧度后再做三角运算
          var yaw2 = (rot ? rot[1] : 0) * DEG2RAD
          var lateral = (p.x - 0.5) * (c.width || 3)
          point.x += Math.cos(yaw2) * lateral
          point.z += -Math.sin(yaw2) * lateral
        }
        if (!point) {
          var width = c.width || 10
          var depth = c.depth || 10
          point = {
            x: (p.x - 0.5) * width,
            y: c.y || 0,
            z: (p.y - 0.5) * depth
          }
        }
        var prefab = JSON.parse(JSON.stringify(c.prefab))
        prefab.id = self._spawnId(prefab.name || 'placed')
        prefab.transform = prefab.transform || { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
        prefab.transform.position = [point.x, point.y, point.z]
        var parent = node._parent || self._shadow
        var prefabProps = prefab.props || {}
        var isDirectModel = prefab.type === 'model' || prefabProps.modelUrl || prefabProps.src
        var created = null
        if (isDirectModel && (prefabProps.modelUrl || prefabProps.src || (prefab.asset && prefab.asset.uri))) {
          // 模型是异步加载的；先创建空容器并注册，让 placeHere 能立刻定位，模型加载后再挂进去
          try {
            var assetId = prefabProps.assetId || ('model_' + String(prefab.id).replace(/[^a-zA-Z0-9_]/g, '_'))
            var url = prefabProps.modelUrl || prefabProps.src || (prefab.asset && prefab.asset.uri) || ''
            var xfs = self._xfs
            var wrapper = self._scene.createElement(xfs.XRNode, {
              position: vec3(prefab.transform && prefab.transform.position),
              rotation: degVec3(prefab.transform && prefab.transform.rotation),
              scale: vec3(prefab.transform && prefab.transform.scale, '1 1 1')
            })
            if (prefab.id) wrapper.setId(String(prefab.id))
            parent.addChild(wrapper)
            self._nodeMap[prefab.id] = wrapper
            self._registerNodeLogic(prefab, wrapper)
            self._createModelNode(prefab, assetId, url, parent, wrapper)
            created = wrapper
          } catch (e) {
            console.warn('[wxar-runtime] model placeholder failed', e)
            created = self._mountNode(prefab, parent)
          }
        } else {
          created = self._mountNode(prefab, parent)
        }
        // 官方 xr-frame 精确 AR 平面放置：scene.ar.placeHere(nodeId, true)
        // 参考 dtysky/xr-frame-demo xr-ar-vio-marker 组件
        if (created && self._scene && self._scene.ar && typeof self._scene.ar.placeHere === 'function') {
          try {
            self._scene.ar.placeHere(prefab.id, true)
          } catch (e) {
            console.warn('[wxar-runtime] placeHere failed', e)
          }
        }
        self._gestureTargetId = prefab.id
        self._gesture = null
        self.triggerEvent('hud', { message: '已放置' })
      },

      _handleTapGame: function () {
        var self = this
        if (self._score == null) self._score = 0
        // 简单版：点击一次移除一个能量球并得分；没有球时随机生成一个
        var ballId = null
        for (var id in self._nodeData) {
          var name = self._nodeData[id].name || ''
          if (name.indexOf('能量球') === 0 && self._nodeMap[id]) {
            ballId = id
            break
          }
        }
        if (ballId) {
          self._score += 10
          self.removeNode(ballId)
          self.triggerEvent('hud', { sun: self._score, message: '击中能量球 +10' })
        } else {
          var parent = self._shadow
          if (parent) {
            var n = {
              id: 'ball_' + Date.now(),
              name: '能量球' + Date.now(),
              type: 'mesh',
              props: {
                kind: 'mesh',
                geometry: 'sphere',
                geometryParams: { radius: 0.4 },
                material: { color: '#ff5252', metalness: 0.1, roughness: 0.6 }
              },
              transform: {
                position: [Math.random() * 4 - 2, 0.6, Math.random() * 4 - 2],
                rotation: [0, 0, 0],
                scale: [1, 1, 1]
              }
            }
            self._mountNode(n, parent)
          }
          self.triggerEvent('hud', { sun: self._score, message: '点击生成能量球' })
        }
      },

      _registerNodeLogic: function (node, obj) {
        if (!node || !node.id) return
        this._nodeData[node.id] = node
        var scriptSrc = node.script
        if (scriptSrc) this._startScript(node, obj, scriptSrc)
      },

      _startScript: function (node, obj, scriptSrc) {
        var self = this
        try {
          // 编辑器导出的脚本是字符串形式的函数体，返回 { onStart, onUpdate }
          var factory = new Function('return (' + scriptSrc + ')')
          var instance = factory()
          var ctx = {
            node: obj,
            data: node,
            input: self._input,
            delta: 0,
            time: 0,
            engine: {
              hud: {
                set: function (patch) { self.triggerEvent('hud', patch || {}) }
              },
              audio: {
                playSfx: function () {},
                playBgm: function () {},
                stopAll: function () {}
              },
              pick: function () { return [] }
            },
            setTransform: function (transform) { self.setTransform(node.id, transform) },
            remove: function () { self.removeNode(node.id) }
          }
          if (instance && instance.onStart) instance.onStart(ctx)
          this._scripts[node.id] = { instance: instance, ctx: ctx }
        } catch (e) {
          console.error('[wxar-runtime] script compile/start error', node.id, e)
        }
      },

      _mountScene: function (json) {
        if (!this._scene || !this._shadow || !this._xfs) return
        this._clearAll()
        // 记录纹理资产的 id -> url，供材质贴图映射使用
        this._textureAssets = {}
        var assets = (json && json.assets) || []
        for (var ai = 0; ai < assets.length; ai++) {
          var a = assets[ai] || {}
          if (a.kind === 'texture' && a.uri) this._textureAssets[String(a.id)] = a.uri
        }
        var nodes = (json && json.nodes) || []
        var self = this
        this._debug = (json && json.debug) || {}
        // AR 人体工学缩放（防重入：同一份 json 只缩一次）
        if (AR_SCENE_SCALE !== 1 && nodes.length && !json.__arScaled) {
          deepScaleSceneNodes(nodes, AR_SCENE_SCALE)
          json.__arScaled = true
          this._log('AR 全局缩放 x' + AR_SCENE_SCALE + ' 已应用')
        }
        this._log('挂载场景: ' + assets.length + ' 个资产 / ' + nodes.length + ' 个根节点')
        for (var i = 0; i < nodes.length; i++) {
          this._mountNode(nodes[i], this._shadow)
        }
        // 版本指纹 + 每球实际半径：真机日志一眼确认「跑的是哪一版/尺寸是否生效」
        // （缩放统一折在 transform.scale 上，世界半径 = geometryParams.radius × scale）
        var fingerprint = []
        var walkScale = function (list) {
          for (var k = 0; k < list.length; k++) {
            var nd = list[k]
            if (nd && nd.type === 'mesh' && nd.props && nd.props.geometryParams && typeof nd.props.geometryParams.radius === 'number') {
              var nsc = (nd.transform && nd.transform.scale && nd.transform.scale[0]) || 1
              fingerprint.push(nd.name + '=r' + (nd.props.geometryParams.radius * nsc).toFixed(3))
            }
            if (nd && nd.children && nd.children.length) walkScale(nd.children)
          }
        }
        walkScale(nodes)
        this._log('版本指纹 v0.7-arscale: ' + fingerprint.join(', '))
        this._sceneJson = json
      },

      // 逐节点容错：单个节点挂载失败（未知几何、非法参数等）只告警跳过，
      // 不能拖垮整棵子树。内部递归走的也是这个包装入口。
      _mountNode: function (node, parent) {
        try {
          return this._mountNodeRaw(node, parent)
        } catch (e) {
          console.warn('[wxar-runtime] 节点挂载失败（已跳过）', node && node.id, e)
          return null
        }
      },

      _mountNodeRaw: function (node, parent) {
        if (!node || !this._scene || !this._xfs) return null
        var self = this
        var props = node.props || {}
        var kind = node.type || props.kind || 'group'
        node._parent = parent

        // Marker 跟踪组件：动态创建 xr-ar-tracker（参考 dtysky/xr-frame-demo）
        var comps = (node.props && node.props.components) || node.components || []
        var markerComp = null
        for (var ci = 0; ci < comps.length; ci++) {
          if (comps[ci] && comps[ci].type === 'marker') { markerComp = comps[ci]; break }
        }
        if (markerComp) {
          return this._createMarkerNode(node, parent, markerComp)
        }

        if (kind === 'model' || props.modelUrl || props.src) {
          var assetId = props.assetId || ('model_' + String(node.id || Math.random()).replace(/[^a-zA-Z0-9_]/g, '_'))
          var url = props.modelUrl || props.src || (node.asset && node.asset.uri) || ''
          if (url) {
            return this._createModelNode(node, assetId, url, parent)
          }
        }

        if (kind === 'mesh') {
          return this._createMeshNode(node, parent)
        }

        if (kind === 'light' || props.light) {
          var lightNode = this._createLightNode(node, parent)
          if (lightNode) return lightNode
        }

        if (kind === 'particle') {
          var particleNode = this._createParticleNode(node, parent)
          if (particleNode) return particleNode
        }

        // group / 未知类型 -> 空 XRNode 容器
        var wrapper = this._scene.createElement(this._xfs.XRNode, {
          position: vec3(node.transform && node.transform.position),
          rotation: degVec3(node.transform && node.transform.rotation),
          scale: vec3(node.transform && node.transform.scale, '1 1 1')
        })
        if (node.id) wrapper.setId(String(node.id))
        parent.addChild(wrapper)
        this._nodeMap[node.id] = wrapper
        this._registerNodeLogic(node, wrapper)
        var children = node.children || []
        for (var i = 0; i < children.length; i++) this._mountNode(children[i], wrapper)
        return wrapper
      },

      _createMarkerNode: function (node, parent, c) {
        var scene = this._scene
        var xfs = this._xfs
        if (!scene || !xfs) return null
        if (!xfs.XRARTracker) {
          console.warn('[wxar-runtime] XRARTracker not available, fallback to group', node.id)
          return this._mountNodeAsGroup(node, parent)
        }
        try {
          var attrs = {
            mode: c.mode || c.trackerMode || 'Marker'
          }
          if (c.src || c.image) attrs.src = c.src || c.image
          if (c.assetId) attrs['asset-id'] = c.assetId
          // Marker 模式必须有识别图（src 或 asset-id），否则 tracker 永远不会
          // 命中且没有任何报错——这里补一条告警，导出侧排查时能看到
          var isMarkerMode = String(attrs.mode).toLowerCase() === 'marker'
          if (isMarkerMode && !attrs.src && !attrs['asset-id']) {
            console.warn('[wxar-runtime] marker 组件缺少 src/asset-id 识别图，Marker 跟踪不会工作', node.id)
          }
          var tracker = scene.createElement(xfs.XRARTracker, attrs)
          if (node.id) tracker.setId(String(node.id))
          parent.addChild(tracker)
          this._nodeMap[node.id] = tracker
          this._registerNodeLogic(node, tracker)
          var children = node.children || []
          for (var i = 0; i < children.length; i++) this._mountNode(children[i], tracker)
          return tracker
        } catch (e) {
          console.warn('[wxar-runtime] create marker tracker failed', node.id, e)
          return this._mountNodeAsGroup(node, parent)
        }
      },

      _mountNodeAsGroup: function (node, parent) {
        var scene = this._scene
        var xfs = this._xfs
        if (!scene || !xfs) return null
        var wrapper = scene.createElement(xfs.XRNode, {
          position: vec3(node.transform && node.transform.position),
          rotation: degVec3(node.transform && node.transform.rotation),
          scale: vec3(node.transform && node.transform.scale, '1 1 1')
        })
        if (node.id) wrapper.setId(String(node.id))
        parent.addChild(wrapper)
        this._nodeMap[node.id] = wrapper
        this._registerNodeLogic(node, wrapper)
        var children = node.children || []
        for (var i = 0; i < children.length; i++) this._mountNode(children[i], wrapper)
        return wrapper
      },

      _textureUri: function (id) {
        if (id == null) return ''
        // 优先按资产 id 查导出的 assets 表
        var assets = this._textureAssets || {}
        if (assets[id]) return assets[id]
        // 否则当作直接给了 URL/blob/local 路径
        if (typeof id === 'string' && /^(https?:|blob:|data:|wxfile:|\/)/.test(id)) return id
        return ''
      },

      _ensureTexture: function (assetId, uri) {
        var scene = this._scene
        if (!scene || !scene.assets || !assetId || !uri) return ''
        var safeId = 'tex_' + String(assetId).replace(/[^a-zA-Z0-9_]/g, '_')
        if (!this._textureReady) this._textureReady = {}
        if (this._textureReady[safeId]) return safeId
        if (!this._textureLoading) this._textureLoading = {}
        if (!this._textureLoading[safeId]) {
          var self = this
          this._textureLoading[safeId] = scene.assets.loadAsset({ type: 'texture', assetId: safeId, src: uri })
            .then(function () { self._textureReady[safeId] = true })
            .catch(function (err) {
              console.warn('[wxar-runtime] texture load failed', safeId, err)
              delete self._textureLoading[safeId]
            })
        }
        return safeId
      },

      // 把 Web 端 geometryParams 折算成 xr-frame 内置几何的 scale。
      // 官方内置尺寸：cube 1x1x1、sphere 半径1、plane 1x1(xz)、cylinder 半径1/高2。
      _geomScale: function (geometry, params) {
        var p = params || {}
        var n = function (k, d) { return p[k] != null ? p[k] : d }
        switch (geometry) {
          case 'box':
          case 'cube':
            return [n('width', 1), n('height', 1), n('depth', 1)]
          case 'sphere':
          case 'icosahedron': {
            var r0 = n('radius', 0.5)
            return [r0, r0, r0]
          }
          case 'plane':
            // plane 是 xz 平面：宽沿 x，高沿 z；随后绕 x 轴 +90° 对齐到 Web 的 xy 朝向
            return [n('width', 1), 1, n('height', 1)]
          case 'cylinder': {
            var rt = n('radiusTop', 0.5)
            var rb = n('radiusBottom', 0.5)
            var rm = Math.max(rt, rb)
            return [rm, n('height', 1) / 2, rm]
          }
          case 'cone': {
            var cr = n('radius', 0.5)
            return [cr, n('height', 1) / 2, cr]
          }
          case 'torus': {
            var tr = n('radius', 0.5)
            var tt = n('tube', 0.2)
            var s = tr + tt
            return [s, s, s]
          }
          default:
            return [1, 1, 1]
        }
      },

      _createMeshNode: function (node, parent) {
        var scene = this._scene
        var xfs = this._xfs
        var self = this
        var props = node.props || {}
        if (props.customShader && props.customShader.vertex && props.customShader.fragment) {
          var custom = this._createCustomShaderNode(node, parent)
          if (custom) return custom
        }
        var effect = String(props.effect || props.fx || '')
        if (fxEffectName(effect)) {
          var fx = this._createEffectNode(node, parent)
          if (fx) return fx
        }
        var geometry = GEOMETRY_NAMES[props.geometry] || props.geometry || 'cube'
        // 尺寸适配：把 geometryParams 折算进 scale；plane 额外绕 x 轴 +90° 对齐 Web 的 xy 朝向
        var gs = this._geomScale(props.geometry, props.geometryParams)
        var tsc = (node.transform && node.transform.scale) || [1, 1, 1]
        var combinedScale = [
          (tsc[0] != null ? tsc[0] : 1) * gs[0],
          (tsc[1] != null ? tsc[1] : 1) * gs[1],
          (tsc[2] != null ? tsc[2] : 1) * gs[2]
        ]
        var rot = (node.transform && node.transform.rotation) || [0, 0, 0]
        if (props.geometry === 'plane') rot = [rot[0] + Math.PI / 2, rot[1], rot[2]]
        var attrs = {
          geometry: geometry,
          position: vec3(node.transform && node.transform.position),
          rotation: degVec3(rot),
          scale: vec3(combinedScale)
        }
        var mat = props.material || {}
        var color = colorToUniforms(mat.color)
        var rough = mat.roughness != null ? mat.roughness : 0.8
        var metal = mat.metalness != null ? mat.metalness : 0.0
        // opacity 折进 baseColor 的 alpha（xr-frame 标准材质默认不开启透明混合，视觉上退化为不透明）
        var opacity = mat.opacity != null ? mat.opacity : 1
        // 逐 uniform 独立判断、收进数组最后 join：避免「没有 color 就连带丢掉
        // metal/rough/emissive」以及「首项不是 color 时出现前导逗号」两类问题
        var uSegs = []
        if (color) {
          var rgba = color.split(' ')
          if (rgba.length >= 4) rgba[3] = str(opacity)
          uSegs.push('u_baseColorFactor:' + rgba.join(' '))
        }
        uSegs.push('u_metallicRoughnessValues: ' + metal.toFixed(2) + ' ' + rough.toFixed(2))
        // 自发光 -> u_emissiveFactor(vec3, LINEAR)，emissiveIntensity 乘到颜色上
        if (mat.emissive && mat.emissive !== '#000000') {
          var emColor = colorToUniforms(mat.emissive)
          var emIntensity = mat.emissiveIntensity != null ? mat.emissiveIntensity : 1
          if (emColor) {
            var ep = emColor.split(' ')
            var er = Math.min(1, parseFloat(ep[0]) * emIntensity).toFixed(3)
            var eg = Math.min(1, parseFloat(ep[1]) * emIntensity).toFixed(3)
            var eb = Math.min(1, parseFloat(ep[2]) * emIntensity).toFixed(3)
            uSegs.push('u_emissiveFactor: ' + er + ' ' + eg + ' ' + eb)
          }
        }
        // 贴图映射：material.map / normalMap / emissiveMap / metalnessMap / roughnessMap
        // 存的是资产 id，这里转成 xr-frame 的 u_*Map uniform（texture 资源 id）
        var push = function (name, value) {
          if (!value) return
          uSegs.push(name + ': ' + value)
        }
        if (mat.map) {
          var baseTex = self._ensureTexture(mat.map, self._textureUri(mat.map))
          if (baseTex) push('u_baseColorMap', baseTex)
        }
        if (mat.normalMap) {
          var nTex = self._ensureTexture(mat.normalMap, self._textureUri(mat.normalMap))
          if (nTex) push('u_normalMap', nTex)
        }
        if (mat.emissiveMap) {
          var eTex = self._ensureTexture(mat.emissiveMap, self._textureUri(mat.emissiveMap))
          if (eTex) push('u_emissiveMap', eTex)
        }
        if (mat.metalnessMap) {
          var mTex = self._ensureTexture(mat.metalnessMap, self._textureUri(mat.metalnessMap))
          if (mTex) push('u_metallicMap', mTex)
        }
        if (mat.roughnessMap) {
          var rTex = self._ensureTexture(mat.roughnessMap, self._textureUri(mat.roughnessMap))
          if (rTex) push('u_roughnessMap', rTex)
        }
        var uniform = uSegs.join(', ')
        if (uniform) attrs.uniforms = uniform
        if (node.visible === false) attrs.visible = false
        var mesh = scene.createElement(xfs.XRMesh, attrs)
        if (node.id) mesh.setId(String(node.id))
        parent.addChild(mesh)
        this._nodeMap[node.id] = mesh
        this._registerNodeLogic(node, mesh)
        // mesh 节点的子节点也要挂载（如轨迹节点挂在球体下形成嵌套轨道：
        // 黄球绕蓝球转 = 蓝球 mesh 下挂一条局部圆形轨迹）
        var meshChildren = node.children || []
        for (var mc = 0; mc < meshChildren.length; mc++) this._mountNode(meshChildren[mc], mesh)
        return mesh
      },

      _createLightNode: function (node, parent) {
        var scene = this._scene
        var xfs = this._xfs
        if (!scene || !xfs || !xfs.XRLight) return null
        var props = node.props || {}
        var type = props.light || 'ambient'
        var counts = this._lightCounts || (this._lightCounts = { ambient: 0, directional: 0, extra: 0 })
        // xr-frame 全程最多 6 盏：1 环境光 + 1 主平行光 + 4 追加光
        if (type === 'ambient' && counts.ambient >= 1) return null
        if (type === 'directional' && counts.directional >= 1) return null
        if (type !== 'ambient' && type !== 'directional' && counts.extra >= 4) return null

        var color = colorToUniforms(props.color)
        var attrs = { type: type }
        if (color) {
          var cp = color.split(' ')
          attrs.color = (cp[0] || '1') + ' ' + (cp[1] || '1') + ' ' + (cp[2] || '1')
        }
        if (props.intensity != null) attrs.intensity = props.intensity

        if (type === 'directional') {
          attrs.rotation = degVec3(node.transform && node.transform.rotation)
          if (props.castShadow) attrs['cast-shadow'] = ''
        } else if (type === 'point' || type === 'spot') {
          attrs.position = vec3(node.transform && node.transform.position)
          if (props.distance) attrs.range = props.distance
          if (type === 'spot') {
            attrs.rotation = degVec3(node.transform && node.transform.rotation)
            var angleDeg = Math.round(((props.angle != null ? props.angle : (45 * Math.PI / 180))) * 180 / Math.PI)
            attrs['inner-cone-angle'] = Math.max(0, Math.round(angleDeg * 0.6))
            attrs['outer-cone-angle'] = angleDeg
          }
        }

        var light = scene.createElement(xfs.XRLight, attrs)
        if (node.id) light.setId(String(node.id))
        parent.addChild(light)
        this._nodeMap[node.id] = light
        this._registerNodeLogic(node, light)

        if (type === 'ambient') counts.ambient++
        else if (type === 'directional') counts.directional++
        else counts.extra++
        return light
      },

      _createParticleNode: function (node, parent) {
        var scene = this._scene
        var xfs = this._xfs
        if (!scene || !xfs || !xfs.XRParticle) return null
        var props = node.props || {}
        var preset = props.preset || 'energy'
        var cfg = PARTICLE_PRESET_CFG[preset] || PARTICLE_PRESET_CFG.energy
        // 按设备档位缩放粒子容量/速率，保证中端机流畅
        var scale = this._quality === 'high' ? 1 : this._quality === 'low' ? 0.25 : 0.6
        var count = Math.max(16, Math.round((props.count || 200) * scale))
        var size = Math.max(0.02, (props.size != null ? props.size : 1) * 0.1)
        var userColor = colorToUniforms(props.color)
        var attrs = {
          capacity: count,
          'emit-rate': Math.max(10, Math.round(count / 2)),
          'life-time': cfg.lifeTime,
          speed: cfg.speed,
          size: (size * 0.5) + ' ' + size,
          'start-color': userColor || cfg.startColor,
          'end-color': cfg.endColor,
          'emitter-type': cfg.emitterType,
          'emitter-props': cfg.emitterProps,
          gravity: cfg.gravity,
          position: vec3(node.transform && node.transform.position),
          rotation: degVec3(node.transform && node.transform.rotation),
          scale: vec3(node.transform && node.transform.scale, '1 1 1'),
          visible: node.visible !== false
        }
        if (cfg.startColor2 && !userColor) attrs['start-color2'] = cfg.startColor2
        var particle = scene.createElement(xfs.XRParticle, attrs)
        if (node.id) particle.setId(String(node.id))
        parent.addChild(particle)
        this._nodeMap[node.id] = particle
        this._registerNodeLogic(node, particle)
        try {
          var comp = particle.getComponent && particle.getComponent('particle')
          if (comp && comp.start) comp.start()
        } catch (e) {}
        return particle
      },

      _registerFxEffects: function () {
        var self = this
        var scene = this._scene
        var xfs = this._xfs
        if (!scene || !xfs || !xfs.registerEffect) return
        if (this._fxRegistered) return
        this._fxRegistered = true
        this._fxMaterialRefs = {}

        var makeFxBlackHoleDef = function (rgba) {
          return {
            name: 'xr-engine-blackhole',
            properties: [
              { key: 'uTime', type: xfs.EUniformType.FLOAT, default: 0 },
              { key: 'uColor', type: xfs.EUniformType.FLOAT4, default: rgba || [1, 0.4, 0.1, 1] }
            ],
            images: [],
            defaultRenderQueue: 2600,
            passes: [{
              renderStates: {
                cullOn: true,
                cullFace: xfs.ECullMode ? xfs.ECullMode.BACK : undefined,
                blendOn: true,
                blendSrc: xfs.EBlendFactor.SRC_ALPHA,
                blendDst: xfs.EBlendFactor.ONE,
                depthWrite: false,
                depthTestOn: true
              },
              lightMode: 'ForwardBase',
              useMaterialRenderStates: true,
              shaders: [0, 1]
            }],
            shaders: [
              `#version 100
attribute vec3 a_position;
attribute highp vec2 a_texCoord;
uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat4 u_world;
varying highp vec2 v_uv;
void main() {
  v_uv = a_texCoord;
  gl_Position = u_projection * u_view * u_world * vec4(a_position, 1.0);
}`,
              `#version 100
precision mediump float;
uniform highp float uTime;
uniform highp vec4 uColor;
varying highp vec2 v_uv;
void main() {
  vec2 p = v_uv - 0.5;
  float r = length(p);
  float a = atan(p.y, p.x);
  float swirl = a + (1.0 - r) * 6.0 + uTime * 0.8;
  float ring = smoothstep(0.10, 0.22, r) * smoothstep(0.50, 0.42, r);
  vec3 col = mix(vec3(0.0), uColor.rgb, ring);
  col += vec3(1.0, 0.55, 0.2) * pow(ring, 3.0) * 1.4;
  gl_FragData[0] = vec4(col, ring);
}`
            ]
          }
        }

        // 与官方 AR demo 思路对齐：**不透明带明暗的实体球**（不是透明发光壳）。
        // 原因：AR 背景是实拍画面（白亮房间），additive 叠加只会溢出成白色；
        // 只有暗背景（Web 编辑器）才适合加色发光。不透明球在任何背景下
        // 颜色都正确、轮廓清晰——这是「别人的成功方案」的核心。
        var makeFxEnergyDef = function (rgba) {
          return {
            name: 'xr-engine-energy',
            properties: [
              { key: 'uTime', type: xfs.EUniformType.FLOAT, default: 0 },
              { key: 'uColor', type: xfs.EUniformType.FLOAT4, default: rgba || [1, 1, 1, 1] }
            ],
            images: [],
            defaultRenderQueue: 0,
            passes: [{
              renderStates: {
                cullOn: true,
                cullFace: xfs.ECullMode ? xfs.ECullMode.BACK : undefined,
                blendOn: false,
                depthWrite: true,
                depthTestOn: true
              },
              lightMode: 'ForwardBase',
              useMaterialRenderStates: true,
              shaders: [0, 1]
            }],
            shaders: [
              `#version 100
attribute vec3 a_position;
attribute vec3 a_normal;
uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat4 u_world;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vNormal = normalize((u_world * vec4(a_normal, 0.0)).xyz);
  vec4 worldPos = u_world * vec4(a_position, 1.0);
  vec4 viewPos = u_view * worldPos;
  vView = -normalize(viewPos.xyz);
  gl_Position = u_projection * u_view * u_world * vec4(a_position, 1.0);
}`,
              `#version 100
precision mediump float;
uniform highp float uTime;
uniform highp vec4 uColor;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec3 N = normalize(vNormal);
  float facing = max(dot(N, normalize(vView)), 0.0);
  float fresnel = pow(1.0 - facing, 2.0);
  // 固定世界光源方向：球面出现稳定的亮面/暗面过渡 → 真实体积感（不再像纯色贴纸）
  float lit = max(dot(N, normalize(vec3(0.45, 0.75, 0.5))), 0.0);
  float shade = 0.45 + 0.65 * lit;
  vec3 hot = mix(uColor.rgb, vec3(1.0), 0.55);
  vec3 base = mix(uColor.rgb * 0.55, hot, smoothstep(0.1, 0.95, facing));
  base *= shade;
  base += vec3(1.0) * fresnel * 0.3;
  float pulse = 0.92 + 0.08 * sin(uTime * 5.0);
  gl_FragData[0] = vec4(base * pulse, 1.0);
}`
            ]
          }
        }

        // dissolve（溶解）：value noise + 阈值 discard + 边缘发光。
        // 阈值随 uTime 正弦循环（0→1→0），物体周期性地消融/复原；
        // 靠近阈值的窄带混入增亮的 uColor 作灼烧边。不透明管线（discard 即镂空），
        // uSpeed 控制循环速度（缺省 1）。
        var makeFxDissolveDef = function (rgba) {
          return {
            name: 'xr-engine-dissolve',
            properties: [
              { key: 'uTime', type: xfs.EUniformType.FLOAT, default: 0 },
              { key: 'uColor', type: xfs.EUniformType.FLOAT4, default: rgba || [1, 0.55, 0.1, 1] },
              { key: 'uSpeed', type: xfs.EUniformType.FLOAT, default: 1 }
            ],
            images: [],
            defaultRenderQueue: 0,
            passes: [{
              renderStates: {
                cullOn: true,
                cullFace: xfs.ECullMode ? xfs.ECullMode.BACK : undefined,
                blendOn: false,
                depthWrite: true,
                depthTestOn: true
              },
              lightMode: 'ForwardBase',
              useMaterialRenderStates: true,
              shaders: [0, 1]
            }],
            shaders: [
              `#version 100
attribute vec3 a_position;
attribute highp vec2 a_texCoord;
uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat4 u_world;
varying highp vec2 v_uv;
void main() {
  v_uv = a_texCoord;
  gl_Position = u_projection * u_view * u_world * vec4(a_position, 1.0);
}`,
              `#version 100
precision mediump float;
uniform highp float uTime;
uniform highp vec4 uColor;
uniform highp float uSpeed;
varying highp vec2 v_uv;
highp float fxHash(highp vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
highp float fxNoise(highp vec2 p) {
  highp vec2 i = floor(p);
  highp vec2 f = fract(p);
  highp vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fxHash(i), fxHash(i + vec2(1.0, 0.0)), u.x),
             mix(fxHash(i + vec2(0.0, 1.0)), fxHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  highp float n = fxNoise(v_uv * 6.0) * 0.65 + fxNoise(v_uv * 18.0) * 0.35;
  highp float threshold = 0.5 + 0.5 * sin(uTime * uSpeed);
  if (n < threshold) discard;
  highp float edge = 1.0 - smoothstep(0.0, 0.14, n - threshold);
  vec3 glow = mix(uColor.rgb, vec3(1.0), 0.35) * 1.7;
  vec3 col = mix(uColor.rgb, glow, edge);
  gl_FragData[0] = vec4(col, uColor.a);
}`
            ]
          }
        }

        // hologram（全息）：fresnel 边缘光 + 纵向滚动扫描线 + 微闪烁，半透明输出。
        // AR 实拍背景偏亮，用普通 alpha 混合（不用 additive，避免溢出成白色）。
        var makeFxHologramDef = function (rgba) {
          return {
            name: 'xr-engine-hologram',
            properties: [
              { key: 'uTime', type: xfs.EUniformType.FLOAT, default: 0 },
              { key: 'uColor', type: xfs.EUniformType.FLOAT4, default: rgba || [0.3, 0.85, 1, 1] }
            ],
            images: [],
            defaultRenderQueue: 2600,
            passes: [{
              renderStates: {
                cullOn: true,
                cullFace: xfs.ECullMode ? xfs.ECullMode.BACK : undefined,
                blendOn: true,
                blendSrc: xfs.EBlendFactor.SRC_ALPHA,
                blendDst: xfs.EBlendFactor.ONE_MINUS_SRC_ALPHA !== undefined ? xfs.EBlendFactor.ONE_MINUS_SRC_ALPHA : xfs.EBlendFactor.ONE,
                depthWrite: false,
                depthTestOn: true
              },
              lightMode: 'ForwardBase',
              useMaterialRenderStates: true,
              shaders: [0, 1]
            }],
            shaders: [
              `#version 100
attribute vec3 a_position;
attribute vec3 a_normal;
attribute highp vec2 a_texCoord;
uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat4 u_world;
varying vec3 vNormal;
varying vec3 vView;
varying highp vec2 v_uv;
void main() {
  vNormal = normalize((u_world * vec4(a_normal, 0.0)).xyz);
  v_uv = a_texCoord;
  vec4 worldPos = u_world * vec4(a_position, 1.0);
  vec4 viewPos = u_view * worldPos;
  vView = -normalize(viewPos.xyz);
  gl_Position = u_projection * u_view * u_world * vec4(a_position, 1.0);
}`,
              `#version 100
precision mediump float;
uniform highp float uTime;
uniform highp vec4 uColor;
varying vec3 vNormal;
varying vec3 vView;
varying highp vec2 v_uv;
void main() {
  vec3 N = normalize(vNormal);
  highp float facing = max(dot(N, normalize(vView)), 0.0);
  highp float fresnel = pow(1.0 - facing, 2.5);
  highp float scan = 0.5 + 0.5 * sin(v_uv.y * 48.0 - uTime * 5.0);
  scan = smoothstep(0.3, 0.7, scan);
  highp float flicker = 0.92 + 0.08 * sin(uTime * 21.0 + sin(uTime * 6.7) * 3.0);
  vec3 col = uColor.rgb * (0.3 + 0.5 * scan) + uColor.rgb * fresnel * 1.3 + vec3(1.0) * fresnel * 0.25;
  highp float alpha = (0.22 + 0.5 * fresnel + 0.18 * scan) * flicker * uColor.a;
  gl_FragData[0] = vec4(col * flicker, alpha);
}`
            ]
          }
        }

        // shockwave（冲击波）：平面 uv 中心向外扩散的环形波，环随 phase 扩大、
        // alpha 随 (1-phase)² 衰减，fract 循环往复。双面可见、普通 alpha 混合。
        var makeFxShockwaveDef = function (rgba) {
          return {
            name: 'xr-engine-shockwave',
            properties: [
              { key: 'uTime', type: xfs.EUniformType.FLOAT, default: 0 },
              { key: 'uColor', type: xfs.EUniformType.FLOAT4, default: rgba || [0.5, 0.9, 1, 1] }
            ],
            images: [],
            defaultRenderQueue: 2600,
            passes: [{
              renderStates: {
                cullOn: false,
                blendOn: true,
                blendSrc: xfs.EBlendFactor.SRC_ALPHA,
                blendDst: xfs.EBlendFactor.ONE_MINUS_SRC_ALPHA !== undefined ? xfs.EBlendFactor.ONE_MINUS_SRC_ALPHA : xfs.EBlendFactor.ONE,
                depthWrite: false,
                depthTestOn: true
              },
              lightMode: 'ForwardBase',
              useMaterialRenderStates: true,
              shaders: [0, 1]
            }],
            shaders: [
              `#version 100
attribute vec3 a_position;
attribute highp vec2 a_texCoord;
uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat4 u_world;
varying highp vec2 v_uv;
void main() {
  v_uv = a_texCoord;
  gl_Position = u_projection * u_view * u_world * vec4(a_position, 1.0);
}`,
              `#version 100
precision mediump float;
uniform highp float uTime;
uniform highp vec4 uColor;
varying highp vec2 v_uv;
void main() {
  highp vec2 p = v_uv - 0.5;
  highp float r = length(p) * 2.0;
  highp float phase = fract(uTime * 0.7);
  highp float ring = 1.0 - smoothstep(0.0, 0.08, abs(r - phase));
  highp float fade = 1.0 - phase;
  highp float alpha = ring * fade * fade * uColor.a;
  vec3 col = mix(uColor.rgb, vec3(1.0), ring * 0.45) * (0.75 + 0.5 * ring);
  gl_FragData[0] = vec4(col, alpha);
}`
            ]
          }
        }

        // 按注册的 effect 资产名取定义（按色注册/兜底创建共用这一个入口）
        var makeFxDefByName = function (fxName, rgba) {
          if (fxName === 'xr-engine-blackhole') return makeFxBlackHoleDef(rgba)
          if (fxName === 'xr-engine-dissolve') return makeFxDissolveDef(rgba)
          if (fxName === 'xr-engine-hologram') return makeFxHologramDef(rgba)
          if (fxName === 'xr-engine-shockwave') return makeFxShockwaveDef(rgba)
          return makeFxEnergyDef(rgba)
        }

        // 按颜色获取 effect 资产：
        // 1) 优先 getAsset —— 命中 _registerFxEffects 里的预扫描注册（与默认
        //    effect 同批物化，是被证明可用的路径）；
        // 2) 兜底 scene.createEffect 直连（运行时新注册的 effect 不进资产表）。
        // 真机 setVector 不可靠，颜色必须走 effect 默认值。
        this._fxColorEffects = this._fxColorEffects || {}
        this._ensureColorEffect = function (fxName, colorKey, rgba) {
          var id = fxName + '-c' + colorKey
          try {
            var hit = scene.assets.getAsset && scene.assets.getAsset('effect', id)
            if (hit) return hit
          } catch (e1) {}
          try {
            if (this._fxColorEffects[id]) return this._fxColorEffects[id]
            var def = makeFxDefByName(fxName, rgba)
            def.name = id
            var asset = scene.createEffect ? scene.createEffect(def) : null
            if (!asset) {
              console.warn('[wxar-runtime] scene.createEffect 不可用，按色 effect 创建失败', id)
              return null
            }
            this._fxColorEffects[id] = asset
            return asset
          } catch (e) {
            console.warn('[wxar-runtime] 按色 effect 创建失败', id, e && (e.errMsg || e.message))
            return null
          }
        }

        // 预加载粒子纹理：软圆点（薄雾）+ 光晕（billboard 光晕粒子）。
        // xr-frame 粒子不设 texture 时渲染为实心方块（官方 texture 属性）。
        // 两个纹理都就绪（或都失败）后统一 flush pending 队列。
        var fxSelf = this
        this._fxTexState = { dot: false, halo: false }
        var texCheck = function () {
          return fxSelf._fxTexState.dot && fxSelf._fxTexState.halo
        }
        var flushPendingFxParticles = function () {
          var list = fxSelf._pendingFxParticles || []
          fxSelf._pendingFxParticles = []
          for (var pi = 0; pi < list.length; pi++) {
            try { list[pi](fxSelf._fxTexState) } catch (eFlush) { console.warn('[wxar-runtime] 补挂粒子失败', eFlush) }
          }
          if (fxSelf._fxParticleTimer) { clearTimeout(fxSelf._fxParticleTimer); fxSelf._fxParticleTimer = null }
        }
        var loadFxTexture = function (assetId, src, key, failLabel) {
          try {
            var loadTex = scene.assets.loadAsset && scene.assets.loadAsset({ type: 'texture', assetId: assetId, src: src })
            if (loadTex && loadTex.then) {
              loadTex.then(function () {
                fxSelf._fxTexState[key] = true
                if (texCheck()) flushPendingFxParticles()
              }, function (eTex) {
                console.warn(failLabel, eTex && (eTex.errMsg || eTex.message))
                if (texCheck()) flushPendingFxParticles()
              })
            } else {
              fxSelf._fxTexState[key] = true
            }
          } catch (eTex2) {
            console.warn(failLabel, eTex2 && (eTex2.errMsg || eTex2.message))
            fxSelf._fxTexState[key] = true
          }
        }
        loadFxTexture('xr-fx-soft-dot', '/assets/fx-soft-dot.png', 'dot', '[wxar-runtime] 软圆点纹理加载失败（粒子退化为方块）')
        loadFxTexture('xr-fx-halo', '/assets/fx-halo.png', 'halo', '[wxar-runtime] 光晕纹理加载失败（无光晕层）')
        // 若纹理加载器没有异步回调（同步缓存命中），也要保证 flush
        setTimeout(function () {
          if ((fxSelf._pendingFxParticles || []).length) {
            fxSelf._fxTexState.dot = true; fxSelf._fxTexState.halo = true
            flushPendingFxParticles()
          }
        }, 3000)

        try { xfs.registerEffect('xr-engine-blackhole', function (sc) { return sc.createEffect(makeFxBlackHoleDef(null)) }) } catch (e) { console.warn('[wxar-runtime] register blackhole effect failed', e) }
        try { xfs.registerEffect('xr-engine-energy', function (sc) { return sc.createEffect(makeFxEnergyDef(null)) }) } catch (e) { console.warn('[wxar-runtime] register energy effect failed', e) }
        try { xfs.registerEffect('xr-engine-dissolve', function (sc) { return sc.createEffect(makeFxDissolveDef(null)) }) } catch (e) { console.warn('[wxar-runtime] register dissolve effect failed', e) }
        try { xfs.registerEffect('xr-engine-hologram', function (sc) { return sc.createEffect(makeFxHologramDef(null)) }) } catch (e) { console.warn('[wxar-runtime] register hologram effect failed', e) }
        try { xfs.registerEffect('xr-engine-shockwave', function (sc) { return sc.createEffect(makeFxShockwaveDef(null)) }) } catch (e) { console.warn('[wxar-runtime] register shockwave effect failed', e) }

        // 预扫描场景里所有特效节点的颜色，在挂载前按色注册 effect。
        // 必须在这里注册：运行时新注册的 effect 不会进 assets 资产表，
        // 只有与默认 effect 同批（场景创建期）注册的才会被 getAsset 物化。
        try {
          var preSeen = {}
          var walkFxColors = function (nodes) {
            var list = nodes || []
            for (var pi = 0; pi < list.length; pi++) {
              var pn = list[pi]
              var pp = pn.props || {}
              var pfx = String(pp.effect || pp.fx || '')
              var pfxName = fxEffectName(pfx)
              if (pfxName) {
                var pcol = pp.material && pp.material.color
                if (pcol) {
                  var pkey = String(pcol).replace(/[^a-zA-Z0-9]/g, '')
                  if (!preSeen[pkey]) {
                    preSeen[pkey] = true
                    var prgbaStr = colorToUniforms(pcol)
                    if (prgbaStr) {
                      var prgba = prgbaStr.split(' ').map(Number)
                      if (prgba.length === 3) prgba.push(1)
                      var pid = pfxName + '-c' + pkey
                      if (!(scene.assets.getAsset && scene.assets.getAsset('effect', pid))) {
                        var pdef = makeFxDefByName(pfxName, prgba)
                        pdef.name = pid
                        ;(function (capturedId, capturedDef) {
                          xfs.registerEffect(capturedId, function (sc) { return sc.createEffect(capturedDef) })
                        })(pid, pdef)
                      }
                    }
                  }
                }
              }
              walkFxColors(pn.children)
            }
          }
          walkFxColors(this._pendingScene && this._pendingScene.nodes)
        } catch (ePre) { console.warn('[wxar-runtime] 预注册按色 effect 失败', ePre) }

        var names = ['xr-engine-blackhole', 'xr-engine-energy', 'xr-engine-dissolve', 'xr-engine-hologram', 'xr-engine-shockwave']
        for (var i = 0; i < names.length; i++) {
          try {
            var asset = scene.assets.getAsset && scene.assets.getAsset('effect', names[i])
            if (!asset) continue
            var mat = scene.createMaterial(asset, {})
            if (mat) {
              scene.assets.addAsset('material', names[i] + '-mat', mat)
              this._fxMaterialRefs[names[i]] = mat
            }
          } catch (e) {
            console.warn('[wxar-runtime] create material failed', names[i], e)
          }
        }
      },

      _registerCustomEffect: function (name, cs) {
        var scene = this._scene
        var xfs = this._xfs
        if (!scene || !xfs || !cs || !cs.vertex || !cs.fragment) return false
        if (!this._customEffects) this._customEffects = {}
        if (this._customEffects[name]) return true
        try {
          var properties = []
          var uniforms = cs.uniforms || {}
          // 自动注入时间
          if (typeof uniforms.uTime === 'undefined') {
            properties.push({ key: 'uTime', type: xfs.EUniformType.FLOAT, default: 0 })
          }
          for (var key in uniforms) {
            var val = uniforms[key]
            var type = null
            if (typeof val === 'number') type = xfs.EUniformType.FLOAT
            else if (Array.isArray(val)) {
              if (val.length === 2) type = xfs.EUniformType.FLOAT2
              else if (val.length === 3) type = xfs.EUniformType.FLOAT3
              else if (val.length === 4) type = xfs.EUniformType.FLOAT4
            }
            if (type != null) properties.push({ key: key, type: type, default: val })
          }
          var factory = function (sc) {
            return sc.createEffect({
              name: name,
              properties: properties,
              images: [],
              defaultRenderQueue: 2600,
              passes: [{
                renderStates: { cullOn: false, blendOn: true, depthWrite: false, depthTestOn: true },
                lightMode: 'ForwardBase',
                useMaterialRenderStates: true,
                shaders: [0, 1]
              }],
              shaders: [cs.vertex, cs.fragment]
            })
          }
          xfs.registerEffect(name, factory)
          this._customEffects[name] = true
          return true
        } catch (e) {
          console.warn('[wxar-runtime] register custom effect failed', name, e)
          return false
        }
      },

      _createCustomShaderNode: function (node, parent) {
        var scene = this._scene
        var xfs = this._xfs
        var props = node.props || {}
        var cs = props.customShader
        if (!scene || !xfs || !cs || !cs.vertex || !cs.fragment) return null
        var rawName = 'xr-custom-' + String(node.id || Math.random()).replace(/[^a-zA-Z0-9_-]/g, '_')
        if (!this._registerCustomEffect(rawName, cs)) return null
        var matId = rawName + '-mat'
        try {
          if (!this._customMaterials) this._customMaterials = {}
          if (!this._customMaterials[matId]) {
            var asset = scene.assets.getAsset && scene.assets.getAsset('effect', rawName)
            if (!asset) return null
            var mat = scene.createMaterial(asset, {})
            scene.assets.addAsset('material', matId, mat)
            this._customMaterials[matId] = mat
          }
          // 几何按节点数据生成（与 _createMeshNode 同一套折算：内置几何 ×
          // _geomScale(geometryParams) × transform.scale）；缺省保持 sphere
          var geoKey = props.geometry || 'sphere'
          var geometry = GEOMETRY_NAMES[geoKey] || geoKey
          var gs = this._geomScale(geoKey, props.geometryParams)
          var tsc = (node.transform && node.transform.scale) || [1, 1, 1]
          var combinedScale = [
            (tsc[0] != null ? tsc[0] : 1) * gs[0],
            (tsc[1] != null ? tsc[1] : 1) * gs[1],
            (tsc[2] != null ? tsc[2] : 1) * gs[2]
          ]
          var rot = (node.transform && node.transform.rotation) || [0, 0, 0]
          if (geoKey === 'plane') rot = [rot[0] + Math.PI / 2, rot[1], rot[2]]
          var mesh = scene.createElement(xfs.XRMesh, {
            geometry: geometry,
            material: matId,
            position: vec3(node.transform && node.transform.position),
            rotation: degVec3(rot),
            scale: vec3(combinedScale),
            visible: node.visible !== false
          })
          if (node.id) mesh.setId(String(node.id))
          parent.addChild(mesh)
          this._nodeMap[node.id] = mesh
          this._registerNodeLogic(node, mesh)
          return mesh
        } catch (e) {
          console.warn('[wxar-runtime] custom shader mesh creation failed', node.id, e)
          return null
        }
      },

      _createEffectNode: function (node, parent) {
        // 微信端完整特效 = 自定义 GLSL 1.0 材质 +（blackhole/energy）原生 XRParticle 粒子；
        // dissolve/hologram/shockwave 仅材质。不使用浏览器 Three.js shader，符合 xr-frame 官方约束。
        var self = this
        var scene = this._scene
        var xfs = this._xfs
        var props = node.props || {}
        var effect = String(props.effect || props.fx || '')
        if (!scene || !xfs || !this._nodeMap) return null

        var fxName = fxEffectName(effect)
        if (!fxName) return null
        var matId = fxName + '-mat'

        // 每个颜色一份材质实例：uColor 设在共享材质上会让场景里所有能量球/黑洞
        // 都被最后一个节点的颜色覆盖（太阳系要橙/蓝/黄三色共存）。
        // 同色节点共享同一份实例，避免材质数量爆炸。
        // 真机上 setVector 曾失效导致全变青色——所以颜色主路径是「按色注册
        // effect（uColor 写进默认值）」，setVector 只做双保险。
        var mat0 = props.material || {}
        var fxColor = colorToUniforms(mat0.color) || ''
        if (fxColor) {
          var colorKey = String(mat0.color).replace(/[^a-zA-Z0-9]/g, '')
          var rgba = fxColor.split(' ').map(Number)
          if (rgba.length === 3) rgba.push(1)
          var perColorId = fxName + '-mat-c' + colorKey
          var resolvedMat = null
          // 注意：xr-frame 的 assets.getAsset 对不存在的资产是「抛错」不是返回
          // null（TypeError: Cannot convert undefined or null to object），
          // 旧代码把它和创建链写在同一个 try 里，getAsset 一抛整条链就断。
          try {
            resolvedMat = scene.assets.getAsset ? scene.assets.getAsset('material', perColorId) : null
          } catch (eLookup) { resolvedMat = null }
          if (!resolvedMat) {
            try {
              // 1) 预扫描注册的按色 effect（getAsset 可命中）；
              // 2) scene.createEffect 直连兜底。
              var fxAsset = this._ensureColorEffect ? this._ensureColorEffect(fxName, colorKey, rgba) : null
              var newFxMat = fxAsset && scene.createMaterial ? scene.createMaterial(fxAsset) : null
              if (newFxMat) {
                scene.assets.addAsset('material', perColorId, newFxMat)
                this._fxMaterialRefs[perColorId] = newFxMat
                try { if (newFxMat.setVector) newFxMat.setVector('uColor', rgba) } catch (eSet) {}
              } else {
                self._log('按色材质诊断: effect=' + (fxAsset ? 'OK' : 'FAIL') + ' createMaterial=' + (scene.createMaterial ? 'OK' : 'MISSING'))
              }
              resolvedMat = newFxMat
            } catch (eColor) {
              self._log('按色材质异常: ' + (eColor && (eColor.errMsg || eColor.message)))
            }
          }
          if (resolvedMat) matId = perColorId
          else self._log('特效按色材质创建失败，回退默认材质: ' + mat0.color)
        }

        // blackhole/energy 保持历史行为：特效节点本质是球体，缩放必须各轴一致
        // （避免被非均匀缩放拉成圆柱），geometryParams.radius 折算进内置 sphere（半径 1）。
        // dissolve/hologram/shockwave 沿用 _createMeshNode 的生成逻辑：按节点
        // geometry/geometryParams 选内置几何并逐轴折算 scale（shockwave 缺省 plane——
        // 环形波在面上扩散，其余缺省 sphere），plane 额外绕 x 轴 +90° 对齐 Web 的 xy 朝向。
        var isLegacyFx = fxName === 'xr-engine-blackhole' || fxName === 'xr-engine-energy'
        var fxTs = (node.transform && node.transform.scale) || [1, 1, 1]
        var meshGeo = 'sphere'
        var fxRot = (node.transform && node.transform.rotation) || [0, 0, 0]
        var fxScale
        if (isLegacyFx) {
          var fxMax = Math.max(
            Math.abs(fxTs[0] != null ? fxTs[0] : 1),
            Math.abs(fxTs[1] != null ? fxTs[1] : 1),
            Math.abs(fxTs[2] != null ? fxTs[2] : 1)
          )
          var fxGs = this._geomScale(props.geometry, props.geometryParams)
          var fxRadiusScale = (fxGs && fxGs.length === 3) ? fxGs[0] : 1
          var fxUniform = fxMax * fxRadiusScale
          fxScale = [fxUniform, fxUniform, fxUniform]
        } else {
          var geoKey = props.geometry || (fxName === 'xr-engine-shockwave' ? 'plane' : 'sphere')
          meshGeo = GEOMETRY_NAMES[geoKey] || geoKey
          var fxGs2 = this._geomScale(geoKey, props.geometryParams)
          fxScale = [
            (fxTs[0] != null ? fxTs[0] : 1) * fxGs2[0],
            (fxTs[1] != null ? fxTs[1] : 1) * fxGs2[1],
            (fxTs[2] != null ? fxTs[2] : 1) * fxGs2[2]
          ]
          if (geoKey === 'plane') fxRot = [fxRot[0] + Math.PI / 2, fxRot[1], fxRot[2]]
        }

        var wrapper = scene.createElement(xfs.XRNode, {
          position: vec3(node.transform && node.transform.position),
          rotation: degVec3(fxRot),
          scale: vec3(fxScale),
          visible: node.visible !== false
        })
        if (node.id) wrapper.setId(String(node.id))
        parent.addChild(wrapper)
        this._nodeMap[node.id] = wrapper
        this._registerNodeLogic(node, wrapper)

        // 1. 自定义 Effect 网格。颜色三重保险：按色材质 → mesh 级 uniforms
        //    （官方 Mesh 组件属性，透明视频示例即用此方式设 uniform，独立于
        //    共享材质，最可靠）→ setVector（部分版本无效仅留作兜底）。
        try {
          var meshAttrs = {
            geometry: meshGeo,
            material: matId
          }
          if (fxColor) meshAttrs.uniforms = 'uColor:' + fxColor
          var mesh = scene.createElement(xfs.XRMesh, meshAttrs)
          if (mesh.setId) mesh.setId(String(node.id) + '_fx')
          wrapper.addChild(mesh)
        } catch (e) {
          console.warn('[wxar-runtime] effect mesh failed', node.id, e)
        }

        // 2. 原生粒子系统（两层，均为官方 XRParticle，无自定义 shader 风险）：
        //    a) 光晕层——单个常驻大粒子当 billboard 光晕（粒子天然面向相机），
        //       软光晕纹理 + 球色染色，这是 Web 端「发光感」的来源；
        //       社区实战方案，真机零兼容性问题。
        //    b) 薄雾层——软圆点粒子贴球壳低速流动（start-color2 随机变亮，
        //       社区实战标配，避免颜色呆板）。
        //    时序：纹理异步加载，挂载时通常未就绪 → pending 队列 + flush。
        //    仅 blackhole/energy 挂粒子；dissolve/hologram/shockwave 是纯 shader 效果。
        if (isLegacyFx && this._quality !== 'low' && xfs.XRParticle) {
          var self2 = this
          var isBlackHole = effect.indexOf('blackhole') >= 0
          var rgb3 = fxColor ? fxColor.split(' ').slice(0, 3).join(' ') : null
          var glowRgb = rgb3 || (isBlackHole ? '1 0.45 0.1' : '1 1 1')
          // 光晕粒子挂在 wrapper（缩放 = fxUniform = 球世界半径）下：
          // 粒子 size 属性是局部单位 → 世界直径 = size × fxUniform。
          // 取球世界直径 ×1.5（柔和贴边光晕）→ 局部 size = 2×1.5 = 3，与球径无关恒定。
          var haloSize = 3.0
          var makeParticle = function (attrs, suffix) {
            try {
              var el = scene.createElement(xfs.XRParticle, attrs)
              if (el.setId) el.setId(String(node.id) + suffix)
              wrapper.addChild(el)
              try {
                var comp = el.getComponent && el.getComponent('particle')
                if (comp && comp.start) comp.start()
              } catch (e2) {}
            } catch (e) {
              console.warn('[wxar-runtime] particle creation failed', node.id, suffix, e && (e.errMsg || e.message))
            }
          }
          var attachFxParticle = function (texState) {
            // a) 光晕层：常驻 billboard，持续补发射避免断档
            var haloAttrs = {
              capacity: 8,
              'emit-rate': 0.5,
              'life-time': '16 20',
              speed: '0 0',
              size: haloSize + ' ' + haloSize,
              'emitter-type': 'PointShape',
              'start-color': glowRgb + ' 0.4',
              'start-color2': glowRgb + ' 0.4',
              'end-color': glowRgb + ' 0.4',
              gravity: 0
            }
            if (texState && texState.halo) haloAttrs.texture = 'xr-fx-halo'
            makeParticle(haloAttrs, '_halo')
            // b) 薄雾层：贴球壳流动
            var mistAttrs = {
              capacity: isBlackHole ? 600 : 260,
              'emit-rate': isBlackHole ? 60 : 60,
              'life-time': isBlackHole ? '2.5 5' : '2 3.5',
              speed: isBlackHole ? '0.15 0.6' : '0.02 0.12',
              size: isBlackHole ? '0.04 0.1' : '0.035 0.09',
              'emitter-type': isBlackHole ? 'CircleShape' : 'SphereShape',
              'emitter-props': isBlackHole
                ? 'radius:1.6,radiusRange:0.5'
                : 'radius:0.58,radiusRange:0.3,randomizeDirection:0.1',
              'start-color': rgb3 ? rgb3 + ' 0.3' : (isBlackHole ? '1 0.45 0.1 0.8' : '1 1 1 0.3'),
              'start-color2': rgb3 ? '1 1 1 0.35' : (isBlackHole ? '1 0.8 0.3 0.9' : '1 1 1 0.35'),
              'end-color': rgb3 ? rgb3 + ' 0' : (isBlackHole ? '1 0.15 0.02 0' : '1 1 1 0'),
              'angular-speed': isBlackHole ? '60 180' : '10 60',
              gravity: 0
            }
            if (texState && texState.dot) mistAttrs.texture = 'xr-fx-soft-dot'
            makeParticle(mistAttrs, '_particles')
          }
          if (this._fxTexState && this._fxTexState.dot !== undefined && (this._fxTexState.dot || this._fxTexState.halo)) {
            attachFxParticle(this._fxTexState)
          } else {
            this._pendingFxParticles = this._pendingFxParticles || []
            this._pendingFxParticles.push(attachFxParticle)
            if (!this._fxParticleTimer) {
              this._fxParticleTimer = setTimeout(function () {
                var list = self2._pendingFxParticles || []
                self2._pendingFxParticles = []
                for (var pi = 0; pi < list.length; pi++) list[pi](self2._fxTexState || { dot: false, halo: false })
              }, 2500)
            }
          }
        }

        // 3. 特效节点的子节点挂到 wrapper 下（嵌套轨道：轨迹/子球挂在能量球下）
        var fxChildren = node.children || []
        for (var fc = 0; fc < fxChildren.length; fc++) this._mountNode(fxChildren[fc], wrapper)

        return wrapper
      },

      _createModelNode: function (node, assetId, url, parent, container) {
        var self = this
        var scene = this._scene
        var shadow = this._shadow
        var xfs = this._xfs
        var props = node.props || {}
        if (!scene || !shadow || !xfs || !url) return null

        var loadStart = Date.now()
        this._log('开始加载模型[' + assetId + ']: ' + url)
        this._cdnProbe(url)

        var load = this._assetPromises[assetId]
        if (!load) {
          load = scene.assets.loadAsset({
            type: 'gltf',
            assetId: assetId,
            src: url
          }).catch(function (err) {
            delete self._assetPromises[assetId]
            self._log('模型加载失败[' + assetId + ']: ' + ((err && (err.errMsg || err.message)) || err))
            throw err
          })
          this._assetPromises[assetId] = load
        }

        load.then(function () {
          // 如果外部已提供容器（tapPlace 需要先拿到节点做 AR placeHere），则复用容器
          var wrapper = container
          if (!wrapper) {
            wrapper = scene.createElement(xfs.XRNode, {
              position: vec3(node.transform && node.transform.position),
              rotation: degVec3(node.transform && node.transform.rotation),
              scale: vec3(node.transform && node.transform.scale, '1 1 1')
            })
            if (node.id) wrapper.setId(String(node.id))
            parent.addChild(wrapper)
            self._nodeMap[node.id] = wrapper
            self._registerNodeLogic(node, wrapper)
          }
          var gltf = scene.createElement(xfs.XRGLTF, {
            model: assetId,
            'anim-autoplay': (props.animAutoplay !== false && !(self._debug && self._debug.disableAnim)) ? '' : undefined,
          })
          wrapper.addChild(gltf)
          // 材质兼容处理：只把声明为 BLEND 的透明材质转成 MASK（OPAQUE 材质绝不能动，
          // 强制 MASK 会在贴图 alpha<0.5 时把整个模型裁剪到消失）
          try {
            var gltfComp = gltf.getComponent && gltf.getComponent('gltf')
            var nodeMap = gltfComp && (gltfComp._nodeMap || gltfComp.nodeMap)
            var meshes = gltfComp && (gltfComp._meshes || gltfComp.meshes) || []
            var repaired = 0
            if (nodeMap) {
              nodeMap.forEach && nodeMap.forEach(function (n) {
                if (!n) return
                var mlist = n.meshes
                var arr = Array.isArray(mlist) ? mlist : (mlist != null ? [mlist] : [])
                for (var mi = 0; mi < arr.length; mi++) {
                  var tm = (typeof arr[mi] === 'number') ? meshes[arr[mi]] : arr[mi]
                  if (tm && tm.material && tm.material.alphaMode === 'BLEND') {
                    tm.material.alphaMode = 'MASK'
                    tm.material.alphaCutoff = 0.5
                    tm.material.renderQueue = 2000
                    if (tm.material.setRenderState) {
                      tm.material.setRenderState('depthWrite', true)
                      tm.material.setRenderState('depthTest', true)
                    }
                    repaired++
                  }
                }
              })
            }
            // 渲染探针：确认 xr-frame 内部真的创建了网格与动画
            var probe = []
            if (gltfComp) {
              probe.push('nodeMap:' + (nodeMap && nodeMap.size !== undefined ? nodeMap.size : 'n/a'))
              probe.push('meshes:' + (meshes && meshes.length !== undefined ? meshes.length : 'n/a'))
              var anims = gltfComp.anims || gltfComp._anims
              probe.push('anims:' + (anims && anims.length !== undefined ? anims.length : 'n/a'))
            } else {
              probe.push('gltf组件未找到!')
            }
            self._log('GLTF探针: ' + probe.join(' / ') + ' / 修复透明材质:' + repaired)
          } catch (e3) {
            console.warn('[wxar-runtime] glb material repair skipped', node.id, e3)
          }
          var children = node.children || []
          for (var i = 0; i < children.length; i++) self._mountNode(children[i], wrapper)
          self._log('模型已挂载[' + assetId + ']: 耗时 ' + (Date.now() - loadStart) + 'ms，缩放 ' + JSON.stringify((node.transform && node.transform.scale) || [1, 1, 1]))
        }).catch(function (err) {
          self._log('模型挂载异常[' + assetId + ']: ' + ((err && (err.errMsg || err.message)) || err))
        })
        return null
      },

      _clearAll: function () {
        var shadow = this._shadow
        if (!shadow || !this._nodeMap) return
        for (var id in this._nodeMap) {
          var node = this._nodeMap[id]
          try {
            if (node && node.release) node.release()
          } catch (e) {}
        }
        this._nodeMap = {}
        this._nodeData = {}
        this._scripts = {}
        this._pathCurves = {}
        // 灯光计数也要重置：xr-frame 全程限 6 盏，不重置会让二次挂载的灯被静默拒绝
        this._lightCounts = { ambient: 0, directional: 0, extra: 0 }
        this._input = { keys: {}, pressed: {}, pointer: null, clicked: false }
        this._spawnTimes = {}
        this._gestureTargetId = null
        this._gesture = null
        try { if (shadow.clear) shadow.clear() } catch (e) {}
      },

      setTransform: function (id, transform) {
        var node = this._nodeMap && this._nodeMap[id]
        if (!node) return
        try {
          if (node.position) {
            node.position.x = transform.position[0]
            node.position.y = transform.position[1]
            node.position.z = transform.position[2]
            node.rotation.x = transform.rotation[0]
            node.rotation.y = transform.rotation[1]
            node.rotation.z = transform.rotation[2]
            node.scale.x = transform.scale[0]
            node.scale.y = transform.scale[1]
            node.scale.z = transform.scale[2]
          } else if (node.setAttribute) {
            node.setAttribute('position', vec3(transform.position))
            node.setAttribute('rotation', degVec3(transform.rotation))
            node.setAttribute('scale', vec3(transform.scale, '1 1 1'))
          }
        } catch (e) {}
      },

      removeNode: function (id) {
        var node = this._nodeMap && this._nodeMap[id]
        if (!node) return
        try { if (node.release) node.release() } catch (e) {}
        delete this._nodeMap[id]
        delete this._nodeData[id]
        delete this._scripts[id]
        delete this._spawnTimes[id]
      },

      alignContent: function (relocVioPos, relocWorldPos, vioR, items, heightClampM) {
        // 与 wxar-mini 的 alignContent 相同的世界坐标 -> VIO 坐标换算
        var self = this
        if (!relocVioPos || !relocWorldPos || !items) return
        for (var i = 0; i < items.length; i++) {
          var item = items[i]
          if (!item || !item.id || !item.worldPos) continue
          var dx = item.worldPos[0] - relocWorldPos[0]
          var dy = item.worldPos[1] - relocWorldPos[1]
          var dz = item.worldPos[2] - relocWorldPos[2]
          var hc = heightClampM || 0
          if (hc > 0) { if (dy > hc) dy = hc; else if (dy < -hc) dy = -hc }
          var vx, vy, vz
          if (vioR) {
            vx = vioR[0] * dx + vioR[3] * dy + vioR[6] * dz + relocVioPos[0]
            vy = vioR[1] * dx + vioR[4] * dy + vioR[7] * dz + relocVioPos[1]
            vz = vioR[2] * dx + vioR[5] * dy + vioR[8] * dz + relocVioPos[2]
          } else {
            vx = dx + relocVioPos[0]
            vy = dy + relocVioPos[1]
            vz = dz + relocVioPos[2]
          }
          var node = this._nodeMap && this._nodeMap[item.id]
          if (!node) continue
          try {
            if (node.position) {
              node.position.x = vx
              node.position.y = vy
              node.position.z = vz
            } else if (node.setAttribute) {
              node.setAttribute('position', vx + ' ' + vy + ' ' + vz)
            }
          } catch (e) {}
        }
      }
    }
  }
}

function createXrGameComponent() {
  return makeXrGameComponent()
}

module.exports = {
  createXrGameComponent: createXrGameComponent,
  GEOMETRY_NAMES: GEOMETRY_NAMES,
  vec3: vec3,
  colorToUniforms: colorToUniforms
}
