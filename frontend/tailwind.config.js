/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: 'rgb(var(--color-ink-950) / <alpha-value>)',
          900: 'rgb(var(--color-ink-900) / <alpha-value>)',
          800: 'rgb(var(--color-ink-800) / <alpha-value>)',
          700: 'rgb(var(--color-ink-700) / <alpha-value>)',
          600: 'rgb(var(--color-ink-600) / <alpha-value>)',
          500: 'rgb(var(--color-ink-500) / <alpha-value>)',
          400: 'rgb(var(--color-ink-400) / <alpha-value>)',
        },
        paper: {
          DEFAULT: 'rgb(var(--color-paper) / <alpha-value>)',
          dim: 'rgb(var(--color-paper-dim) / <alpha-value>)',
          mute: 'rgb(var(--color-paper-mute) / <alpha-value>)',
        },
        cyan: {
          200: 'rgb(var(--color-cyan-200) / <alpha-value>)',
          300: 'rgb(var(--color-cyan-300) / <alpha-value>)',
          400: 'rgb(var(--color-cyan-400) / <alpha-value>)',
          500: 'rgb(var(--color-cyan-500) / <alpha-value>)',
          600: 'rgb(var(--color-cyan-600) / <alpha-value>)',
        },
        ember: {
          DEFAULT: 'rgb(var(--color-ember) / <alpha-value>)',
          dim: 'rgb(var(--color-ember-dim) / <alpha-value>)',
        },
        rose: {
          DEFAULT: 'rgb(var(--color-rose) / <alpha-value>)',
          dim: 'rgb(var(--color-rose-dim) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        sans: ['Geist', 'Manrope', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        grid: `
          linear-gradient(to right, rgba(95, 180, 255, 0.06) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(95, 180, 255, 0.06) 1px, transparent 1px)
        `,
        'grid-fine': `
          linear-gradient(to right, rgba(95, 180, 255, 0.04) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(95, 180, 255, 0.04) 1px, transparent 1px)
        `,
        'radial-hero':
          'radial-gradient(ellipse 60% 50% at 30% 0%, rgba(95, 180, 255, 0.10), transparent 70%)',
      },
      backgroundSize: {
        grid: '32px 32px',
        'grid-fine': '8px 8px',
      },
      letterSpacing: {
        'tighter-2': '-0.04em',
      },
      keyframes: {
        'draw-line': {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)', letterSpacing: '0.02em' },
          '100%': { opacity: '1', transform: 'translateY(0)', letterSpacing: '-0.02em' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'draw-line': 'draw-line 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'fade-up': 'fade-up 700ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'fade-in': 'fade-in 500ms ease-out forwards',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
