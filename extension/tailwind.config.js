/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        torya: {
          bg: '#0a0b0e',
          surface: '#14161a',
          'surface-2': '#1a1d22',
          border: '#232830',
          'border-strong': '#2e343d',
          text: '#e8eaed',
          muted: '#888d96',
          'muted-2': '#5f6571',
          accent: '#7c7da9',         // muted slate-indigo
          'accent-strong': '#9a9bd1',
          success: '#6bb78f',
          warn: '#c9a96b',
          'warn-bg': '#3a2f17',
          danger: '#c76060',
        },
      },
    },
  },
  plugins: [],
};
