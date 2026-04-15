/**
 * Shared app palette — slate blues aligned with the home screen.
 * Data-only module for import from screens and components.
 */

export const navy = "#2D4A7A";
export const brand = "#3B6DB5";
export const brandMuted = "#5D7FAF";
export const surfaceSoft = "#EBF2FC";
export const selection = "#E3EEF8";
export const pageBg = "#F0F2F5";
export const textPrimary = "#3D4F63";
export const textSecondary = "#7B8A9C";
export const border = "#E6EAF0";

/**
 * Household task list
 */
export const listPageBg = "#F3F8FC";
export const listBrand = "#2F80ED";
export const listSelection = "#E5F2FC";
export const listSurfaceSoft = "#E0EEF9";
export const listBorder = "#C8DCF0";

/**
 * Room band header swatches
 */
export const ROOM_BAND_SWATCHES = [
  navy,
  "#1d4ed8", // blue
  "#0f766e", // teal
  "#6d28d9", // purple
  "#b45309", // orange
  "#be123c", // red
  "#15803d", // green
  "#c026d3", // pink
] as const;

/** Hero / marketing gradient (top → bottom-ish diagonal); mid stop softened vs. older banner */
export const heroGradient = ["#3B5FA0", "#6D90CF", "#7B9BDB"] as const;

/** Primary CTA button fill */
export const primaryButtonGradient = ["#3B6DB5", "#5B8AD4"] as const;

/**
 * Navy-bar logout cluster (web): same tokens on home and household ViewToggle
 * Fixed shell size + hover pill + label tint; avatar fill is not changed on hover
 */
export const navLogoutHover = {
  pillBg: "rgba(255, 255, 255, 0.2)",
  label: "#F0F7FF",
} as const;

export const navLogoutWebShell = {
  paddingVertical: 6,
  paddingHorizontal: 8,
  borderRadius: 12,
  backgroundColor: "transparent" as const,
};

export const navLogoutWebShellCompact = {
  paddingVertical: 4,
  paddingHorizontal: 6,
  borderRadius: 10,
};

export const navLogoutWebShellHover = {
  backgroundColor: navLogoutHover.pillBg,
};
