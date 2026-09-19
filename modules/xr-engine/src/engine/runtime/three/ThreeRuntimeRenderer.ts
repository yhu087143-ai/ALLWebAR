import * as THREE from 'three'
import type { Entity } from '@/engine/runtime/Entity'
import type { World } from '@/engine/runtime/World'
import { loadModelFile, normalizeModelToGround } from '@/engine/assets/loader'
import { createBlackHoleMaterial, createDissolveMaterial, createEnergyBallMaterial, createHologramMaterial, createShockwaveMaterial, updateShaderTime } from '@/engine/effects/shaderEffects'
import { createBlackHoleEffect, createEnergyBallEffect, updateAdvancedEffectProperties } from '@/engine/effects/advancedEffects'
import { createRuntimeParticleField } from '@/engine/effects/runtimeParticles'

export interface ThreeRuntimeRendererOptions {
  root: THREE.Object3D
  /** 根据资产 id 找到可加载 URI（CDN/本地），用于模型节点 */
  resolveAssetUri?: (assetId: string) => string | undefined
  /** 根据资产 id 找到原始文件名（含扩展名），loader 据此选择 GLTF/OBJ/FBX 加载器 */
  resolveAssetName?: (assetId: string) => string | undefined
  /** 传入后启用 KTX2 贴图解码（需要探测设备的压缩纹理支持） */
  gl?: THREE.WebGLRenderer
  onReady?: (entity: Entity, object: THREE.Object3D) => void
}

function buildGeometry(
  kind: string,
  p: Record<string, number> = {}
): THREE.BufferGeometry {
  switch (kind) {
    case 'box':
      return new THREE.BoxGeometry(p.width ?? 1, p.height ?? 1, p.depth ?? 1, p.widthSegments ?? 1, p.heightSegments ?? 1, p.depthSegments ?? 1)
    case 'sphere':
      return new THREE.SphereGeometry(p.radius ?? 0.5, p.widthSegments ?? 16, p.heightSegments ?? 12)
    case 'plane':
      return new THREE.PlaneGeometry(p.width ?? 1, p.height ?? 1, p.widthSegments ?? 1, p.heightSegments ?? 1)
    case 'cylinder':
      return new THREE.CylinderGeometry(p.radiusTop ?? 0.5, p.radiusBottom ?? 0.5, p.height ?? 1, p.radialSegments ?? 16)
    case 'cone':
      return new THREE.ConeGeometry(p.radius ?? 0.5, p.height ?? 1, p.radialSegments ?? 16)
    case 'torus':
      return new THREE.TorusGeometry(p.radius ?? 0.5, p.tube ?? 0.2, p.radialSegments ?? 12, p.tubularSegments ?? 24)
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(p.radius ?? 0.5, p.detail ?? 0)
    default:
      return new THREE.BoxGeometry(1, 1, 1)
  }
}

function buildMaterial(props: Record<string, unknown>): THREE.MeshStandardMaterial {
  const mat = (props.material ?? {}) as Record<string, unknown>
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(String(mat.color ?? '#ffffff')),
    metalness: Number(mat.metalness ?? 0),
    roughness: Number(mat.roughness ?? 0.8),
    emissive: new THREE.Color(String(mat.emissive ?? '#000000')),
    emissiveIntensity: Number(mat.emissiveIntensity ?? 0),
    wireframe: Boolean(mat.wireframe),
    transparent: Number(mat.opacity ?? 1) < 1,
    opacity: Number(mat.opacity ?? 1),
  })
}

/** 材质贴图槽位（与 loader.ts 的 MATERIAL_TEXTURE_SLOTS 保持一致） */
const MATERIAL_TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
] as const

/** mat.dispose() 不会释放挂在上面的 Texture，需要逐一处理 */
function disposeMaterial(mat: THREE.Material | undefined): void {
  if (!mat) return
  const m = mat as unknown as Record<string, unknown>
  for (const slot of MATERIAL_TEXTURE_SLOTS) {
    const tex = m[slot] as THREE.Texture | null | undefined
    tex?.dispose()
  }
  mat.dispose()
}

