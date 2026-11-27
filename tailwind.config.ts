import tailwindcssAnimate from "tailwindcss-animate";
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          "royal-plum": "hsl(var(--brand-royal-plum) / <alpha-value>)",
          "coral": "hsl(var(--brand-coral) / <alpha-value>)",
          "lilac": "hsl(var(--brand-lilac) / <alpha-value>)",
          "warm-cream": "hsl(var(--brand-warm-cream) / <alpha-value>)",
          "white": "hsl(var(--brand-white) / <alpha-value>)",
          "deep-plum": "hsl(var(--brand-deep-plum) / <alpha-value>)",
          "charcoal": "hsl(var(--brand-charcoal) / <alpha-value>)",
          "muted-gray": "hsl(var(--brand-muted-gray) / <alpha-value>)",
          "lavender": "hsl(var(--brand-lavender) / <alpha-value>)",
          "border-gray": "hsl(var(--brand-border-gray) / <alpha-value>)",
          "coral-text": "hsl(var(--brand-coral-text) / <alpha-value>)",
          "control-border": "hsl(var(--brand-control-border) / <alpha-value>)",
          "success": "hsl(var(--brand-success) / <alpha-value>)",
          "warning": "hsl(var(--brand-warning) / <alpha-value>)",
          "error": "hsl(var(--brand-error) / <alpha-value>)",
          "info": "hsl(var(--brand-info) / <alpha-value>)",
        },
        heading: "hsl(var(--heading) / <alpha-value>)",
        chart: {
          1: "hsl(var(--chart-1) / <alpha-value>)",
          2: "hsl(var(--chart-2) / <alpha-value>)",
          3: "hsl(var(--chart-3) / <alpha-value>)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;
