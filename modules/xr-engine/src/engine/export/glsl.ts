/**
 * 微信 xr-frame 只支持 GLSL ES 1.0（#version 100）的「子集」：
 *   - 无 layout 限定符，顶点属性/输出用 attribute / varying
 *   - 纹理采样用 texture2D
 *   - 片段输出写 gl_FragData[0]（而不是 gl_FragColor）
 *
 * 这里做「保守转译」：只处理可安全判定的语法差异，遇到无法判定的
 * 结构保持原样，并由兼容性检查继续提示。这样编辑器导出的自定义 shader
 * 能自动落到微信端能编译的形式，而不是直接报错。
 */

export type ShaderStage = 'vertex' | 'fragment'

export interface TranspileResult {
  code: string
  /** 是否没有遗留明显不兼容的语法（detected 为 false 时由兼容性检查兜底提示） */
  ok: boolean
  notes: string[]
}

export function transpileGLSL(src: string | undefined, stage: ShaderStage): TranspileResult {
  const notes: string[] = []
  let code = (src ?? '').trim()
  if (!code) return { code, ok: true, notes }

  const had300 = /#version\s+300(\s+es)?/i.test(code)
  if (had300) {
    code = code.replace(/#version\s+300(\s+es)?/i, '#version 100')
    notes.push('已把 #version 300 转为 #version 100')
  } else if (!/#version\s+100/i.test(code)) {
    // 无版本指令：Three.js WebGL2 默认 GLSL 300，xr-frame 需要显式 100
    code = '#version 100\n' + code
    notes.push('未声明版本，已补 #version 100')
  }

  // 去掉 layout(location = N)
  code = code.replace(/layout\s*\(\s*location\s*=\s*\d+\s*\)\s*/g, '')

  // in/out -> attribute/varying（按阶段区分）。
  // 类型名单覆盖 GLSL ES 100 可声明的全部类型；数组（weights[4]）与多声明符
  // （a, b）的剩余部分原样保留，替换后仍是合法声明。
  // 注意 uint/uvec 是 GLSL 300 独有，不在此表 —— 留给下面的 lethal 检查拦截。
  const ES100_TYPE = '(float|int|bool|vec[234]|ivec[234]|bvec[234]|mat[234])'
  const IN_DECL = new RegExp(`\\bin\\s+((?:highp|mediump|lowp)\\s+)?${ES100_TYPE}\\s+(\\w+)`, 'g')
  const OUT_DECL = new RegExp(`\\bout\\s+((?:highp|mediump|lowp)\\s+)?${ES100_TYPE}\\s+(\\w+)`, 'g')
  if (stage === 'vertex') {
    code = code.replace(IN_DECL, 'attribute $1$2 $3')
    code = code.replace(OUT_DECL, 'varying $1$2 $3')
  } else {
    code = code.replace(IN_DECL, 'varying $1$2 $3')
    // 片段 out vec4 xxx; 由 gl_FragData[0] 替代
    code = code.replace(/\bout\s+(?:highp|mediump|lowp)?\s*vec4\s+\w+\s*;/g, '')
  }

  if (/\btexture\s*\(/.test(code)) {
    code = code.replace(/\btexture\s*\(/g, 'texture2D(')
    notes.push('texture() 已替换为 texture2D()')
  }

  if (/\bgl_FragColor\b/.test(code)) {
    code = code.replace(/\bgl_FragColor\b/g, 'gl_FragData[0]')
    notes.push('gl_FragColor 已替换为 gl_FragData[0]')
  }

  // 仍有无法安全转译的 GLSL 300 语法时标记出来——宁可报不通过，
  // 也不能让必编译失败的 shader 带着 ok:true 混进导出结果：
  //  - 300 独有内置函数/类型/插值限定符（textureProj/texelFetch/textureGrad/uint/uvec…）
  //  - in/out interface block（in Light { … }）
  //  - gl_FragData[N>0]（MRT 需要扩展，xr-frame 不支持）
  //  - 声明级 in/out 未被上面的类型表转译（结构体/sampler 等无法识别的类型）
  // 判定前先剥掉注释，避免注释里提到这些关键字造成误报
  const checkable = code.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const lethal =
    /\b(layout|flat|smooth|noperspective|centroid|invariant|sampler3D|sampler2DArray|sampler2DShadow|samplerCubeShadow|isampler2D|usampler2D|textureLod|textureProj|textureGrad|texelFetch|textureOffset|textureGather|textureSize|gl_FragDepth|gl_VertexID|gl_InstanceID|uint|uvec[234])\b/.test(checkable) ||
    /\b(?:in|out)\s+\w+\s*\{/.test(checkable) ||
    /gl_FragData\s*\[\s*[1-9]/.test(checkable) ||
    /\b(?:in|out)\s+(?:(?:highp|mediump|lowp)\s+)?\w+\s+\w+\s*;/.test(checkable)
  if (lethal) notes.push('检测到无法自动转译的 GLSL 300 语法，需手工改写')
  return { code, ok: !lethal, notes }
}