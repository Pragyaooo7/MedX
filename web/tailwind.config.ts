import type { Config } from "tailwindcss";

// Colors are CSS variables (see app/globals.css) so light and dark are each
// chosen, not derived by inverting.
const v = (name: string) => `var(--${name})`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: v("page"),
        surface: v("surface"),
        sunken: v("sunken"),
        line: v("line"),
        ink: v("ink"),
        ink2: v("ink2"),
        ink3: v("ink3"),
        accent: v("accent"),
        "accent-ink": v("accent-ink"),
        "accent-soft": v("accent-soft"),
        series: v("series"),
        "series-soft": v("series-soft"),
        good: v("good"),
        watch: v("watch"),
        warn: v("warn"),
        crit: v("crit"),
      },
      fontFamily: {
        sans: [
          "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto",
          "Helvetica Neue", "Arial", "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
