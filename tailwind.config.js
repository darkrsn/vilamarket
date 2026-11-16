/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        floresta: {
          DEFAULT: "#1B4332",
          claro: "#2D6A4F",
        },
        ambar: "#D97706",
        grafite: "#1F2937",
      },
    },
  },
  plugins: [],
};