/* PROLOGUE
File name: SensorBadge.tsx
Description: A circular badge that displays a sensor icon and reading, with a hover
  tooltip and a click-to-expand detail card that shows what the sensor measures, what
  it represents, and a bucket-based ranking of the current value.
Programmer: Nifemi Lawal
Creation date: 2/14/26
Revision date:
  - 2/23/26: Add hover tooltip, click-to-expand detail card, and bucket classification
           * Add close button, controlled open state, z-index fixes, tooltip suppression
Preconditions: Must receive a valid icon name, value string, and label as props
Postconditions: Renders a pressable badge with tooltip on hover and detail card on tap
Errors: None. Falls back gracefully if label has no metadata
Side effects: None
Invariants: None
Known faults: None
*/

// Pull in react hooks we need for state and refs
import React, { useState, useRef, useCallback } from "react";
// Grab the RN primitives plus Pressable so the badge can be tapped and hovered
import { Pressable, StyleSheet, Text, View } from "react-native";
// Icon library for the sensor icons
import { MaterialCommunityIcons } from "@expo/vector-icons";

// Main accent color reused across the app
const ACCENT = "#4169E1";
// How long in ms the user must hover before the tooltip appears
const TOOLTIP_DELAY = 400;

// A single bucket defines an upper bound and what it means
interface Bucket {
  max: number; // Upper limit for this range
  rank: string; // Short label like "Comfortable"
  color: string; // Color to display for this rank
  explanation: string; // One-liner about what this range means
}

// Metadata for each sensor type keyed by its label
interface SensorMeta {
  measures: string; // What the sensor physically measures
  represents: string; // What that measurement means to the user
  buckets: Bucket[]; // Ordered list of classification ranges
}

// Map of sensor label to its metadata and classification buckets
const SENSOR_META: Record<string, SensorMeta> = {
  // Indoor air temperature ranges in fahrenheit
  Temperature: {
    measures: "Air temperature in Fahrenheit",
    represents: "How warm or cool the room feels",
    buckets: [
      { max: 60, rank: "Cold", color: "#2196f3", explanation: "Below comfortable range" },
      { max: 75, rank: "Comfortable", color: "#4caf50", explanation: "Ideal indoor temp" },
      { max: 85, rank: "Warm", color: "#ff9800", explanation: "Above comfortable range" },
      { max: Infinity, rank: "Hot", color: "#f44336", explanation: "Uncomfortably hot" },
    ],
  },
  // Relative humidity as a percentage
  Humidity: {
    measures: "Relative humidity as a percentage",
    represents: "How moist or dry the air is",
    buckets: [
      { max: 30, rank: "Dry", color: "#ff9800", explanation: "Air is too dry" },
      { max: 50, rank: "Comfortable", color: "#4caf50", explanation: "Ideal humidity" },
      { max: 70, rank: "Humid", color: "#ffeb3b", explanation: "Getting muggy" },
      { max: Infinity, rank: "Very Humid", color: "#f44336", explanation: "Excess moisture" },
    ],
  },
  // Atmospheric pressure in hectopascals
  Pressure: {
    measures: "Atmospheric pressure in hPa",
    represents: "Barometric conditions around you",
    buckets: [
      { max: 1000, rank: "Low", color: "#ff9800", explanation: "Storm or low front" },
      { max: 1025, rank: "Normal", color: "#4caf50", explanation: "Stable weather" },
      { max: Infinity, rank: "High", color: "#2196f3", explanation: "High pressure system" },
    ],
  },
  // Ambient light level in lux
  Light: {
    measures: "Ambient light level in lux",
    represents: "How bright the room is",
    buckets: [
      { max: 200, rank: "Dark", color: "#9e9e9e", explanation: "Very low light" },
      { max: 500, rank: "Dim", color: "#ffeb3b", explanation: "Soft indoor light" },
      { max: 1000, rank: "Bright", color: "#4caf50", explanation: "Well-lit room" },
      { max: Infinity, rank: "Very Bright", color: "#ff9800", explanation: "Intense light" },
    ],
  },
  // Sound level in decibels
  Noise: {
    measures: "Sound level in decibels",
    represents: "How loud the environment is",
    buckets: [
      { max: 30, rank: "Quiet", color: "#4caf50", explanation: "Peaceful silence" },
      { max: 60, rank: "Moderate", color: "#ffeb3b", explanation: "Normal conversation" },
      { max: 80, rank: "Loud", color: "#ff9800", explanation: "Noisy environment" },
      { max: Infinity, rank: "Very Loud", color: "#f44336", explanation: "May cause discomfort" },
    ],
  },
};

