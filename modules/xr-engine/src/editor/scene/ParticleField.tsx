import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useEditor } from '@/editor/store'
import { getQualityPreset } from '@/engine/plugins/builtin/quality'

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSpread;
  uniform float uSpeed;
  uniform float uSize;

  attribute float aSeed;
  attribute float aScale;

  varying float vAlpha;

  void main() {
    // 每个粒子沿自己的相位循环，形成持续不断的发射效果
    float lifetime = fract(uTime * uSpeed * 0.22 + aSeed);

    vec3 p = position;
    p.y += lifetime * uSpread.y;
    p.x += sin(lifetime * 6.2831 + aSeed * 12.0) * uSpread.x * 0.35;
    p.z += cos(lifetime * 5.1000 + aSeed * 9.0) * uSpread.z * 0.35;

    // 生命两端做淡入淡出，避免粒子突兀地出现和消失
    vAlpha = smoothstep(0.0, 0.10, lifetime) * (1.0 - smoothstep(0.55, 1.0, lifetime));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * aScale * (300.0 / max(-mv.z, 0.001));
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.05, d) * vAlpha;
    gl_FragColor = vec4(uColor, a);
  }
`

export interface ParticleFieldProps {
  count: number
  color: string
  size: number
  speed: number
  spread: [number, number, number]
  additive: boolean
}

/**
 * GPU 驱动的粒子场。
 *
 * 位置完全在顶点着色器里算：CPU 只上传一次初始随机分布，
 * 之后每帧只更新一个 uTime，因此十万级粒子也不会占用主线程。
 */
export function ParticleField({
  count,
  color,
  size,
  speed,
  spread,
  additive,
}: ParticleFieldProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  // 按画质档位封顶。粒子数是手机上掉帧最快的一块，
  // 这里直接截断比让用户在面板里手动调要可靠。
  const qualityLevel = useEditor((s) => s.qualityLevel)
  const effectiveCount = Math.min(count, getQualityPreset(qualityLevel).maxParticles)

  const buffers = useMemo(() => {
    const positions = new Float32Array(effectiveCount * 3)
    const seeds = new Float32Array(effectiveCount)
    const scales = new Float32Array(effectiveCount)

    const spanX = Math.abs(spread[0])
    const spanZ = Math.abs(spread[2])
    // 下落类粒子（spread.y < 0）从顶部出发，上升类从底部出发
    const startY = spread[1] >= 0 ? 0 : -spread[1]

    for (let i = 0; i < effectiveCount; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * spanX
      positions[i * 3 + 1] = startY
      positions[i * 3 + 2] = (Math.random() - 0.5) * spanZ
      seeds[i] = Math.random()
      scales[i] = 0.45 + Math.random() * 0.9
    }

    return { positions, seeds, scales }
  }, [effectiveCount, spread])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uSpeed: { value: speed },
      uSpread: { value: new THREE.Vector3(...spread) },
    }),
    // uniform 对象只在首次创建，之后逐帧/逐次用命令式方式同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // 参数变化时同步到已存在的 uniform，避免重建材质
  uniforms.uColor.value.set(color)
  uniforms.uSize.value = size
  uniforms.uSpeed.value = speed
  uniforms.uSpread.value.set(...spread)

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buffers.positions, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[buffers.seeds, 1]} />
        <bufferAttribute attach="attributes-aScale" args={[buffers.scales, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </points>
  )
}
