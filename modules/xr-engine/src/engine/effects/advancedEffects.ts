import * as THREE from 'three'
import { getFxParticleScale } from './qualityBridge'

/**
 * 真正的“高级特效”实现。
 *
 * 不是用几个基本几何体拼一拼，而是：
 * - 黑洞：GPU 粒子吸积盘 + 光子环 + 中心事件视界 shader + 外围尘埃
 * - 能量球：GPU 粒子轨道外壳 + 核心 fresnel 脉冲 + 加色光晕
 *
 * 所有粒子都在顶点着色器里运动，CPU 每帧只上传 uTime，
 * 在手机上也能承受。
 */

function makeSoftCircleMaterial(params: {
  color: THREE.Color
  size: number
  additive?: boolean
  opacity?: number
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: params.color },
      uSize: { value: params.size },
      uOpacity: { value: params.opacity ?? 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aSize;
      uniform float uSize;
      varying float vSeed;
      void main() {
        vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * aSize * (280.0 / max(-mv.z, 0.001));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vSeed;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.08, d) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: params.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
  })
}

function makeBlackHoleDisk(): THREE.Points {
  const count = Math.max(200, Math.floor(12_000 * getFxParticleScale()))
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const sizes = new Float32Array(count)
  const angles = new Float32Array(count)
  const radii = new Float32Array(count)
  const speeds = new Float32Array(count)

  for (let i = 0; i < count; i += 1) {
    seeds[i] = Math.random()
    angles[i] = Math.random() * Math.PI * 2
    // 越靠近中心越密集
    radii[i] = 0.35 + Math.pow(Math.random(), 0.65) * 2.2
    speeds[i] = 0.15 + Math.random() * 0.45
    sizes[i] = 0.5 + Math.random() * 1.4
    positions[i * 3 + 1] = (Math.random() - 0.5) * 0.12
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geo.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1))
  geo.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1))
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#ff7a18') },
      uInner: { value: 0.45 },
      uOuter: { value: 2.6 },
      uSwirl: { value: 7.0 },
      uThickness: { value: 0.14 },
      uSize: { value: 18 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aAngle;
      attribute float aRadius;
      attribute float aSpeed;
      attribute float aSize;
      uniform float uTime;
      uniform float uInner;
      uniform float uOuter;
      uniform float uSwirl;
      uniform float uThickness;
      uniform float uSize;
      varying float vLife;
      varying float vSeed;
      void main() {
        float life = fract(uTime * aSpeed * 0.12 + aSeed);
        float r = mix(uOuter, uInner, life);
        float angle = aAngle + life * uSwirl * (1.0 - life * 0.4);
        vec3 p = vec3(
          cos(angle) * r,
          (aSeed - 0.5) * uThickness * (1.0 - life),
          sin(angle) * r
        );
        vLife = life;
        vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // 点尺寸因子 300→90：编辑器典型视距（8~15m）下单颗粒子曾达 500px+，
        // 数千颗加色混合会把整屏糊成白色；缩小后单球呈紧凑光晕
        gl_PointSize = uSize * aSize * (90.0 / max(-mv.z, 0.001));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vLife;
      varying float vSeed;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float fade = smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
        float heat = mix(1.0, 0.35, vLife);
        vec3 col = uColor * heat + vec3(1.0, 0.85, 0.6) * pow(vLife, 3.0) * 0.8;
        float a = smoothstep(0.5, 0.03, d) * fade;
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.userData.fxPart = 'blackhole-disk'
  return points
}

function makeBlackHoleCore(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.46, 48, 32)
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p);
        float a = atan(p.y, p.x);
        float swirl = a + (1.0 - r) * 8.0 + uTime * 0.6;
        float ring = smoothstep(0.18, 0.24, r) * smoothstep(0.48, 0.44, r);
        vec3 col = vec3(0.0);
        col += vec3(1.0, 0.5, 0.15) * pow(ring, 4.0) * 1.4;
        col += vec3(0.7, 0.45, 1.0) * pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.0) * 0.4;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.userData.fxMesh = 'blackhole-core'
  return mesh
}

