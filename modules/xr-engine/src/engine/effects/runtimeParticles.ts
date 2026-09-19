import * as THREE from 'three'

/**
 * GameRuntime 用的通用粒子场（与编辑器 ParticleField 同一套 GPU 驱动逻辑）。
 */

export function createRuntimeParticleField(props: Record<string, unknown>): THREE.Points {
  const count = Math.max(1, Math.floor(Number(props.count ?? 2000)))
  const color = String(props.color ?? '#ffffff')
  const size = Number(props.size ?? 12)
  const speed = Number(props.speed ?? 1)
  const spread = (props.spread ?? [1, 1, 1]) as [number, number, number]
  const additive = Boolean(props.additive)

  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const scales = new Float32Array(count)

  const spanX = Math.abs(spread[0])
  const spanZ = Math.abs(spread[2])
  const startY = (spread[1] ?? 0) >= 0 ? 0 : -(spread[1] ?? 0)

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * spanX
    positions[i * 3 + 1] = startY
    positions[i * 3 + 2] = (Math.random() - 0.5) * spanZ
    seeds[i] = Math.random()
    scales[i] = 0.45 + Math.random() * 0.9
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uSpeed: { value: speed },
      uSpread: { value: new THREE.Vector3(...spread) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSpread;
      uniform float uSpeed;
      uniform float uSize;
      attribute float aSeed;
      attribute float aScale;
      varying float vAlpha;
      void main() {
        float lifetime = fract(uTime * uSpeed * 0.22 + aSeed);
        vec3 p = position;
        p.y += lifetime * uSpread.y;
        p.x += sin(lifetime * 6.2831 + aSeed * 12.0) * uSpread.x * 0.35;
        p.z += cos(lifetime * 5.1000 + aSeed * 9.0) * uSpread.z * 0.35;
        vAlpha = smoothstep(0.0, 0.10, lifetime) * (1.0 - smoothstep(0.55, 1.0, lifetime));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * aScale * (300.0 / max(-mv.z, 0.001));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.05, d) * vAlpha;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  })

  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  return points
}
