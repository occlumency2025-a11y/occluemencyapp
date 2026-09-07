/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Occlumency pilot palette — calm green, warm neutrals.
        sage: {
          50:  '#F2F7F4',
          100: '#E2EFE8',
          200: '#C4DFD2',
          300: '#97C7B2',
          400: '#63A98D',
          500: '#3F8C6F',
          600: '#2E7159',
          700: '#265A48',
          800: '#20483B',
          900: '#1B3B31',
        },
        clay: {
          50:  '#FAF9F6',
          100: '#F3F1EB',
          200: '#E6E2D8',
          300: '#D2CCBE',
          400: '#A9A192',
          500: '#7D766A',
          600: '#5C564C',
          700: '#433E37',
          800: '#2C2924',
          900: '#1C1A17',
        },
      },
      fontFamily: {
        sans: ['"Public Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Newsreader', 'Georgia', 'serif'],
      },
      borderRadius: { xl2: '1.25rem' },
      boxShadow: {
        card: '0 1px 2px rgba(28,26,23,.04), 0 8px 24px -16px rgba(28,26,23,.25)',
      },
    },
  },
  plugins: [],
};
