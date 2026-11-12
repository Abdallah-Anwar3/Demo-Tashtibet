/** @type {import('tailwindcss').Config} */
const v = (name) => `hsl(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'] },
      colors: {
        bg: v('bg'),
        card: v('card'),
        raised: v('raised'),
        fg: v('fg'),
        muted: v('muted'),
        line: v('line'),
        navy: v('navy'),
        brand: { DEFAULT: v('brand'), dark: v('brand-dark'), soft: v('brand-soft') },
        ok: { DEFAULT: v('ok'), soft: v('ok-soft') },
        bad: { DEFAULT: v('bad'), soft: v('bad-soft') },
        warn: { DEFAULT: v('warn'), soft: v('warn-soft') },
        info: { DEFAULT: v('info'), soft: v('info-soft') },
      },
      borderRadius: { xl: '12px' },
    },
  },
  plugins: [],
}
