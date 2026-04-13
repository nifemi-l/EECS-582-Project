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
  - 4/12/26: Sensor chips for the toolbar; labels and popups stay on-screen on phones and the web
Preconditions: Must receive a valid icon name, value string, and label as props
Postconditions: Renders a pressable badge with tooltip on hover and detail card on tap
Errors: None. Falls back gracefully if label has no metadata
Side effects: None
Invariants: None
Known faults: None
*/

// Pull in react hooks we need for state and refs
import React, { useState, useRef, useCallback, useLayoutEffect } from "react";
// Grab the RN primitives plus Pressable so the badge can be tapped and hovered
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
// Icon library for the sensor icons
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { brand } from "../theme/colors";
// How long in ms the user must hover before the tooltip appears
const TOOLTIP_DELAY = 400;

/** Minimum gap between detail popover and viewport left/right */
const DETAIL_EDGE_PAD = 12;

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


  /*

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
  */
};

/** Parse a numeric reading from display strings like "72°F", "45%", or treat N/A as missing. */
function parseSensorNumeric(value: string): number | null {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (!lower || lower === "n/a" || lower === "na" || lower === "--") return null;
  const stripped = trimmed.replace(/[^\d.-]/g, "");
  if (!stripped) return null;
  const num = parseFloat(stripped);
  return Number.isFinite(num) ? num : null;
}

// Take a label and value string; bucket is null when there is no valid reading to classify
function classify(label: string, value: string): { meta: SensorMeta; bucket: Bucket | null } | null {
  const meta = SENSOR_META[label];
  if (!meta) return null;
  const num = parseSensorNumeric(value);
  if (num === null) {
    return { meta, bucket: null };
  }
  const bucket = meta.buckets.find((b) => num <= b.max);
  return { meta, bucket: bucket ?? meta.buckets[meta.buckets.length - 1] };
}

export type SensorDetailAlign = "start" | "end";

// Props the badge component expects from its parent
export interface SensorBadgeProps {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; // Icon name
  value: string; // The reading to display
  label?: string; // Sensor label used for tooltip and classification
  isOpen?: boolean; // Whether the detail card is currently shown (controlled by parent)
  onToggle?: () => void; // Callback to open or close the detail card
  darkBg?: boolean; // True when rendered over a dark background like the 3D view
  /** Align the detail popover from the badge's left (start) or right (end) to reduce screen overflow */
  detailAlign?: SensorDetailAlign;
  /** Compact inline pill chip for the dark household toolbar (not the circular badge) */
  toolbar?: boolean;
}

