/**
 * Wrapup color tokens — source of truth: designs/0_design_system.png
 * Mirrors the CSS variables defined in global.css so native code (SVG fills,
 * StyleSheet values, status bar colors) can reference the same values NativeWind
 * classes use.
 */
export const colors = {
  primary: {
    amber: "#EF9F27",
    deepAmber: "#BA7517",
    coral: "#D85A30",
    cream: "#FCE8C8",
  },
  semantic: {
    success: "#3B8B4E",
    warning: "#FAC775",
    error: "#E24B4A",
    privacy: "#0F6E56",
  },
  neutral: {
    textPrimary: "#2C2C2A",
    textSecondary: "#85807A",
    border: "#E5E1D8",
    background: "#FAF8F3",
  },
  // Mascot palette per AGENTS.md — kept separate from `primary` since ears
  // (#D8791C) is a distinct value from deepAmber, and this palette must stay
  // fixed everywhere the mascot appears regardless of future brand palette edits.
  mascot: {
    face: "#FCE8C8",
    ears: "#D8791C",
    features: "#3D2A16",
  },
} as const;
