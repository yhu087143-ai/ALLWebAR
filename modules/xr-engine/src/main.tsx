import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载点')

// 这里刻意不套 StrictMode：3D 应用下双次挂载会导致 WebGL 上下文被反复创建销毁
createRoot(container).render(<App />)
