/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        torya: {
          bg: '#0b0d10',
          surface: '#15181d',
          border: '#262b33',
          text: '#e6e8eb',
          muted: '#8a8f99',
          accent: '#7c5cff',
        },
      },
    },
  },
  plugins: [],
};