/**
 * 把游戏运行时 World 同步到 Three.js 场景。
 * 未来 Web 预览和 WebXR AR 都能用它渲染 GameRuntime 实体。
 */
export class ThreeRuntimeRenderer {
  private readonly objectByEntity = new Map<string, THREE.Object3D>()
  private readonly root: THREE.Object3D
  private readonly resolveAssetUri?: (assetId: string) => string | undefined
  private readonly resolveAssetName?: (assetId: string) => string | undefined
  private readonly gl?: THREE.WebGLRenderer
  private readonly onReady?: (entity: Entity, object: THREE.Object3D) => void

  constructor(options: ThreeRuntimeRendererOptions) {
    this.root = options.root
    this.resolveAssetUri = options.resolveAssetUri
    this.resolveAssetName = options.resolveAssetName
    this.gl = options.gl
    this.onReady = options.onReady
  }

  sync(world: World): void {
    for (const entity of world.roots) {
      this.ensureEntity(entity, this.root)
    }
    // 清理已销毁实体
    for (const [id, obj] of this.objectByEntity) {
      if (!world.entities.has(id)) {
        obj.parent?.remove(obj)
        this.disposeObject(obj)
        this.objectByEntity.delete(id)
        this.entityById.delete(id)
        this.fxEntities.delete(id)
        for (const key of [...this.loadPromises.keys()]) {
          if (key.startsWith(`${id}:`)) this.loadPromises.delete(key)
        }
      }
    }
  }

  update(dt = 0): void {
    this.shaderTime += dt
    for (const [id, obj] of this.objectByEntity) {
      const entity = this.findEntityById(id)
      if (entity) this.applyTransform(entity, obj)
      const mixer = obj.userData.mixer as THREE.AnimationMixer | undefined
      if (mixer && entity) mixer.timeScale = Number((entity.props as { animationSpeed?: number }).animationSpeed ?? 1)
      mixer?.update(dt)
      // 只有带 shader 特效/自定义 shader/粒子的实体才需要逐帧刷新 uniform，
      // 普通网格和模型不做全子树 traverse
      if (this.fxEntities.has(id)) {
        if (entity) updateAdvancedEffectProperties(obj, entity.props)
        updateShaderTime(obj, this.shaderTime)
      }
    }
  }

  dispose(): void {
    for (const obj of this.objectByEntity.values()) {
      obj.parent?.remove(obj)
      this.disposeObject(obj)
    }
    this.objectByEntity.clear()
    this.entityById.clear()
    this.fxEntities.clear()
    this.loadPromises.clear()
    for (const geometry of this.geometryCache.values()) geometry.dispose()
    this.geometryCache.clear()
  }

  private findEntityById(id: string): Entity | null {
    // 简化：所有实体都通过回调放在一个侧表？这里从 sync 时记录 entity 引用
    const entry = this.entityById.get(id)
    return entry ?? null
  }

  private readonly entityById = new Map<string, Entity>()
  /** 需要逐帧刷新 shader uniform 的实体（特效/自定义 shader/粒子） */
  private readonly fxEntities = new Set<string>()
  private readonly loadPromises = new Map<string, Promise<void>>()
  /** 几何体缓存：同类型同参数的网格共享一份 BufferGeometry，dispose() 时统一释放 */
  private readonly geometryCache = new Map<string, THREE.BufferGeometry>()
  private shaderTime = 0

  private ensureEntity(entity: Entity, parent: THREE.Object3D): THREE.Object3D {
    const existing = this.objectByEntity.get(entity.id)
    if (existing) {
      if (existing.parent !== parent) parent.add(existing)
      return existing
    }

    const object = this.createObject(entity)
    object.name = entity.name
    object.userData.runtimeEntityId = entity.id
    parent.add(object)
    this.objectByEntity.set(entity.id, object)
    this.entityById.set(entity.id, entity)
    if (this.hasFx(entity)) this.fxEntities.add(entity.id)
    this.applyTransform(entity, object)
    this.onReady?.(entity, object)

    for (const child of entity.children) this.ensureEntity(child, object)
    return object
  }