// The badge component that shows an icon, value, tooltip, and detail card
export function SensorBadge({
  icon,
  value,
  label,
  isOpen,
  onToggle,
  darkBg,
  detailAlign = "start",
  toolbar,
}: SensorBadgeProps) {
  const { width: windowWidth } = useWindowDimensions();
  // Track whether the tooltip is visible
  const [tip, setTip] = useState(false);
  // Ref to hold the hover timer so we can cancel it
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<View | null>(null);
  /** Horizontal shift so the detail card stays within the screen (native: anchor-relative). */
  const [detailTranslateX, setDetailTranslateX] = useState(0);
  /** Web: viewport-fixed coordinates so the popover is not clipped by toolbar/overflow ancestors. */
  const [detailFixedPos, setDetailFixedPos] = useState<{ left: number; top: number } | null>(null);

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

  const cardMaxWidth = Math.min(280, Math.max(160, windowWidth - 24));
  const detailPanelWidth = Math.min(cardMaxWidth, windowWidth - DETAIL_EDGE_PAD * 2);
  const tooltipMaxWidth = Math.min(260, Math.max(120, windowWidth - 24));
  /** Toolbar value column: shrink on narrow viewports so two chips fit beside the pill. */
  const chipValueMaxWidth = Math.min(100, Math.max(40, Math.floor(windowWidth * 0.13)));
  const chipMaxWidth = Math.min(200, Math.max(96, Math.floor(windowWidth * 0.28)));

  const tooltipTop = toolbar ? TOOLBAR_CHIP_HEIGHT + 4 : SIZE + 4;
  const detailTop = toolbar ? TOOLBAR_CHIP_HEIGHT + 6 : SIZE + 6;

  const tooltipPositionStyle = toolbar
    ? detailAlign === "end"
      ? { left: undefined as number | undefined, right: 0, alignItems: "flex-end" as const }
      : { left: 0, right: undefined as number | undefined, alignItems: "flex-start" as const }
    : {
        left: -Math.round(Math.min(100, Math.max(40, windowWidth * 0.12))),
        right: -Math.round(Math.min(100, Math.max(40, windowWidth * 0.12))),
        alignItems: "center" as const,
      };

  useLayoutEffect(() => {
    if (!isOpen) {
      setDetailTranslateX(0);
      setDetailFixedPos(null);
      return;
    }
    const cw = detailPanelWidth;
    let cancelled = false;
    const applyMeasure = () => {
      anchorRef.current?.measureInWindow((x, y, w, h) => {
        if (cancelled) return;
        const desiredLeft = detailAlign === "end" ? x + w - cw : x;
        const maxLeft = windowWidth - DETAIL_EDGE_PAD - cw;
        const minLeft = DETAIL_EDGE_PAD;
        const clampedLeft = Math.max(minLeft, Math.min(desiredLeft, maxLeft));
        const top = y + detailTop;
        if (Platform.OS === "web") {
          setDetailFixedPos({ left: clampedLeft, top });
          setDetailTranslateX(0);
        } else {
          setDetailFixedPos(null);
          setDetailTranslateX(clampedLeft - x);
        }
      });
    };
    applyMeasure();
    requestAnimationFrame(applyMeasure);
    return () => {
      cancelled = true;
    };
  }, [isOpen, windowWidth, detailAlign, detailPanelWidth, detailTop]);

  return (
    <View
      ref={anchorRef}
      collapsable={false}
      style={[styles.anchor, toolbar && styles.anchorToolbar, isOpen && { zIndex: 100 }]}
    >
      {toolbar ? (
        <Pressable
          onPress={onToggle}
          onHoverIn={hoverIn}
          onHoverOut={hoverOut}
          style={({ hovered }: { hovered?: boolean }) => [
            styles.chip,
            { maxWidth: chipMaxWidth },
            hovered && styles.chipHover,
          ]}
        >
          <MaterialCommunityIcons name={icon} size={17} color={brand} />
          <Text style={[styles.chipValue, { maxWidth: chipValueMaxWidth }]} numberOfLines={1}>
            {value}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={onToggle}
          onHoverIn={hoverIn}
          onHoverOut={hoverOut}
          style={({ hovered }: { hovered?: boolean }) => [
            styles.badge,
            hovered && styles.badgeHover,
          ]}
        >
          <MaterialCommunityIcons name={icon} size={20} color={brand} />
          <Text style={styles.value} numberOfLines={2}>
            {value}
          </Text>
        </Pressable>
      )}

      {tip && label && !isOpen && (
        <View style={[styles.tooltip, { top: tooltipTop }, tooltipPositionStyle]}>
          <Text
            style={[
              darkBg || toolbar ? styles.tooltipTextLight : styles.tooltipText,
              { maxWidth: tooltipMaxWidth },
            ]}
            numberOfLines={3}
          >
            {label}
          </Text>
        </View>
      )}

      {isOpen &&
        result &&
        (Platform.OS !== "web" || detailFixedPos) && (
        <View
          style={[
            styles.detail,
            Platform.OS === "web" && detailFixedPos
              ? [
                  styles.detailFixed,
                  {
                    left: detailFixedPos.left,
                    top: detailFixedPos.top,
                    width: detailPanelWidth,
                    maxWidth: detailPanelWidth,
                  },
                ]
              : {
                  left: 0,
                  top: detailTop,
                  width: detailPanelWidth,
                  maxWidth: detailPanelWidth,
                  transform: [{ translateX: detailTranslateX }],
                },
          ]}
        >
          {/* Header row with title on the left and close X on the right */}
          <View style={styles.detailHeader}>
            {/* Sensor name as the card title */}
            <Text style={styles.detailTitle}>{label}</Text>
            {/* Small X button to dismiss the card */}
            <Pressable onPress={onToggle} hitSlop={8} style={styles.detailClose}>
              <MaterialCommunityIcons name="close" size={14} color="#999" />
            </Pressable>
          </View>
          {/* What the sensor physically measures */}
          <Text style={styles.detailText}>{result.meta.measures}</Text>
          {/* What that measurement means to the user */}
          <Text style={styles.detailText}>{result.meta.represents}</Text>
          {/* Rank only when we have a numeric reading */}
          {result.bucket && (
            <View style={styles.rankRow}>
              <View style={[styles.rankDot, { backgroundColor: result.bucket.color }]} />
              <Text style={styles.rankText}>
                {result.bucket.rank} — {result.bucket.explanation}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// Diameter of the circular badge (non-toolbar)
const SIZE = 56;
// Toolbar chip height = ViewToggle pill (pad 3+3 + segment pad 6+6 + icon 17) = 35
const TOOLBAR_CHIP_HEIGHT = 35;

// All styles for the badge, tooltip, and detail card
const styles = StyleSheet.create({
  // Positions children absolutely relative to the badge
  anchor: {
    position: "relative", // So tooltip and detail can use absolute positioning
    zIndex: 1, // Default low z so closed badges dont overlap open ones
  },
  anchorToolbar: {
    minWidth: 0,
    flexShrink: 1,
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
  chip: {
    height: TOOLBAR_CHIP_HEIGHT,
    minHeight: TOOLBAR_CHIP_HEIGHT,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 22,
    backgroundColor: "#b8cce4",
    borderWidth: 1,
    borderColor: "rgba(45, 74, 122, 0.22)",
    gap: 6,
    flexShrink: 1,
  },
  chipHover: {
    backgroundColor: "#a8bdd8",
    borderColor: "rgba(45, 74, 122, 0.32)",
  },
  chipValue: {
    fontSize: 13,
    fontWeight: "700",
    color: brand,
    flexShrink: 1,
  },
  // Text style for the sensor reading
  value: {
    fontSize: 10, // Small text
    fontWeight: "600", // Semi-bold
    color: brand, // Matches the app accent color
    marginTop: 2, // Tiny gap between icon and text
    textAlign: "center",
    paddingHorizontal: 2,
  },
  // Tooltip container: horizontal placement comes from tooltipPositionStyle (edge-aligned on toolbar)
  tooltip: {
    position: "absolute",
    zIndex: 100,
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
    position: "absolute", // web may override with detailFixed
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
  /** Web-only: pin popover to the visual viewport so it is not clipped by overflow:hidden ancestors */
  detailFixed: {
    position: "fixed" as const,
    zIndex: 50_000,
  },
  // Row that holds the title and the close button side by side
  detailHeader: {
    flexDirection: "row", // Title and X sit next to each other
    justifyContent: "space-between", // Push X to the far right
    alignItems: "flex-start", // Top-align so wrapped title stays readable
    marginBottom: 4, // Gap below the header
    gap: 6,
  },
  detailClose: {
    marginTop: 1,
  },
  // Bold title at the top of the detail card
  detailTitle: {
    flex: 1,
    flexShrink: 1,
    fontSize: 12, // Slightly larger than body
    fontWeight: "700", // Bold
    color: brand, // Accent blue
  },
  // Body text lines in the detail card
  detailText: {
    fontSize: 10, // Small body text
    color: "#555", // Muted gray
    marginBottom: 3, // Gap between lines
    flexWrap: "wrap",
  },
  // Row that holds the colored dot and rank text
  rankRow: {
    flexDirection: "row", // Dot and text side by side
    alignItems: "flex-start", // Top-align when text wraps to multiple lines
    marginTop: 4, // Space above the rank section
  },
  // Small colored circle indicating the ranking
  rankDot: {
    width: 8, // Dot width
    height: 8, // Dot height
    borderRadius: 4, // Make it a circle
    marginRight: 6, // Gap between dot and text
    marginTop: 2,
  },
  // Text showing the rank name and explanation
  rankText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 10, // Same size as detail text
    fontWeight: "600", // Semi-bold so it stands out
    color: "#333", // Dark gray for readability
  },
});
