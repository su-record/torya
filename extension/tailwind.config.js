/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        torya: {
          bg: '#11141a',           // soft blue-charcoal
          surface: '#1a1d25',
          'surface-2': '#232730',
          border: '#2a2f3a',
          'border-strong': '#363c48',
          text: '#e8eaed',
          muted: '#8d93a1',
          'muted-2': '#5f6573',
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
