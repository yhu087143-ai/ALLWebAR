/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 与 styles/index.css 的 --deep-* / --aurora-* 令牌同源。
        // 早期这里是一套 indigo/purple 的星空色，和第四轮定的 aurora 色系打架，
        // 于是同一个产品里出现两种紫、两种青。这里统一成一套值，老页面的
        // bg-ar-* / text-ar-star-* 写法不用改也能跟着变。
        ar: {
          deeper: '#04040c',
          dark: '#07070f',
          mid: '#0d0d18',
          light: '#141424',
          'star-indigo': '#a78bfa',
          'star-purple': '#c4b5fd',
          'star-cyan': '#5eead4',
          'star-amber': '#fcd34d',
          'star-pink': '#f0abfc',
          'glow-indigo': '#c4b5fd',
          'glow-purple': '#ddd6fe',
          'glow-cyan': '#99f6e4',
          'glow-amber': '#fde68a',
          'glow-pink': '#f5d0fe',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-up': 'fadeUp 0.5s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'slide-left': 'slideLeft 0.25s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(99,102,241,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(99,102,241,0.6)' },
        },
        slideLeft: {
          '0%': { opacity: '0', transform: 'translateX(40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
