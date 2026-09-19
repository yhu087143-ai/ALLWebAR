import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // 关掉基础规则，只留 TS 版。
      // 两者同时生效时同一个未使用变量会被报两次（173 条错误里有一半是这么来的），
      // 数字虚高到没人愿意看，等于把真问题一起埋掉。
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },

  /*
   * React Hooks 规则。
   *
   * 之前只装了 typescript-eslint，`rules-of-hooks` 完全没生效 ——
   * 结果是 `ViewPage.jsx` 里一行写在 useEffect 内部的 `useState`
   * 一路通过构建与类型检查，直到运行时抛 `Invalid hook call`，
   * 被错误边界兜成整屏「页面加载异常」才暴露。
   * 这类错误静态可查，没有任何理由留到运行期。
   */
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // 依赖数组缺失只是可疑、不一定是 bug（很多地方故意用空依赖），所以给 warn
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    /*
     * 忽略产物与「手工备份」。
     *
     * 这个仓库没有 git，改动前的备份是靠 `*.bak-YYYYMMDD` / `*.bak.ts` 这样的
     * 同目录副本做的。它们是被刻意留档的旧代码，必然带着当轮修掉的问题 ——
     * 扫进去只会在报错列表里制造成片噪音（EightWallAdapter.bak.ts 一个文件就 9 条），
     * 让人误以为代码库很脏。备份不是待维护的代码。
     */
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.js',
      '**/*.bak',
      '**/*.bak.*',
      '**/*.bak-*',
      '**/public/**',
    ],
  },
  // 浏览器 / Node 全局变量声明。
  // 项目里大量 canvas、rAF、DOM 代码；不声明 globals 时 no-undef 会刷出上百条噪音，
  // 真正"写错变量名"的 bug 反而被淹没（此前 StarfieldCanvas 一个文件就有 19 条）。
  //
  // ⚠️ 必须把 mjs / cjs 一起算进来。之前的 globals 只覆盖 {js,jsx,ts,tsx}，
  // 而 ignore 段写的是 `**/*.js` —— 于是 `.mjs` 既不在忽略名单、也拿不到 globals，
  // 结果是 scripts/*.mjs 与 tools/*.mjs 里 `console`/`process`/`setTimeout`
  // 全部报 no-undef，`npm run lint` 常年 200+ 错，没人会去看，等于没有 lint。
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  // .js/.jsx 走纯 JS 规则（不做 TS 解析）
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    ...js.configs.recommended,
    rules: {
      ...js.configs.recommended.rules,
      // 不在这里开 no-unused-vars：.jsx 同时命中上面的 TS 规则块，
      // 两条规则都会报同一个变量，错误数直接翻倍。未使用变量统一交给
      // @typescript-eslint/no-unused-vars 报（它对纯 JS 同样生效）。
      'no-unused-vars': 'off',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
)
