/**
 * Wrapup typography tokens — source of truth: designs/0_design_system.png
 * Mirrors the `text-*` utilities defined in global.css. Use the NativeWind
 * classes (e.g. `className="text-h1"`) in components; use these objects only
 * where a raw style prop is unavoidable (e.g. non-NativeWind libraries).
 */
export const fontFamily = {
  regular: "Nunito_400Regular",
  semibold: "Nunito_600SemiBold",
  bold: "Nunito_700Bold",
} as const;

export const typography = {
  h1: { fontFamily: fontFamily.bold, fontSize: 28, lineHeight: 34 },
  h2: { fontFamily: fontFamily.semibold, fontSize: 20, lineHeight: 26 },
  h3: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 22 },
  bodyLarge: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21 },
  bodyMedium: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  bodySmall: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17 },
  caption: { fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 15 },
} as const;