function makeEnergyShellParticles(): THREE.Points {
  const count = Math.max(120, Math.floor(4_000 * getFxParticleScale()))
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const sizes = new Float32Array(count)
  const angles = new Float32Array(count)
  const speeds = new Float32Array(count)

  for (let i = 0; i < count; i += 1) {
    seeds[i] = Math.random()
    angles[i] = Math.random() * Math.PI * 2
    speeds[i] = 0.4 + Math.random() * 0.8
    sizes[i] = 0.5 + Math.random() * 1.0
    positions[i * 3] = (Math.random() - 0.5) * 0.4
    positions[i * 3 + 1] = (Math.random() - 0.5) * 0.4
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.4
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geo.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1))
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#00e5ff') },
      uSize: { value: 14 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aAngle;
      attribute float aSpeed;
      attribute float aSize;
      uniform float uTime;
      uniform float uSize;
      varying float vSeed;
      void main() {
        float life = fract(uTime * aSpeed * 0.08 + aSeed);
        // 球面均匀分布（标准球坐标采样）：
        //   纬度：cz = 2·seed − 1（seed 均匀 → 球面密度均匀）
        //   经度：phi = 初相 + t·ω，ω 用 aSpeed（与纬度独立的随机源）
        //   半径：全局同相呼吸（不会产生图案）+ 每粒子独立相位微扰（相位用
        //         aSpeed·2π，与纬度无关）——旧写法脉动相位挂在 seed 上，与纬度
        //         强相关，粒子排成相干螺旋带，加色后呈「花瓣/齿轮」状。
        float cz = aSeed * 2.0 - 1.0;
        float s = sqrt(max(0.0, 1.0 - cz * cz));
        float phi = aAngle + uTime * (0.25 + aSpeed * 0.35) + life * 2.5;
        float r = 0.58
          + 0.06 * sin(uTime * 1.5)
          + 0.05 * sin(uTime * 2.3 + aSpeed * 6.2832);
        vec3 p = vec3(
          s * cos(phi) * r,
          cz * r,
          s * sin(phi) * r
        );
        vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // 点尺寸因子 300→90：编辑器典型视距（8~15m）下单颗粒子曾达 500px+，
        // 数千颗加色混合会把整屏糊成白色；缩小后单球呈紧凑光晕
        gl_PointSize = uSize * aSize * (90.0 / max(-mv.z, 0.001));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vSeed;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.05, d) * (0.35 + 0.65 * fract(vSeed * 7.0));
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.userData.fxPart = 'energy-shell'
  return points
}

function makeEnergyCore(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.42, 40, 28)
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#00e5ff') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.2);
        float pulse = 0.75 + 0.35 * sin(uTime * 5.0);
        vec3 col = uColor * fresnel * pulse * 1.6;
        col += uColor * 0.18;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.userData.fxMesh = 'energy-core'
  return mesh
}

export function createBlackHoleEffect(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'BlackHoleFX'
  group.userData.fxType = 'blackhole'
  const coreMesh = makeBlackHoleCore()
  group.add(coreMesh)
  group.userData.fxCore = coreMesh
  const disk = makeBlackHoleDisk()
  disk.rotation.x = Math.PI * 0.42
  group.add(disk)
  group.userData.fxDisk = disk
  // 外圈尘埃
  const dust = makeSoftCircleMaterial({ color: new THREE.Color('#b388ff'), size: 10, opacity: 0.35 })
  const dustGeo = new THREE.BufferGeometry()
  const dustCount = Math.max(100, Math.floor(1500 * getFxParticleScale()))
  const dustPos = new Float32Array(dustCount * 3)
  const dustSeed = new Float32Array(dustCount)
  const dustSize = new Float32Array(dustCount)
  for (let i = 0; i < dustCount; i += 1) {
    const a = Math.random() * Math.PI * 2
    const r = 2.8 + Math.random() * 1.2
    dustPos[i * 3] = Math.cos(a) * r
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 0.5
    dustPos[i * 3 + 2] = Math.sin(a) * r
    dustSeed[i] = Math.random()
    dustSize[i] = 0.4 + Math.random() * 1.2
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dustSeed, 1))
  dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dustSize, 1))
  const dustPoints = new THREE.Points(dustGeo, dust)
  dustPoints.frustumCulled = false
  group.add(dustPoints)
  group.userData.fxDust = dustPoints
  return group
}

