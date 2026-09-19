/**
 * Load a script via <script> tag.
 * Deduplicates by URL. Returns when loaded.
 */
export function loadScript(url: string, attrs?: Record<string, string>): Promise<void> {
  const existing = document.querySelector(`script[src="${url}"]`) as HTMLScriptElement | null
  if (existing) {
    if (existing.getAttribute('data-loaded') === 'true') {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve(), { once: true })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.async = true
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        script.setAttribute(k, v)
      }
    }
    script.onload = () => {
      script.setAttribute('data-loaded', 'true')
      resolve()
    }
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`))
    document.head.appendChild(script)
  })
}

/**
 * Wait for a global variable to become available.
 * Polls on requestAnimationFrame until found or timeout.
 */
export function waitForGlobal<T>(key: string, timeoutMs = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const poll = () => {
      const val = (window as any)[key]
      if (val !== undefined) return resolve(val as T)
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Global ${key} not available after ${timeoutMs}ms`))
      }
      requestAnimationFrame(poll)
    }
    poll()
  })
}
