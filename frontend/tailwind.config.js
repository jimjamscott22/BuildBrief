/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#e6f4ff',
          100: '#bae3ff',
          200: '#7cc4fa',
          300: '#36a3f7',
          400: '#0d8eea',
          500: '#0075d4',
          600: '#005baa',
          700: '#004482',
          800: '#002e59',
          900: '#001831',
        },
        surface: {
          50:  '#f0f2f5',
          100: '#dde1e9',
          200: '#b8c0cc',
          300: '#8993a4',
          400: '#5c6578',
          500: '#3a3f4e',
          600: '#282d3b',
          700: '#1e2230',
          800: '#161a26',
          900: '#0e111a',
          950: '#080a11',
        },
      },
      boxShadow: {
        'glow-brand': '0 0 16px rgba(13, 142, 234, 0.35)',
        'glow-sm':    '0 0 8px  rgba(13, 142, 234, 0.25)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

