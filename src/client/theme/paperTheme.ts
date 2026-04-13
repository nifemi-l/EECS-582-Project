/**
 * React Native Paper MD3 theme — replaces default purple/lavender with app blues.
 * Default Paper elevation tiers are purple-tinted (see MD3LightTheme); we use cool blue-grays.
 */

import { MD3LightTheme } from "react-native-paper";
import {
  brand,
  listBorder,
  listBrand,
  listPageBg,
  listSelection,
  listSurfaceSoft,
  navy,
  textPrimary,
  textSecondary,
} from "./colors";

const elevationBlue = {
  level0: "transparent" as const,
  level1: "#F4F9FC",
  level2: "#ECF4FA",
  level3: "#E3EEF6",
  level4: "#DCE9F4",
  level5: "#D5E3F1",
};

export const appPaperLightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: listBrand,
    onPrimary: "#FFFFFF",
    primaryContainer: listSurfaceSoft,
    onPrimaryContainer: brand,
    secondary: brand,
    onSecondary: "#FFFFFF",
    secondaryContainer: listSelection,
    onSecondaryContainer: textPrimary,
    tertiary: navy,
    onTertiary: "#FFFFFF",
    tertiaryContainer: listSurfaceSoft,
    onTertiaryContainer: navy,
    surface: "#FFFFFF",
    surfaceVariant: listSelection,
    onSurface: textPrimary,
    onSurfaceVariant: textSecondary,
    outline: listBorder,
    outlineVariant: "#B8D0E8",
    background: listPageBg,
    inverseSurface: "#2C3A4A",
    inverseOnSurface: "#F4F9FC",
    inversePrimary: "#93C5FD",
    elevation: elevationBlue,
  },
};
