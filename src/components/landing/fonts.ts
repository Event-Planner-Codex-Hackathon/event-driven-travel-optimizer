import { Atkinson_Hyperlegible_Next, Barlow_Condensed } from "next/font/google";

// Signage and flap characters.
export const signFont = Barlow_Condensed({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-sign",
  display: "swap",
  fallback: ["Arial Narrow", "sans-serif"],
});

// Reading text and form controls.
export const readFont = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  variable: "--font-read",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["system-ui", "sans-serif"],
});
