import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  Noise,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { useMemo, type ReactElement } from 'react'
import * as THREE from 'three'
import { useEditor } from '@/editor/store'
import { getQualityPreset } from '@/engine/plugins/builtin/quality'

/**
 * 后处理链。
 *
 * 两层开关：
 *   1. 用户在特效面板里的开关（主观意图）
 *   2. 画质档位白名单（硬件能力）——低端机会直接跳过整条链
 *
 * 只有两层都放行才真正创建 EffectComposer，
 * 否则连离屏渲染管线的开销都省掉。
 */
export function Effects() {
  const postfx = useEditor((s) => s.postfx)
  const qualityLevel = useEditor((s) => s.qualityLevel)
  const preset = getQualityPreset(qualityLevel)
  const allowed = new Set(preset.allowedEffects)

  const caOffset = useMemo(
    () => new THREE.Vector2(...postfx.chromaticAberration.offset),
    [postfx.chromaticAberration.offset]
  )

  if (!postfx.enabled || !preset.postfx) return null

  const effects: ReactElement[] = []

  if (postfx.bloom.enabled && allowed.has('bloom')) {
    effects.push(
      <Bloom
        key="bloom"
        intensity={postfx.bloom.intensity}
        luminanceThreshold={postfx.bloom.luminanceThreshold}
        luminanceSmoothing={postfx.bloom.luminanceSmoothing}
        radius={postfx.bloom.radius}
        mipmapBlur
      />
    )
  }

  if (postfx.depthOfField.enabled && allowed.has('depthOfField')) {
    effects.push(
      <DepthOfField
        key="dof"
        focusDistance={postfx.depthOfField.focusDistance}
        focalLength={postfx.depthOfField.focalLength}
        bokehScale={postfx.depthOfField.bokehScale}
      />
    )
  }

  if (postfx.chromaticAberration.enabled && allowed.has('chromaticAberration')) {
    effects.push(
      <ChromaticAberration
        key="ca"
        offset={caOffset}
        blendFunction={BlendFunction.NORMAL}
        radialModulation={false}
        modulationOffset={0}
      />
    )
  }

  if (postfx.noise.enabled && allowed.has('noise')) {
    effects.push(<Noise key="noise" opacity={postfx.noise.opacity} premultiply />)
  }

  if (postfx.vignette.enabled && allowed.has('vignette')) {
    effects.push(
      <Vignette key="vignette" darkness={postfx.vignette.darkness} offset={postfx.vignette.offset} />
    )
  }

  if (!effects.length) return null

  return <EffectComposer multisampling={preset.multisampling}>{effects}</EffectComposer>
}
