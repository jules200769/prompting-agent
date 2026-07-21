/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/index.html", "./src/renderer/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          950: "var(--bg-950)",
          900: "var(--bg-900)",
          850: "var(--bg-850)",
          800: "var(--bg-800)",
          700: "var(--bg-700)",
        },
        line: "var(--line)",
        ink: "var(--ink)",
        accent: {
          DEFAULT: "var(--accent)",
          soft: "var(--accent-soft)",
          dim: "var(--accent-dim)",
          ink: "var(--accent-ink)",
        },
        ok: "var(--ok)",
        warn: "var(--warn)",
        bad: "var(--bad)",
        muted: "var(--muted)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
        brand: [
          "Bahnschrift",
          "DIN Alternate",
          "Franklin Gothic Medium",
          "Archivo Narrow",
          "Arial Narrow",
          "sans-serif",
        ],
        mono: ["Cascadia Code", "JetBrains Mono", "Consolas", "monospace"],
      },
      keyframes: {
        pop: { "0%": { opacity: "0", transform: "scale(0.96) translateY(6px)" }, "100%": { opacity: "1", transform: "scale(1) translateY(0)" } },
        fade: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        themeCardIn: {
          "0%": { opacity: "0", transform: "translateY(6px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        pop: "pop 120ms ease-out",
        fade: "fade 80ms ease-out",
        themeCardIn: "themeCardIn 220ms cubic-bezier(0.34, 1.2, 0.64, 1)",
      },
    },
  },
  plugins: [],
};
