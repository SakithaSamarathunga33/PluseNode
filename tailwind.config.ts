import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /*
         * All colors reference CSS variables defined in globals.css.
         * Using the RGB-channel pattern: rgb(var(--pn-xxx-rgb) / <alpha-value>)
         * This lets Tailwind opacity modifiers work: bg-pn-navy/50, text-pn-cyan/80 etc.
         *
         * To change the site palette, only edit the :root variables in globals.css.
         */
        "pn-navy":    "rgb(var(--pn-navy-rgb)       / <alpha-value>)",
        "pn-navylt":  "rgb(var(--pn-navy-light-rgb) / <alpha-value>)",
        "pn-cyan":    "rgb(var(--pn-cyan-rgb)       / <alpha-value>)",
        "pn-blue":    "rgb(var(--pn-blue-rgb)       / <alpha-value>)",
        "pn-electric":"rgb(var(--pn-electric-rgb)   / <alpha-value>)",
        "pn-bg":      "rgb(var(--pn-bg-rgb)         / <alpha-value>)",
        "pn-border":  "rgb(var(--pn-border-rgb)     / <alpha-value>)",
        "pn-muted":   "rgb(var(--pn-muted-rgb)      / <alpha-value>)",

        /* Helm bg levels — exposed as Tailwind tokens */
        "helm-bg1":   "var(--helm-bg-1)",
        "helm-bg2":   "var(--helm-bg-2)",
        "helm-bg3":   "var(--helm-bg-3)",
        "helm-fg":    "rgb(var(--helm-fg-rgb)   / <alpha-value>)",
        "helm-fg2":   "rgb(var(--helm-fg-2-rgb) / <alpha-value>)",
        "helm-fg3":   "rgb(var(--helm-fg-3-rgb) / <alpha-value>)",
        "helm-fg4":   "rgb(var(--helm-fg-4-rgb) / <alpha-value>)",

        /*
         * Semantic aliases — change what roles map to without touching components.
         * Override only these in globals.css to retheme without renaming classes.
         */
        "pn-page":    "rgb(var(--pn-navy-rgb)       / <alpha-value>)",
        "pn-card":    "rgb(var(--pn-navy-light-rgb) / <alpha-value>)",
        "pn-accent":  "rgb(var(--pn-cyan-rgb)       / <alpha-value>)",
        "pn-action":  "rgb(var(--pn-electric-rgb)   / <alpha-value>)",
        "pn-text":    "rgb(var(--pn-bg-rgb)         / <alpha-value>)",
        "pn-subtle":  "rgb(var(--pn-muted-rgb)      / <alpha-value>)",

        /*
         * Legacy pulseNode.* aliases kept for backward compatibility
         * with pages that already use bg-pulseNode-navy etc.
         */
        pulseNode: {
          navy:       "rgb(var(--pn-navy-rgb)       / <alpha-value>)",
          navyLight:  "rgb(var(--pn-navy-light-rgb) / <alpha-value>)",
          cyan:       "rgb(var(--pn-cyan-rgb)       / <alpha-value>)",
          blue:       "rgb(var(--pn-blue-rgb)       / <alpha-value>)",
          electric:   "rgb(var(--pn-electric-rgb)   / <alpha-value>)",
          background: "rgb(var(--pn-bg-rgb)         / <alpha-value>)",
          border:     "rgb(var(--pn-border-rgb)     / <alpha-value>)",
          muted:      "rgb(var(--pn-muted-rgb)      / <alpha-value>)",
        },
      },

      boxShadow: {
        card:      "var(--shadow-card)",
        glow:      "var(--shadow-glow)",
        "glow-lg": "0 0 40px rgb(var(--pn-cyan-rgb) / 0.20)",
      },

      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      keyframes: {
        "border-beam":    { "100%": { "offset-distance": "100%" } },
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up":   { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        sparkle: {
          "0%,100%": { opacity: "0", transform: "scale(0) rotate(0deg)" },
          "50%":     { opacity: "1", transform: "scale(1) rotate(90deg)" },
        },
        meteor: {
          "0%":   { transform: "rotate(215deg) translateX(0)", opacity: "1" },
          "70%":  { opacity: "1" },
          "100%": { transform: "rotate(215deg) translateX(-500px)", opacity: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },

      animation: {
        "border-beam":    "border-beam calc(var(--duration)*1s) infinite linear",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
        sparkle:          "sparkle 1.5s ease-in-out infinite",
        meteor:           "meteor linear infinite",
        "fade-in":        "fade-in 0.35s ease forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
