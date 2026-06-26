/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/index.html", "./src/renderer/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: { 950: "#0a0b0f", 900: "#0f1117", 850: "#14161f", 800: "#191c27", 700: "#232636" },
        line: "#2a2e3f",
        accent: { DEFAULT: "#7c6cff", soft: "#9d92ff", dim: "#4a3fb0" },
        ok: "#3fcf8e",
        warn: "#f0b429",
        bad: "#f0606b",
        muted: "#8a90a6",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Code", "Consolas", "monospace"],
      },
      keyframes: {
        pop: { "0%": { opacity: "0", transform: "scale(0.96) translateY(6px)" }, "100%": { opacity: "1", transform: "scale(1) translateY(0)" } },
        fade: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
      },
      animation: { pop: "pop 120ms ease-out", fade: "fade 80ms ease-out" },
    },
  },
  plugins: [],
};