export function createEnergyBallEffect(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'EnergyBallFX'
  group.userData.fxType = 'energy'
  const core = makeEnergyCore()
  group.add(core)
  const shell = makeEnergyShellParticles()
  group.add(shell)
  const light = new THREE.PointLight('#00e5ff', 2.5, 6, 1.6)
  light.position.set(0, 0, 0)
  group.add(light)
  group.userData.fxCore = core
  group.userData.fxShell = shell
  group.userData.fxLight = light
  return group
}

/** 更新高级特效的 shader 时间 */
export function updateAdvancedEffectTime(group: THREE.Object3D, time: number): void {
  group.traverse((obj) => {
    const points = obj as THREE.Points
    if (points.isPoints && points.material && (points.material as THREE.ShaderMaterial).uniforms?.uTime) {
      ;(points.material as THREE.ShaderMaterial).uniforms.uTime.value = time
    }
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh && mesh.material && (mesh.material as THREE.ShaderMaterial).uniforms?.uTime) {
      ;(mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = time
    }
  })
}


/** 根据实体 props 实时更新高级特效外观（颜色/亮度/大小）。 */
export function updateAdvancedEffectProperties(group: THREE.Object3D, props: Record<string, unknown>): void {
  const fxType = String(group.userData?.fxType ?? '')
  const material = (props.material ?? {}) as Record<string, unknown>
  const geometryParams = (props.geometryParams ?? {}) as Record<string, number>

  if (fxType === 'energy') {
    const core = group.userData?.fxCore as THREE.Mesh | undefined
    const shell = group.userData?.fxShell as THREE.Points | undefined
    const light = group.userData?.fxLight as THREE.PointLight | undefined
    const color = String(material.color ?? '#00e5ff')
    const radius = Number(geometryParams.radius ?? 0.42)
    const scale = Math.max(0.05, radius / 0.42)

    const setColor = (obj: THREE.Object3D | undefined): void => {
      obj?.traverse((child) => {
        const m = (child as THREE.Mesh).material as THREE.ShaderMaterial | undefined
        if (m?.uniforms?.uColor) (m.uniforms.uColor.value as THREE.Color).set(color)
      })
    }
    setColor(core)
    setColor(shell)

    const intensity = Number(material.emissiveIntensity ?? 2)
    if (light) {
      light.color.set(color)
      light.intensity = Math.max(0, intensity * 1.4)
    }
    core?.scale.setScalar(scale)
    shell?.scale.setScalar(scale)

    // 粒子是屏幕空间尺寸：gl_PointSize = uSize*aSize*(90/dist) 等价于
    // 粒子世界直径 ≈ 0.09*uSize*aSize 米（视口高约 1000 物理像素、fov≈50°）。
    // 旧的固定 uSize=14 意味着单颗粒子世界直径 1.26 米——远处看是「光晕」，
    // 相机一近（AR/小球场景）每颗粒子数百像素，加色混合直接糊满全屏。
    // 让粒子世界尺寸跟随 fx 球体（≈核心半径的 30%）：uSize ≈ 1.3*scale。
    const shellMat = shell?.material as THREE.ShaderMaterial | undefined
    if (shellMat?.uniforms?.uSize) {
      shellMat.uniforms.uSize.value = 1.3 * scale
    }
  } else if (fxType === 'blackhole') {
    const disk = group.userData?.fxDisk as THREE.Points | undefined
    const core = group.userData?.fxCore as THREE.Mesh | undefined
    const dust = group.userData?.fxDust as THREE.Points | undefined
    const color = String(material.color ?? '#ff6d00')
    const radius = Number(geometryParams.radius ?? 0.46)
    const scale = Math.max(0.05, radius / 0.46)
    disk?.traverse((child) => {
      const m = (child as THREE.Points).material as THREE.ShaderMaterial | undefined
      if (m?.uniforms?.uColor) (m.uniforms.uColor.value as THREE.Color).set(color)
    })
    core?.scale.setScalar(scale)
    disk?.scale.setScalar(scale)
    dust?.scale.setScalar(scale)
  }
}
