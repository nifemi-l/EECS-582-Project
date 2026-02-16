/* PROLOGUE
File name: SensorBadge.tsx
Description: A small circular badge component that displays a sensor icon and its reading
Programmer: Nifemi Lawal
Creation date: 2/14/26
Revision date: None
Preconditions: Must receive a valid icon name and value string as props
Postconditions: Renders a styled circular badge showing the sensor info
Errors: None. Will always render successfully
Side effects: None
Invariants: None
Known faults: None
*/

// Pull in react and the RN components we need
import React from "react";
import { StyleSheet, Text, View } from "react-native";
// Icon library for material design icons
import { MaterialCommunityIcons } from "@expo/vector-icons";

// Main accent color used across the app
const ACCENT = "#5c6bc0";

// Define the props this component expects
export interface SensorBadgeProps {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; // icon name from the icon library
  value: string; // the reading to display like
  label?: string; // optional label, not rendered but used as a key elsewhere
}

// The badge component that shows an icon with a value underneath
export function SensorBadge({ icon, value }: SensorBadgeProps) {
  return (
    // Outer circle container
    <View style={styles.badge}>
      {/* Sensor icon */}
      <MaterialCommunityIcons name={icon} size={20} color={ACCENT} />
      {/* The sensor reading text below the icon */}
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

// Diameter of the badge circle
const SIZE = 56;

// Styles for the badge
const styles = StyleSheet.create({
  // The circular badge container
  badge: {
    width: SIZE, // fixed width
    height: SIZE, // fixed height to match
    borderRadius: SIZE / 2, // half the size to make a circle
    backgroundColor: "rgba(232,234,246,0.55)", // faint fill so it blends with the bg
    borderWidth: 1, // thin border
    borderColor: "rgba(92,107,192,0.18)", // subtle accent-tinted border
    alignItems: "center", // center children horizontally
    justifyContent: "center", // center children vertically
  },
  // Text style for the sensor reading
  value: {
    fontSize: 10, // small text
    fontWeight: "600", // semi-bold
    color: ACCENT, // matches the app accent color
    marginTop: 2, // tiny gap between icon and text
  },
});
