import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";

/*
 * Tailwind CSS v4 is configured CSS-first via the `@theme` block in
 * app/globals.css. This file only registers plugins and content globs.
 * The DataSentinel design tokens (colors, fonts, motion) live in globals.css.
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  plugins: [forms, typography],
};

export default config;
