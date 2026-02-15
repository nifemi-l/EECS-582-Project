// Small circular badge for a single sensor reading (icon + value).
// Used in ViewToggle to show ambient room stats at the top of the screen.

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const ACCENT = "#5c6bc0";

export interface SensorBadgeProps {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  value: string;
  label?: string;
}

export function SensorBadge({ icon, value }: SensorBadgeProps) {
  return (
    <View style={styles.badge}>
      <MaterialCommunityIcons name={icon} size={20} color={ACCENT} />
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

// Circle diameter (borderRadius = SIZE/2 for a perfect circle)
const SIZE = 56;

const styles = StyleSheet.create({
  badge: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: "rgba(232,234,246,0.55)", // faint fill so it blends with the bg
    borderWidth: 1,
    borderColor: "rgba(92,107,192,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 10,
    fontWeight: "600",
    color: ACCENT,
    marginTop: 2,
  },
});
