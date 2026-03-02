/* PROLOGUE
File name: ViewToggle.tsx
Description: Top bar with a pill toggle to switch between 3D and list views, plus sensor badges
Programmer: Nifemi Lawal
Creation date: 2/6/26
Revision date:
  - 2/14/26: Add sensor badges and improve layout
Preconditions: Must receive the currently active view mode as a prop
Postconditions: Renders a toggle bar that can navigate between views
Errors: None. Will always render successfully
Side effects: Navigates to a different route when a toggle option is pressed
Invariants: None
Known faults: None
*/

// Import react and useState hook for tracking which sensor card is open
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
// Icon library for material design icons
import { MaterialCommunityIcons } from "@expo/vector-icons";
// Router hook for navigating between pages
import { useRouter } from "expo-router";
// Import sensor badge and its prop types
import { SensorBadge, SensorBadgeProps } from "./SensorBadge";

// Two possible view modes
type ViewMode = "3d" | "list";

// Color constants used throughout this component
const ACCENT = "#4169E1";
const ACCENT_LIGHT = "#e8eaf6";

// Placeholder sensor data until we hook up the actual hardware readings
const SENSORS: SensorBadgeProps[] = [
  { icon: "thermometer", value: "72°F", label: "Temperature" }, // temp reading
  { icon: "water-percent", value: "45%", label: "Humidity" }, // humidity reading
  { icon: "gauge", value: "1013", label: "Pressure" }, // pressure reading
  { icon: "white-balance-sunny", value: "800", label: "Light" }, // light level
  { icon: "volume-high", value: "30dB", label: "Noise" }, // noise level
];

// Props for the ViewToggle component
interface ViewToggleProps {
  active: ViewMode; // which view is currently selected
}

// Main toggle bar component at the top of the screen
export default function ViewToggle({ active }: ViewToggleProps) {
  // Grab the router so we can navigate between pages
  const router = useRouter();
  // Track which sensor detail card is open, null means all are closed
  const [openLabel, setOpenLabel] = useState<string | null>(null);

  // Handle switching between views
  const navigate = (mode: ViewMode) => {
    if (mode === active) return; // don't navigate if we're already there
    if (mode === "3d") {
      router.replace("/home"); // go to the 3D home view
    } else {
      router.replace("/list"); // go to the list view
    }
  };

  return (
    // Wrapper with padding around everything
    <View style={styles.wrapper}>
      {/* Invisible full-screen backdrop that closes the open card when tapped */}
      {openLabel && (
        <Pressable style={styles.backdrop} onPress={() => setOpenLabel(null)} />
      )}
      {/* Row that holds the pill and the sensor badges */}
      <View style={styles.row}>
        {/* Pill-shaped toggle container */}
        <View style={styles.pill}>
          {/* 3D view button */}
          <Pressable
            onPress={() => navigate("3d")}
            style={[styles.segment, active === "3d" && styles.segmentActive]}
          >
            {/* 3D rotation icon */}
            <MaterialCommunityIcons
              name="rotate-3d-variant"
              size={17}
              color={active === "3d" ? "#fff" : ACCENT}
            />
            {/* 3D View label text */}
            <Text
              style={[
                styles.segmentText,
                active === "3d" && styles.segmentTextActive,
              ]}
            >
              3D View
            </Text>
          </Pressable>

          {/* List view button */}
          <Pressable
            onPress={() => navigate("list")}
            style={[styles.segment, active === "list" && styles.segmentActive]}
          >
            {/* List icon */}
            <MaterialCommunityIcons
              name="format-list-bulleted"
              size={17}
              color={active === "list" ? "#fff" : ACCENT}
            />
            {/* List label text */}
            <Text
              style={[
                styles.segmentText,
                active === "list" && styles.segmentTextActive,
              ]}
            >
              List
            </Text>
          </Pressable>
        </View>

        {/* Sensor badges displayed to the right of the pill */}
        <View style={styles.sensors}>
          {/* Loop through each sensor and render a badge for it */}
          {SENSORS.map((s) => (
            <SensorBadge
              key={s.label}
              icon={s.icon}
              value={s.value}
              label={s.label}
              isOpen={openLabel === s.label}
              onToggle={() => setOpenLabel(openLabel === s.label ? null : s.label!)}
              darkBg={active === "3d"}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

// Styles for the toggle and its layout
const styles = StyleSheet.create({
  // Outer wrapper with padding, z-index so popover cards sit above the 3D view
  wrapper: {
    paddingTop: 10, // space above the bar
    paddingBottom: 6, // space below the bar
    paddingHorizontal: 16, // side padding
    position: "relative", // establish stacking context for absolute children
    zIndex: 50, // float above sibling views like the WebGL canvas
  },
  // Invisible overlay that covers the whole screen to catch outside taps
  backdrop: {
    position: "absolute", // break out of normal flow
    top: 0, // start from the top of the wrapper
    left: -16, // extend past the horizontal padding
    right: -16, // extend past the horizontal padding on the other side
    height: 2000, // tall enough to cover the entire screen below
    zIndex: 0, // sit behind the badges but inside the wrapper stacking context
  },
  // Horizontal row that holds everything
  row: {
    flexDirection: "row", // lay children out horizontally
    alignItems: "center", // vertically center everything
  },
  // The pill-shaped toggle background
  pill: {
    flexDirection: "row", // buttons sit side by side
    backgroundColor: ACCENT_LIGHT, // light background behind the pill
    borderRadius: 24, // rounded ends
    padding: 3, // inner spacing around buttons
  },
  // Each clickable segment inside the pill
  segment: {
    flexDirection: "row", // icon and text side by side
    alignItems: "center", // vertically center contents
    paddingVertical: 7, // top and bottom padding
    paddingHorizontal: 18, // left and right padding
    borderRadius: 22, // rounded corners
  },
  // Active segment gets a filled background and shadow
  segmentActive: {
    backgroundColor: ACCENT, // fill with the accent color
    elevation: 2, // android shadow
    shadowColor: ACCENT, // ios shadow color
    shadowOffset: { width: 0, height: 2 }, // shadow direction
    shadowOpacity: 0.3, // how transparent the shadow is
    shadowRadius: 4, // how blurry the shadow is
  },
  // Default text style inside each segment
  segmentText: {
    marginLeft: 6, // gap between icon and text
    fontSize: 13, // text size
    fontWeight: "700", // bold
    color: ACCENT, // accent colored text
  },
  // Text override when the segment is active
  segmentTextActive: {
    color: "#fff", // white text on active background
  },
  // Container for the sensor badges
  sensors: {
    flexDirection: "row", // badges in a row
    alignItems: "center", // vertically centered
    marginLeft: 18, // gap between pill and first badge
    gap: 14, // space between each badge
  },
});