  private hasFx(entity: Entity): boolean {
    const props = entity.props as Record<string, any>
    return (
      Boolean(props.effect ?? props.fx ?? props.effectName) ||
      Boolean(props.customShader) ||
      props.kind === 'particle'
    )
  }

  private buildGeometryCached(kind: string, params: Record<string, number>): THREE.BufferGeometry {
    const key = `${kind}:${JSON.stringify(params ?? {})}`
    let geometry = this.geometryCache.get(key)
    if (!geometry) {
      geometry = buildGeometry(kind, params)
      this.geometryCache.set(key, geometry)
    }
    return geometry
  }

  private isCachedGeometry(geometry: THREE.BufferGeometry): boolean {
    for (const cached of this.geometryCache.values()) {
      if (cached === geometry) return true
    }
    return false
  }

  private createObject(entity: Entity): THREE.Object3D {
    const props = entity.props as Record<string, any>
    if (props.kind === 'mesh' || props.geometry) {
      const effect = String(props.effect ?? props.fx ?? props.effectName ?? '')
      if (effect === 'blackhole' || effect === 'black-hole' || effect === 'black_hole') {
        return createBlackHoleEffect()
      }
      if (effect === 'energy' || effect === 'energy-ball' || effect === 'energy_ball') {
        return createEnergyBallEffect()
      }
      // 轻量 shader 特效（与微信端同 id 契约）：换当前几何体的材质
      if (effect === 'dissolve' || effect === 'dis-solve' || effect === 'dis_solve') {
        return this.createShaderFxMesh(props, createDissolveMaterial())
      }
      if (effect === 'hologram' || effect === 'holo-gram' || effect === 'holo_gram') {
        return this.createShaderFxMesh(props, createHologramMaterial())
      }
      if (effect === 'shockwave' || effect === 'shock-wave' || effect === 'shock_wave') {
        return this.createShaderFxMesh(props, createShockwaveMaterial())
      }
      const geometry = this.buildGeometryCached(String(props.geometry ?? 'box'), (props.geometryParams ?? {}) as Record<string, number>)
      const cs = props.customShader as { vertex?: string; fragment?: string; uniforms?: Record<string, unknown> } | undefined
      const material = cs?.vertex && cs?.fragment
        ? new THREE.ShaderMaterial({
            vertexShader: cs.vertex,
            fragmentShader: cs.fragment,
            uniforms: Object.fromEntries(
              Object.entries(cs.uniforms ?? {}).map(([k, v]) => [k, { value: v }])
            ),
            transparent: Boolean((cs.uniforms as Record<string, unknown> | undefined)?.opacity !== undefined || props.material?.opacity < 1),
          })
        : buildMaterial(props)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.castShadow = Boolean(props.castShadow)
      mesh.receiveShadow = Boolean(props.receiveShadow)
      return mesh
    }

    if (props.kind === 'particle') {
      return createRuntimeParticleField(props)
    }

    if (props.kind === 'model' || props.modelUrl || props.assetId) {
      const group = new THREE.Group()
      group.userData.runtimeModelPending = true
      const uri = props.modelUrl || props.uri || (props.assetId ? this.resolveAssetUri?.(String(props.assetId)) : undefined)
      if (uri) {
        this.loadModelIntoGroup(entity, group, String(uri))
      }
      return group
    }

    return new THREE.Group()
  }

  /** 轻量 shader 特效网格：共享缓存几何体 + shader 材质，uColor 初始取材质颜色，uTime 由 updateShaderTime 逐帧推进 */
  private createShaderFxMesh(props: Record<string, any>, material: THREE.ShaderMaterial): THREE.Mesh {
    const geometry = this.buildGeometryCached(String(props.geometry ?? 'box'), (props.geometryParams ?? {}) as Record<string, number>)
    const color = props.material?.color
    if (color && material.uniforms.uColor) (material.uniforms.uColor.value as THREE.Color).set(String(color))
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = Boolean(props.castShadow)
    mesh.receiveShadow = Boolean(props.receiveShadow)
    return mesh
  }

