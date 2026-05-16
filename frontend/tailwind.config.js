/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07111f',
          900: '#0b1626',
          800: '#12203a',
          700: '#1b2c4a',
          600: '#2a3f63',
          500: '#4a6488',
          400: '#6b85a8',
        },
        paper: {
          DEFAULT: '#ece6d3',
          dim: '#b9b2a0',
          mute: '#7a7466',
        },
        cyan: {
          200: '#bfe0ff',
          300: '#8fcaff',
          400: '#5fb4ff',
          500: '#3a98ec',
          600: '#1f7bcc',
        },
        ember: {
          DEFAULT: '#ff8a3d',
          dim: '#c66a2d',
        },
        rose: {
          DEFAULT: '#f06a6a',
          dim: '#b94f4f',
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
