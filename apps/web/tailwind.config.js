/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand: green is the identity, orange is hover/accent only.
        // Tailwind's built-in `green` (#22c55e at 500) and `orange`
        // (#f97316 at 500) scales carry the brand; `brand` aliases the
        // two key tokens so intent reads clearly at call sites.
        brand: {
          DEFAULT: '#22c55e',
          hover: '#f97316',
          fg: '#0b120d',
        },
        // Surface ramp for a white-based theme: 950 is the page, 900 the
        // chrome (sidebar/header), steps below are progressively stronger
        // tinted fills used for hover states and wells.
        ink: {
          950: '#ffffff',
          900: '#f8faf9',
          850: '#f1f5f2',
          800: '#e7ede8',
          700: '#d7e1da',
          600: '#c2d0c6',
        },
        // Subtle green-tinted well for code blocks and key material.
        mist: '#f2f6f3',
        // The slate scale is remapped to a dark, green-tinted neutral so
        // every existing `text-slate-*` call site flips from light-on-dark
        // to dark-on-light from this single table.
        slate: {
          50: '#f6f9f7',
          100: '#131e17',
          200: '#1f2d24',
          300: '#37493d',
          400: '#51655a',
          500: '#5f7266',
          600: '#6e8175',
          700: '#8fa294',
          800: '#b4c3b9',
          900: '#dbe4dd',
          950: '#eef3ef',
        },
      },
      fontFamily: {
        // Space Grotesk carries headings (see the `h1,h2,h3` base rule in
        // index.css); Inter is the workhorse body face.
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(19, 30, 23, 0.05), 0 12px 32px -16px rgba(19, 30, 23, 0.14)',
        pop: '0 4px 12px -2px rgba(19, 30, 23, 0.08), 0 16px 40px -12px rgba(19, 30, 23, 0.18)',
      },
      // One ordered scale for every stacking context, so layering decisions are
      // made once instead of guessed per component.
      zIndex: {
        dropdown: '20',
        sticky: '30',
        overlay: '40',
        modal: '50',
        toast: '60',
      },
    },
  },
  plugins: [],
};
