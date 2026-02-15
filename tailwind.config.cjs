/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        green: {
          100: '#d1fae5',
          500: '#10b981',
          600: '#059669',
        },
        yellow: {
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
        },
        red: {
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
        },
      },
    },
  },
  plugins: [],
}