/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070b12',
          900: '#0b1220',
          850: '#0f172a',
          800: '#131d31',
          700: '#1b2942',
          600: '#2a3b58',
        },
        vault: {
          green: '#34d399',
          amber: '#fbbf24',
          red: '#fb7185',
          blue: '#60a5fa',
          violet: '#a78bfa',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 20px 50px -30px rgba(0,0,0,0.8)',
      },
    },
  },
  plugins: [],
};
