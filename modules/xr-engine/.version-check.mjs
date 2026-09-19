const pkgs = [
  'three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing',
  'postprocessing', 'zustand', 'react', 'react-dom', 'vite', '@vitejs/plugin-react',
  'typescript', '@types/three', '@types/react', '@types/react-dom',
  '@gltf-transform/core', '@gltf-transform/extensions', '@gltf-transform/functions', 'nanoid',
]

const enc = (p) => p.replace('/', '%2F')

const results = await Promise.all(
  pkgs.map(async (p) => {
    try {
      const res = await fetch(`https://registry.npmmirror.com/${enc(p)}/latest`)
      if (!res.ok) return `${p} = HTTP ${res.status}`
      const json = await res.json()
      return `${p} = ${json.version}`
    } catch (e) {
      return `${p} = ERR ${e.message}`
    }
  })
)

console.log(results.join('\n'))