  /** loader 按文件名扩展名选择加载器：优先资产库原始文件名，其次 URI 自带的文件名 */
  private resolveModelName(entity: Entity, uri: string): string {
    const props = entity.props as Record<string, any>
    const fromAsset = props.assetId ? this.resolveAssetName?.(String(props.assetId)) : undefined
    if (fromAsset) return fromAsset
    const fromUri = uri.split(/[?#]/)[0].split(/[\\/]/).pop()
    if (fromUri && /\.[a-z0-9]+$/i.test(fromUri)) return fromUri
    return entity.name
  }

  private loadModelIntoGroup(entity: Entity, group: THREE.Group, uri: string): void {
    const key = `${entity.id}:${uri}`
    if (this.loadPromises.has(key)) return
    const promise = loadModelFile(uri, this.resolveModelName(entity, uri), this.gl)
      .then((loaded) => {
        const model = loaded.scene
        const target = this.objectByEntity.get(entity.id)
        if (!target || target !== group) {
          // 实体已被销毁或渲染器已重建，忽略旧加载结果
          return
        }
        const props = entity.props as Record<string, any>
        if (props.normalizeModel !== false) {
          normalizeModelToGround(model)
        }
        model.traverse((obj) => {
          const mesh = obj as THREE.Mesh
          if (mesh.isMesh) {
            mesh.castShadow = Boolean(props.castShadow)
            mesh.receiveShadow = Boolean(props.receiveShadow)
          }
        })
        group.clear()
        group.add(model)
        group.userData.runtimeModelPending = false
        if (loaded.animations?.length) {
          const mixer = new THREE.AnimationMixer(model)
          const clip = THREE.AnimationClip.findByName(loaded.animations, props.activeAnimation) ?? loaded.animations[0]
          if (clip) mixer.clipAction(clip).play()
          group.userData.mixer = mixer
        }
        this.onReady?.(entity, group)
      })
      .catch((err) => {
        console.error('[ThreeRuntimeRenderer] 模型加载失败', entity.name, uri, err)
        group.userData.runtimeModelError = true
      })
      .finally(() => this.loadPromises.delete(key))
    this.loadPromises.set(key, promise)
  }

  private applyTransform(entity: Entity, object: THREE.Object3D): void {
    const t = entity.transform
    object.position.set(t.position[0], t.position[1], t.position[2])
    object.rotation.set(t.rotation[0], t.rotation[1], t.rotation[2])
    object.scale.set(t.scale[0], t.scale[1], t.scale[2])
    object.visible = entity.active
  }

  private disposeObject(obj: THREE.Object3D): void {
    this.disposeMixer(obj)
    obj.traverse((child) => {
      this.disposeMixer(child)
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) {
        // 共享几何体由 geometryCache 统一释放
        if (mesh.geometry && !this.isCachedGeometry(mesh.geometry)) mesh.geometry.dispose()
        const mat = mesh.material
        if (Array.isArray(mat)) mat.forEach(disposeMaterial)
        else disposeMaterial(mat)
      }
      const points = child as THREE.Points
      if (points.isPoints) {
        points.geometry?.dispose()
        const mat = points.material
        if (Array.isArray(mat)) mat.forEach(disposeMaterial)
        else disposeMaterial(mat)
      }
    })
  }

  private disposeMixer(obj: THREE.Object3D): void {
    const mixer = obj.userData?.mixer as THREE.AnimationMixer | undefined
    if (!mixer) return
    mixer.stopAllAction()
    mixer.uncacheRoot(mixer.getRoot() as THREE.Object3D)
    obj.userData.mixer = undefined
  }
}