// Take a label and value string, return the matching bucket or a fallback
function classify(label: string, value: string) {
  const meta = SENSOR_META[label]; // Look up metadata for this sensor
  if (!meta) return null; // No metadata means we cant classify
  const num = parseFloat(value); // Pull the numeric part out of the string
  // Find the first bucket where our value fits under the max
  const bucket = meta.buckets.find((b) => num <= b.max);
  // Return the bucket or fall back to the last one just in case
  return { meta, bucket: bucket || meta.buckets[meta.buckets.length - 1] };
}

// Props the badge component expects from its parent
export interface SensorBadgeProps {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; // Icon name
  value: string; // The reading to display
  label?: string; // Sensor label used for tooltip and classification
  isOpen?: boolean; // Whether the detail card is currently shown (controlled by parent)
  onToggle?: () => void; // Callback to open or close the detail card
  darkBg?: boolean; // True when rendered over a dark background like the 3D view
}

// The badge component that shows an icon, value, tooltip, and detail card
export function SensorBadge({ icon, value, label, isOpen, onToggle, darkBg }: SensorBadgeProps) {
  // Track whether the tooltip is visible
  const [tip, setTip] = useState(false);
  // Ref to hold the hover timer so we can cancel it
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the cursor enters the badge, start a delayed tooltip
  const hoverIn = useCallback(() => {
    timer.current = setTimeout(() => setTip(true), TOOLTIP_DELAY); // Show after delay
  }, []);

  // When the cursor leaves, cancel the timer and hide the tooltip
  const hoverOut = useCallback(() => {
    if (timer.current) clearTimeout(timer.current); // Cancel pending timer
    setTip(false); // Hide the tooltip right away
  }, []);

  // Run classification to get the ranking info for this sensor
  const result = label ? classify(label, value) : null;

  return (
    // Wrapper view; z-index bumped when open so the card floats above sibling badges
    <View style={[styles.anchor, isOpen && { zIndex: 100 }]}>
      {/* Pressable badge that darkens on hover and opens detail on tap */}
      <Pressable
        onPress={onToggle}
        onHoverIn={hoverIn}
        onHoverOut={hoverOut}
        style={({ hovered }: { hovered?: boolean }) => [
          styles.badge, // Base circle styles
          hovered && styles.badgeHover, // Darken background on hover
        ]}
      >
        {/* Sensor icon centered in the badge */}
        <MaterialCommunityIcons name={icon} size={20} color={ACCENT} />
        {/* Numeric reading text underneath the icon */}
        <Text style={styles.value}>{value}</Text>
      </Pressable>

      {/* Tooltip that appears after hovering for 400ms, hidden when card is open */}
      {tip && label && !isOpen && (
        <View style={styles.tooltip}>
          {/* Show the sensor name, inverted colors on dark backgrounds */}
          <Text style={darkBg ? styles.tooltipTextLight : styles.tooltipText}>{label}</Text>
        </View>
      )}

      {/* Detail card that appears when the badge is tapped */}
      {isOpen && result && (
        <View style={styles.detail}>
          {/* Header row with title on the left and close X on the right */}
          <View style={styles.detailHeader}>
            {/* Sensor name as the card title */}
            <Text style={styles.detailTitle}>{label}</Text>
            {/* Small X button to dismiss the card */}
            <Pressable onPress={onToggle} hitSlop={8}>
              <MaterialCommunityIcons name="close" size={14} color="#999" />
            </Pressable>
          </View>
          {/* What the sensor physically measures */}
          <Text style={styles.detailText}>{result.meta.measures}</Text>
          {/* What that measurement means to the user */}
          <Text style={styles.detailText}>{result.meta.represents}</Text>
          {/* Row with colored dot and the rank label */}
          <View style={styles.rankRow}>
            {/* Small circle colored by the bucket */}
            <View style={[styles.rankDot, { backgroundColor: result.bucket.color }]} />
            {/* Rank name and explanation in one line */}
            <Text style={styles.rankText}>
              {result.bucket.rank} — {result.bucket.explanation}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// Diameter of the badge circle
const SIZE = 56;

// All styles for the badge, tooltip, and detail card
const styles = StyleSheet.create({
  // Positions children absolutely relative to the badge
  anchor: {
    position: "relative", // So tooltip and detail can use absolute positioning
    zIndex: 1, // Default low z so closed badges dont overlap open ones
  },
  // The circular badge container
  badge: {
    width: SIZE, // Fixed width
    height: SIZE, // Fixed height to match
    borderRadius: SIZE / 2, // Half the size to make a circle
    backgroundColor: "rgba(232,234,246,0.55)", // Faint fill so it blends
    borderWidth: 1, // Thin border
    borderColor: "rgba(92,107,192,0.18)", // Subtle accent-tinted border
    alignItems: "center", // Center children horizontally
    justifyContent: "center", // Center children vertically
  },
  // Slightly darker fill when the user hovers over the badge
  badgeHover: {
    backgroundColor: "rgba(210,215,230,0.7)", // Darker on hover
  },
  // Text style for the sensor reading
  value: {
    fontSize: 10, // Small text
    fontWeight: "600", // Semi-bold
    color: ACCENT, // Matches the app accent color
    marginTop: 2, // Tiny gap between icon and text
  },
  // Tooltip container positioned below the badge
  tooltip: {
    position: "absolute", // Float below the badge
    top: SIZE + 4, // Just below the circle
    alignSelf: "center", // Center horizontally
    left: -10, // Nudge left a bit so it centers better
    right: -10, // Nudge right symmetrically
    alignItems: "center", // Center the text inside
    zIndex: 100, // Sit above neighboring badges
  },
  // The actual tooltip label text (default: dark bg for light screens)
  tooltipText: {
    backgroundColor: "rgba(0,0,0,0.75)", // Dark semi-transparent background
    color: "#fff", // White text on dark bg
    fontSize: 11, // Small but readable
    paddingHorizontal: 8, // Side padding inside the pill
    paddingVertical: 3, // Top and bottom padding
    borderRadius: 6, // Rounded corners
    overflow: "hidden", // Clip content to the rounded shape
  },
  // Inverted tooltip for dark backgrounds like the 3D view
  tooltipTextLight: {
    backgroundColor: "#fff", // Solid white background for contrast on dark 3D view
    color: "#333", // Dark text for contrast against white bg
    fontSize: 11, // Same size as the normal tooltip
    paddingHorizontal: 8, // Same side padding
    paddingVertical: 3, // Same vertical padding
    borderRadius: 6, // Same rounded corners
    overflow: "hidden", // Clip content to the rounded shape
  },
  // The expanded detail card
  detail: {
    position: "absolute", // Float below the badge
    top: SIZE + 6, // A bit below the circle
    left: -52, // Offset left so the card is roughly centered
    width: 160, // Fixed width for the card
    backgroundColor: "#fff", // White card background
    borderRadius: 10, // Rounded corners
    padding: 10, // Inner padding
    elevation: 4, // Android shadow
    shadowColor: "#000", // iOS shadow color
    shadowOffset: { width: 0, height: 2 }, // Shadow direction
    shadowOpacity: 0.15, // Subtle shadow opacity
    shadowRadius: 6, // Soft shadow blur
    zIndex: 999, // Topmost element on the screen
  },
  // Row that holds the title and the close button side by side
  detailHeader: {
    flexDirection: "row", // Title and X sit next to each other
    justifyContent: "space-between", // Push X to the far right
    alignItems: "center", // Vertically center them
    marginBottom: 4, // Gap below the header
  },
  // Bold title at the top of the detail card
  detailTitle: {
    fontSize: 12, // Slightly larger than body
    fontWeight: "700", // Bold
    color: ACCENT, // Accent blue
  },
  // Body text lines in the detail card
  detailText: {
    fontSize: 10, // Small body text
    color: "#555", // Muted gray
    marginBottom: 3, // Gap between lines
  },
  // Row that holds the colored dot and rank text
  rankRow: {
    flexDirection: "row", // Dot and text side by side
    alignItems: "center", // Vertically center them
    marginTop: 4, // Space above the rank section
  },
  // Small colored circle indicating the ranking
  rankDot: {
    width: 8, // Dot width
    height: 8, // Dot height
    borderRadius: 4, // Make it a circle
    marginRight: 6, // Gap between dot and text
  },
  // Text showing the rank name and explanation
  rankText: {
    fontSize: 10, // Same size as detail text
    fontWeight: "600", // Semi-bold so it stands out
    color: "#333", // Dark gray for readability
  },
});
