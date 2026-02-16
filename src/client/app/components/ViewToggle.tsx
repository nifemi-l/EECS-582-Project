// Top-of-screen bar: pill toggle (3D View / List) + sensor badges
// Pill sits on the left, sensor circles spread out beside it.

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SensorBadge, SensorBadgeProps } from "./SensorBadge";

type ViewMode = "3d" | "list";

const ACCENT = "#5c6bc0";
const ACCENT_LIGHT = "#e8eaf6";

// Mock sensor data — will be replaced with real readings once the hardware is hooked up (or some API?)
const SENSORS: SensorBadgeProps[] = [
  { icon: "thermometer", value: "72°F", label: "Temperature" },
  { icon: "water-percent", value: "45%", label: "Humidity" },
  { icon: "gauge", value: "1013", label: "Pressure" },
  { icon: "white-balance-sunny", value: "800", label: "Light" },
  { icon: "volume-high", value: "30dB", label: "Noise" },
];

interface ViewToggleProps {
  active: ViewMode;
}

export default function ViewToggle({ active }: ViewToggleProps) {
  const router = useRouter();

  const navigate = (mode: ViewMode) => {
    if (mode === active) return;
    if (mode === "3d") {
      router.replace("/home");
    } else {
      router.replace("/list");
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <View style={styles.pill}>
          <Pressable
            onPress={() => navigate("3d")}
            style={[styles.segment, active === "3d" && styles.segmentActive]}
          >
            <MaterialCommunityIcons
              name="rotate-3d-variant"
              size={17}
              color={active === "3d" ? "#fff" : ACCENT}
            />
            <Text
              style={[
                styles.segmentText,
                active === "3d" && styles.segmentTextActive,
              ]}
            >
              3D View
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigate("list")}
            style={[styles.segment, active === "list" && styles.segmentActive]}
          >
            <MaterialCommunityIcons
              name="format-list-bulleted"
              size={17}
              color={active === "list" ? "#fff" : ACCENT}
            />
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

        <View style={styles.sensors}>
          {SENSORS.map((s) => (
            <SensorBadge key={s.label} icon={s.icon} value={s.value} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    backgroundColor: ACCENT_LIGHT,
    borderRadius: 24,
    padding: 3,
  },
  segment: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderRadius: 22,
  },
  segmentActive: {
    backgroundColor: ACCENT,
    elevation: 2,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  segmentText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "700",
    color: ACCENT,
  },
  segmentTextActive: {
    color: "#fff",
  },
  sensors: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 18,
    gap: 14,
  },
});
