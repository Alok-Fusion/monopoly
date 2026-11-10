/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // App chrome
        ink: {
          950: '#0A0D13',
          900: '#0F131B',
          850: '#141923',
          800: '#1A202C',
          700: '#242C3B',
          600: '#313B4F',
          500: '#4A566E',
        },
        // Board tiles
        paper: {
          50: '#FFFCF5',
          100: '#FBF5E9',
          200: '#F2E8D4',
          300: '#E3D4B8',
          400: '#C9B48F',
        },
        // Board centre
        felt: {
          900: '#0B2B27',
          800: '#0F3A34',
          700: '#145046',
          600: '#1B6658',
        },
        group: {
          brown: '#9A5B3C',
          lightblue: '#38BDF8',
          pink: '#EC4899',
          orange: '#F97316',
          red: '#E11D48',
          yellow: '#EAB308',
          green: '#16A34A',
          darkblue: '#4338CA',
          railway: '#334155',
          utility: '#0891B2',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Poppins', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
