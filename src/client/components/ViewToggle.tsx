/* PROLOGUE
File name: ViewToggle.tsx
Description: Unified household header: navy bar with back, divider, 3D/List pill, sensor
             badges, spacer, avatar and Logout. Fetches sensor data for the household.
Programmer: Nifemi Lawal
Creation date: 2/6/26
Revision date:
  - 2/14/26: Add sensor badges and improve layout
  - 4/12/26: Household header bar rework for small screens
  - 4/13/26: Logout cluster matches home web hover (shared theme tokens)
    ---> Web hover on back button (pill + chevron scale/tint)
Preconditions: Must receive the currently active view mode as a prop
Postconditions: Renders the household chrome bar and can navigate between views
Errors: None. Will always render successfully
Side effects: Navigates to a different route when the user switches views or logs out
Invariants: None
Known faults: None
*/

import React, { useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { SensorBadge, SensorBadgeProps } from "./SensorBadge";
import { clearToken, getToken } from "../utils/authStorage";
import {
  brand,
  navy,
  navLogoutHover,
  navLogoutWebShell,
  navLogoutWebShellCompact,
  navLogoutWebShellHover,
} from "../theme/colors";

/** Below this width, sensors move to a second row so the pill and auth cluster fit phones. */
const STACKED_TOOLBAR_BREAKPOINT = 560;
/** Below this width, use short segment labels and icon-only logout. */
const COMPACT_CHROME_BREAKPOINT = 640;

const SENSORS_NA: SensorBadgeProps[] = [
  { icon: "thermometer", value: "N/A", label: "Temperature" },
  { icon: "water-percent", value: "N/A", label: "Humidity" },
];

type ViewMode = "3d" | "list";

interface ViewToggleProps {
  active: ViewMode;
  onChange: (mode: ViewMode) => void;
  householdId: number;
}

function initialFromToken(token: string): string {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return "?";
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4 !== 0) payload += "=";
    const decoded =
      Platform.OS === "web" ? atob(payload) : global.atob?.(payload) ?? atob(payload);
    const parsed = JSON.parse(decoded);
    const u = parsed.username;
    if (typeof u === "string" && u.length > 0) return u.charAt(0).toUpperCase();
    return "?";
  } catch {
    return "?";
  }
}

