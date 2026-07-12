/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101012",
        panel: "#18171c",
        panelSoft: "#211f27",
        line: "#34313a",
        mint: "#33d69f",
        berry: "#a855f7",
        caution: "#f5b84c",
        danger: "#ff6b6b"
      },
      boxShadow: {
        glow: "0 18px 70px rgba(0,0,0,0.36)"
      }
    }
  },
  plugins: []
};
