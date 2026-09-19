import { ENV_PRESET_LABEL } from '@/editor/scene/environment'
import { useEditor } from '@/editor/store'
import type { EnvPreset } from '@/engine/core/types'
import { NumberField, Section, SelectField, ToggleField } from '@/editor/ui/controls'

export function PostFXPanel() {
  const postfx = useEditor((s) => s.postfx)
  const patchPostFX = useEditor((s) => s.patchPostFX)
  const setPostFXEnabled = useEditor((s) => s.setPostFXEnabled)
  const environment = useEditor((s) => s.environment)
  const setEnvironment = useEditor((s) => s.setEnvironment)
  const assets = useEditor((s) => s.assets)
  const hdriAssets = assets.filter((a) => a.kind === 'hdri')
  const hdriOptions = [
    { value: '', label: '程序化预设' },
    ...hdriAssets.map((a) => ({ value: a.id, label: a.name })),
  ]

  return (
    <div>
      <Section title="后处理总开关">
        <ToggleField label="启用" value={postfx.enabled} onChange={setPostFXEnabled} />
        <div className="hint">
          全部效果关闭时不会创建 EffectComposer，等于零开销。AR 会话中建议关闭景深和暗角
          —— 它们会让实景画面看起来很脏。
        </div>
      </Section>

      <Section title="泛光 Bloom">
        <ToggleField
          label="启用"
          value={postfx.bloom.enabled}
          onChange={(enabled) => patchPostFX('bloom', { enabled })}
        />
        <NumberField
          label="强度"
          value={postfx.bloom.intensity}
          min={0}
          max={5}
          step={0.05}
          onChange={(intensity) => patchPostFX('bloom', { intensity })}
        />
        <NumberField
          label="亮度阈值"
          value={postfx.bloom.luminanceThreshold}
          min={0}
          max={1}
          step={0.01}
          onChange={(luminanceThreshold) => patchPostFX('bloom', { luminanceThreshold })}
        />
        <NumberField
          label="过渡"
          value={postfx.bloom.luminanceSmoothing}
          min={0}
          max={1}
          step={0.01}
          onChange={(luminanceSmoothing) => patchPostFX('bloom', { luminanceSmoothing })}
        />
        <NumberField
          label="半径"
          value={postfx.bloom.radius}
          min={0}
          max={1}
          step={0.01}
          onChange={(radius) => patchPostFX('bloom', { radius })}
        />
      </Section>

      <Section title="景深 Depth of Field" defaultOpen={false}>
        <ToggleField
          label="启用"
          value={postfx.depthOfField.enabled}
          onChange={(enabled) => patchPostFX('depthOfField', { enabled })}
        />
        <NumberField
          label="对焦距离"
          value={postfx.depthOfField.focusDistance}
          min={0}
          max={0.2}
          step={0.001}
          slider={false}
          precision={4}
          onChange={(focusDistance) => patchPostFX('depthOfField', { focusDistance })}
        />
        <NumberField
          label="焦距"
          value={postfx.depthOfField.focalLength}
          min={0}
          max={0.2}
          step={0.001}
          slider={false}
          precision={4}
          onChange={(focalLength) => patchPostFX('depthOfField', { focalLength })}
        />
        <NumberField
          label="散景强度"
          value={postfx.depthOfField.bokehScale}
          min={0}
          max={12}
          step={0.1}
          onChange={(bokehScale) => patchPostFX('depthOfField', { bokehScale })}
        />
      </Section>

      <Section title="色散 / 噪点" defaultOpen={false}>
        <ToggleField
          label="色散"
          value={postfx.chromaticAberration.enabled}
          onChange={(enabled) => patchPostFX('chromaticAberration', { enabled })}
        />
        <NumberField
          label="X 偏移"
          value={postfx.chromaticAberration.offset[0]}
          min={0}
          max={0.01}
          step={0.0001}
          slider={false}
          precision={5}
          onChange={(x) =>
            patchPostFX('chromaticAberration', { offset: [x, postfx.chromaticAberration.offset[1]] })
          }
        />
        <NumberField
          label="Y 偏移"
          value={postfx.chromaticAberration.offset[1]}
          min={0}
          max={0.01}
          step={0.0001}
          slider={false}
          precision={5}
          onChange={(y) =>
            patchPostFX('chromaticAberration', { offset: [postfx.chromaticAberration.offset[0], y] })
          }
        />
        <ToggleField
          label="胶片噪点"
          value={postfx.noise.enabled}
          onChange={(enabled) => patchPostFX('noise', { enabled })}
        />
        <NumberField
          label="噪点强度"
          value={postfx.noise.opacity}
          min={0}
          max={0.5}
          step={0.005}
          onChange={(opacity) => patchPostFX('noise', { opacity })}
        />
      </Section>

      <Section title="暗角 / 色调映射">
        <ToggleField
          label="暗角"
          value={postfx.vignette.enabled}
          onChange={(enabled) => patchPostFX('vignette', { enabled })}
        />
        <NumberField
          label="暗度"
          value={postfx.vignette.darkness}
          min={0}
          max={1}
          step={0.01}
          onChange={(darkness) => patchPostFX('vignette', { darkness })}
        />
        <NumberField
          label="范围"
          value={postfx.vignette.offset}
          min={0}
          max={1}
          step={0.01}
          onChange={(offset) => patchPostFX('vignette', { offset })}
        />
        <ToggleField
          label="AGX 色调"
          value={postfx.toneMapping.enabled}
          onChange={(enabled) => patchPostFX('toneMapping', { enabled })}
        />
        <NumberField
          label="曝光"
          value={postfx.toneMapping.exposure}
          min={0.1}
          max={3}
          step={0.05}
          onChange={(exposure) => patchPostFX('toneMapping', { exposure })}
        />
      </Section>

      <Section title="环境光照">
        <SelectField
          label="HDRI"
          value={environment.hdriAssetId ?? ''}
          options={hdriOptions}
          onChange={(v) => setEnvironment({ hdriAssetId: v || null })}
        />
        <SelectField
          label="预设"
          value={environment.preset}
          options={(Object.keys(ENV_PRESET_LABEL) as EnvPreset[]).map((k) => ({
            value: k,
            label: ENV_PRESET_LABEL[k],
          }))}
          onChange={(preset) => setEnvironment({ preset })}
        />
        <NumberField
          label="环境强度"
          value={environment.intensity}
          min={0}
          max={4}
          step={0.05}
          onChange={(intensity) => setEnvironment({ intensity })}
        />
        <NumberField
          label="模糊"
          value={environment.blur}
          min={0}
          max={0.04}
          step={0.002}
          onChange={(blur) => setEnvironment({ blur })}
        />
        <ToggleField
          label="显示背景"
          value={environment.background}
          onChange={(background) => setEnvironment({ background })}
        />
        <div className="hint">
          环境默认由 PMREM 从程序化场景实时烘焙，不依赖外网；也可以选择资产库里的 HDR/全景图作为自定义环境。
        </div>
      </Section>
    </div>
  )
}