export default function ViewToggle({ active, onChange, householdId }: ViewToggleProps) {
  const { width: windowWidth } = useWindowDimensions();
  const stackedToolbarLayout = windowWidth < STACKED_TOOLBAR_BREAKPOINT;
  const compactChrome = windowWidth < COMPACT_CHROME_BREAKPOINT;

  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const [avatarLetter, setAvatarLetter] = useState("?");

  const [sensors, setSensors] = useState<SensorBadgeProps[]>(SENSORS_NA);
  const [hoverLogout, setHoverLogout] = useState(false);
  const [hoverBack, setHoverBack] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (cancelled || !token) return;
      setAvatarLetter(initialFromToken(token));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!householdId) return;

    let isMounted = true;

    async function loadSensorData() {
      try {
        const response = await fetch(
          `${process.env.EXPO_PUBLIC_API_URL}/api/sensor-data/${householdId}`
        );
        const data = await response.json();

        if (!isMounted) return;
        if (!data || data.temperature === undefined) {
          setSensors(SENSORS_NA);
          return;
        }

        const hum =
          data.humidity !== undefined && data.humidity !== null
            ? `${data.humidity}%`
            : "N/A";
        setSensors([
          { icon: "thermometer", value: `${data.temperature}°C`, label: "Temperature" },
          { icon: "water-percent", value: hum, label: "Humidity" },
        ]);
      } catch (_error) {
        if (isMounted) setSensors(SENSORS_NA);
      }
    }

    loadSensorData();
    const interval = setInterval(loadSensorData, 60_000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [householdId]);

  const navigate = (mode: ViewMode) => {
    if (mode === active) return;
    onChange(mode);
  };

  async function handleLogout() {
    await clearToken();
    router.replace("/login");
  }

  const backButton = (
    <Pressable
      onPress={() => router.replace("/home")}
      style={({ pressed }) => [
        styles.backBtn,
        Platform.OS === "web" && hoverBack && styles.backBtnHover,
        pressed && styles.backBtnPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Back to home"
      hitSlop={8}
      // @ts-ignore web-only pointer hover
      onMouseEnter={() => Platform.OS === "web" && setHoverBack(true)}
      // @ts-ignore web-only pointer hover
      onMouseLeave={() => Platform.OS === "web" && setHoverBack(false)}
    >
      <View
        style={{
          transform: [{ scale: Platform.OS === "web" && hoverBack ? 1.08 : 1 }],
        }}
      >
        <MaterialCommunityIcons
          name="chevron-left"
          size={22}
          color={Platform.OS === "web" && hoverBack ? navLogoutHover.label : "#FFFFFF"}
        />
      </View>
    </Pressable>
  );

  const divider = <View style={styles.divider} />;

  const segmentPad = compactChrome ? styles.segmentCompact : undefined;

  const pill = (
    <View style={styles.pill}>
      <Pressable
        onPress={() => navigate("3d")}
        style={[styles.segment, segmentPad, active === "3d" && styles.segmentActive]}
      >
        <MaterialCommunityIcons
          name="rotate-3d-variant"
          size={17}
          color={active === "3d" ? "#fff" : "rgba(255,255,255,0.65)"}
        />
        <Text
          style={[styles.segmentText, active === "3d" && styles.segmentTextActive]}
          numberOfLines={1}
        >
          {compactChrome ? "3D" : "3D View"}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => navigate("list")}
        style={[styles.segment, segmentPad, active === "list" && styles.segmentActive]}
      >
        <MaterialCommunityIcons
          name="format-list-bulleted"
          size={17}
          color={active === "list" ? "#fff" : "rgba(255,255,255,0.65)"}
        />
        <Text
          style={[styles.segmentText, active === "list" && styles.segmentTextActive]}
          numberOfLines={1}
        >
          List
        </Text>
      </Pressable>
    </View>
  );

  const sensorRow = (
    <View style={[styles.sensors, stackedToolbarLayout && styles.sensorsStacked]}>
      {sensors.map((s, index) => (
        <SensorBadge
          key={s.label}
          icon={s.icon}
          value={s.value}
          label={s.label}
          isOpen={openLabel === s.label}
          onToggle={() => setOpenLabel(openLabel === s.label ? null : s.label!)}
          darkBg
          toolbar
          detailAlign={index === sensors.length - 1 ? "end" : "start"}
        />
      ))}
    </View>
  );

  const userCluster = (
    <Pressable
      onPress={() => {
        void handleLogout();
      }}
      accessibilityRole="button"
      accessibilityLabel="Log out"
      style={({ pressed }) => [
        styles.userClusterPressable,
        Platform.OS === "web" && navLogoutWebShell,
        Platform.OS === "web" && compactChrome && navLogoutWebShellCompact,
        Platform.OS === "web" && hoverLogout && navLogoutWebShellHover,
        pressed && styles.userClusterPressed,
      ]}
      // @ts-ignore web-only pointer hover
      onMouseEnter={() => Platform.OS === "web" && setHoverLogout(true)}
      // @ts-ignore web-only pointer hover
      onMouseLeave={() => Platform.OS === "web" && setHoverLogout(false)}
    >
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarText}>{avatarLetter}</Text>
      </View>
      {compactChrome ? (
        <MaterialCommunityIcons
          name="logout"
          size={20}
          color={Platform.OS === "web" && hoverLogout ? navLogoutHover.label : "#FFFFFF"}
        />
      ) : (
        <Text
          style={[
            styles.logoutText,
            Platform.OS === "web" && hoverLogout && { color: navLogoutHover.label },
          ]}
        >
          Logout
        </Text>
      )}
    </Pressable>
  );

  return (
    <View style={styles.wrapper}>
      {openLabel && (
        <Pressable style={styles.backdrop} onPress={() => setOpenLabel(null)} />
      )}

      {stackedToolbarLayout ? (
        <>
          <View style={styles.rowTop}>
            {backButton}
            {divider}
            {pill}
            <View style={styles.spacer} />
            {userCluster}
          </View>
          <View style={styles.rowBottom}>{sensorRow}</View>
        </>
      ) : (
        <View style={styles.row}>
          {backButton}
          {divider}
          {pill}
          {sensorRow}
          <View style={styles.spacer} />
          {userCluster}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: navy,
    paddingVertical: 10,
    paddingHorizontal: 14,
    position: "relative",
    zIndex: 50,
    minHeight: 68,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: `${brand}55`,
    width: "100%",
    alignSelf: "stretch",
  },
  backdrop: {
    ...Platform.select({
      web: {
        position: "fixed" as const,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
      default: {
        position: "absolute" as const,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
    }),
    zIndex: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    zIndex: 1,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    zIndex: 1,
    marginBottom: 8,
    minWidth: 0,
  },
  rowBottom: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    zIndex: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginRight: 10,
  },
  backBtnHover: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: "rgba(255,255,255,0.42)",
  },
  backBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginRight: 12,
  },
  pill: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.22)",
    borderRadius: 22,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.15)",
    flexShrink: 1,
    minWidth: 0,
  },
  segment: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  segmentCompact: {
    paddingHorizontal: 8,
  },
  segmentActive: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  segmentText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.65)",
    flexShrink: 1,
  },
  segmentTextActive: {
    color: "#fff",
  },
  sensors: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 10,
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  sensorsStacked: {
    marginLeft: 0,
  },
  spacer: {
    flex: 1,
    minWidth: 8,
  },
  userClusterPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: 8,
    flexShrink: 0,
  },
  userClusterPressed: {
    opacity: 0.92,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#5B8AD4",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  logoutText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
