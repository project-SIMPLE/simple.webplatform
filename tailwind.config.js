/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      screens: {
        'md-lg': '920px', // breakpoint at (920px)
      },
    },
  },
  plugins: [],
}

