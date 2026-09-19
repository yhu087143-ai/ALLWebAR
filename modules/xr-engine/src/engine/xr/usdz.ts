/**
 * USDZ 转换（iOS AR Quick Look 的唯一入口）。
 *
 * 浏览器端无法可靠地生成 USDZ：USD 的二进制打包需要 Apple 的 usdzconvert
 * 或 Blender/USD 工具链。因此这里统一把活儿交给后端：
 *   POST {backend}/api/v1/usdz  (form-data: file=xxx.glb)
 *   -> 返回 usdz 二进制
 *
 * 后端可用任一方案实现：
 *   - Blender + USD 导出插件
 *   - Apple usdzconvert（macOS）
 *   - obj2usdz / gltf2usd 等开源转换器
 */
export async function convertGLBtoUSDZ(backendUrl: string, glb: Blob): Promise<Blob> {
  const endpoint = `${backendUrl.replace(/\/$/, '')}/api/v1/usdz`
  const form = new FormData()
  form.append('file', glb, 'model.glb')

  const res = await fetch(endpoint, { method: 'POST', body: form })
  if (!res.ok) {
    throw new Error(`USDZ 转换失败: HTTP ${res.status} ${await res.text().catch(() => '')}`)
  }
  return await res.blob()
}

/**
 * 在 iOS 上唤起 AR Quick Look。
 * 必须是用户手势的直接结果（点击回调同步调用），否则 Safari 会拦截。
 */
export function openARQuickLook(usdzUrl: string): void {
  const anchor = document.createElement('a')
  anchor.setAttribute('rel', 'ar')
  anchor.setAttribute('href', usdzUrl)
  anchor.appendChild(document.createElement('img'))
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

/** 检测当前页面是否处于可以唤起 Quick Look 的环境 */
export function supportsQuickLook(): boolean {
  const anchor = document.createElement('a')
  return 'relList' in anchor && Boolean(anchor.relList?.supports?.('ar'))
}
