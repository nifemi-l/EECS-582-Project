/* PROLOGUE
File name: RoomContainer.tsx
Description: Collapsible room block with customizable header band (list view); pencil opens color+name popover.
Programmer: Nifemi Lawal
Creation date: 4/14/26
Revision date:
*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  TextInput,
  Modal,
  Keyboard,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import tinycolor from "tinycolor2";
import { navy, ROOM_BAND_SWATCHES } from "../theme/colors";
import { normalizeHexColor, prefersLightForegroundOnBand } from "../utils/hexColor";

/** Minimal room identity for the header (id distinguishes unassigned). */
export type RoomBand = {
  id: string;
  name: string;
  accentColor: string | null;
};

const BORDER_OUTER = "#b8c8d8";

/** High-contrast light text on saturated / dark band fills */
const TITLE_ON_DARK = "#ffffff";
const TITLE_ON_DARK_UNASSIGNED = "#f1f5f9";
const ICON_ON_DARK = "#e8eef7";
const ICON_ON_DARK_UNASSIGNED = "#d8e0ed";
const META_ON_DARK = "#dbe4f0";

const TITLE_ON_LIGHT = "#1a2a3d";
const TITLE_ON_LIGHT_UNASSIGNED = "#3d4f63";
const ICON_ON_LIGHT = "#3d5a80";
const ICON_ON_LIGHT_UNASSIGNED = "#5a6d82";
const META_ON_LIGHT = "#4a5f75";

type Props = {
  room: RoomBand;
  featureCount: number;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  onRenameRoom?: (nextName: string) => void;
  onDeleteRoom?: () => void;
  /** Persist accent (null clears to default navy on next load). */
  onCommitAccent?: (hex: string | null) => void;
};

export function RoomContainer({
  room,
  featureCount,
  children,
  defaultCollapsed = false,
  onRenameRoom,
  onDeleteRoom,
  onCommitAccent,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [editOpen, setEditOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(room.name);
  const [hexDraft, setHexDraft] = useState(room.accentColor ?? "");
  const [hexError, setHexError] = useState(false);
  const [hoverHeader, setHoverHeader] = useState(false);
  const [hoverPencil, setHoverPencil] = useState(false);
  const [hoverDeleteIcon, setHoverDeleteIcon] = useState(false);
  const [previewAccent, setPreviewAccent] = useState<string | null>(null);
  const nameInputRef = useRef<TextInput>(null);

  const isUnassigned = room.id === "unassigned";
  const canRename = typeof onRenameRoom === "function";
  const canEditAccent = typeof onCommitAccent === "function";
  const canDelete = typeof onDeleteRoom === "function";
  const countLabel = `${featureCount} feature${featureCount === 1 ? "" : "s"}`;

  const resolvedBg =
    previewAccent ?? (room.accentColor && normalizeHexColor(room.accentColor)) ?? navy;
  const useLightForeground = prefersLightForegroundOnBand(resolvedBg);

  const bodyTint = useMemo(() => {
    const tc = tinycolor(resolvedBg);
    return tc.setAlpha(0.07).toRgbString();
  }, [resolvedBg]);

  const titleColor = !useLightForeground
    ? isUnassigned
      ? TITLE_ON_LIGHT_UNASSIGNED
      : TITLE_ON_LIGHT
    : isUnassigned
      ? TITLE_ON_DARK_UNASSIGNED
      : TITLE_ON_DARK;
  const iconColor = !useLightForeground
    ? isUnassigned
      ? ICON_ON_LIGHT_UNASSIGNED
      : ICON_ON_LIGHT
    : isUnassigned
      ? ICON_ON_DARK_UNASSIGNED
      : ICON_ON_DARK;
  const metaColor = useLightForeground ? META_ON_DARK : META_ON_LIGHT;
  const pencilColor =
    Platform.OS === "web" && hoverPencil
      ? useLightForeground
        ? "#ffffff"
        : "#2563c4"
      : metaColor;

  useEffect(() => {
    setNameDraft(room.name);
  }, [room.name]);

  useEffect(() => {
    if (!editOpen) setHexDraft(room.accentColor ?? "");
  }, [room.accentColor, editOpen]);

  useEffect(() => {
    if (!editOpen || !canRename) return;
    const t = setTimeout(() => nameInputRef.current?.focus?.(), Platform.OS === "web" ? 80 : 0);
    return () => clearTimeout(t);
  }, [editOpen, canRename]);

  const saveNameOnly = useCallback(() => {
    const trimmed = nameDraft.trim();
    if (!canRename || !trimmed) return;
    if (trimmed !== room.name) {
      onRenameRoom?.(trimmed);
    }
  }, [canRename, nameDraft, room.name, onRenameRoom]);

  const closePopover = useCallback(() => {
    if (!tryCommitHexFromDraft()) return;
    const trimmed = nameDraft.trim();
    if (canRename && trimmed && trimmed !== room.name) {
      onRenameRoom?.(trimmed);
    }
    setEditOpen(false);
    setPreviewAccent(null);
    setHexError(false);
    Keyboard.dismiss();
  }, [canRename, nameDraft, room.name, onRenameRoom, hexDraft, room.accentColor, onCommitAccent]);

  useEffect(() => {
    if (!editOpen || Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePopover();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editOpen, closePopover]);

  function togglePencil(e?: { stopPropagation?: () => void; preventDefault?: () => void }) {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (editOpen) {
      closePopover();
    } else {
      setNameDraft(room.name);
      setHexDraft(room.accentColor ?? "");
      setHexError(false);
      setEditOpen(true);
    }
  }

  function commitAccent(hex: string | null) {
    onCommitAccent?.(hex);
    setHexDraft(hex ?? "");
    setHexError(false);
  }

  function tryCommitHexFromDraft(): boolean {
    const raw = hexDraft.trim();
    if (!raw) {
      setHexDraft(room.accentColor ?? "");
      return true;
    }
    const n = normalizeHexColor(raw);
    if (!n) {
      setHexError(true);
      return false;
    }
    commitAccent(n);
    return true;
  }

  function commitHexFromDraft() {
    tryCommitHexFromDraft();
  }

  const showPencil = canRename || canEditAccent;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          if (editOpen) return;
          setCollapsed((p) => !p);
        }}
        style={({ pressed }) => [
          styles.header,
          { backgroundColor: resolvedBg },
          styles.headerRel,
          Platform.OS === "web" && styles.headerWeb,
          pressed && styles.headerPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        // @ts-ignore web-only pointer hover
        onMouseEnter={() => Platform.OS === "web" && setHoverHeader(true)}
        // @ts-ignore web-only pointer hover
        onMouseLeave={() => Platform.OS === "web" && setHoverHeader(false)}
      >
        {Platform.OS === "web" && hoverHeader && (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: !useLightForeground
                  ? "rgba(0,0,0,0.06)"
                  : "rgba(255,255,255,0.12)",
                borderRadius: 0,
              },
            ]}
          />
        )}
        <MaterialCommunityIcons
          name="home-variant-outline"
          size={16}
          color={iconColor}
          style={[styles.headerIcon, styles.headerForeground]}
        />
        <Text style={[styles.title, { color: titleColor }, styles.headerForeground]} numberOfLines={1}>
          {room.name}
        </Text>
        <Text style={[styles.count, { color: metaColor }, styles.headerForeground]} numberOfLines={1}>
          {countLabel}
        </Text>
        {showPencil && (
          <Pressable
            onPress={(e: any) => togglePencil(e)}
            accessibilityRole="button"
            accessibilityLabel={
              editOpen ? `Close room edit for ${room.name}` : `Edit room name and color for ${room.name}`
            }
            hitSlop={8}
            style={({ pressed }) => [
              styles.renameIconBtn,
              !useLightForeground && styles.renameIconBtnLight,
              Platform.OS === "web" &&
                hoverPencil &&
                (!useLightForeground ? styles.renameIconBtnHoverLight : styles.renameIconBtnHover),
              pressed &&
                (!useLightForeground ? styles.renameIconBtnPressedLight : styles.renameIconBtnPressed),
              styles.headerForeground,
            ]}
            // @ts-ignore web-only pointer hover
            onMouseEnter={() => Platform.OS === "web" && setHoverPencil(true)}
            // @ts-ignore web-only pointer hover
            onMouseLeave={() => Platform.OS === "web" && setHoverPencil(false)}
          >
            <View
              style={{
                transform: [{ scale: Platform.OS === "web" && hoverPencil ? 1.08 : 1 }],
              }}
            >
              <MaterialCommunityIcons name="pencil" size={14} color={pencilColor} />
            </View>
          </Pressable>
        )}
        {canDelete && (
          <Pressable
            onPress={(e: any) => {
              e?.stopPropagation?.();
              e?.preventDefault?.();
              onDeleteRoom?.();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Delete room ${room.name}`}
            hitSlop={8}
            style={({ pressed }) => [
              styles.deleteIconBtn,
              !useLightForeground && styles.deleteIconBtnLight,
              Platform.OS === "web" && hoverDeleteIcon && styles.deleteIconBtnHover,
              pressed && styles.deleteIconBtnPressed,
              styles.headerForeground,
            ]}
            // @ts-ignore web-only pointer hover
            onMouseEnter={() => Platform.OS === "web" && setHoverDeleteIcon(true)}
            // @ts-ignore web-only pointer hover
            onMouseLeave={() => Platform.OS === "web" && setHoverDeleteIcon(false)}
          >
            <View
              style={{
                transform: [{ scale: Platform.OS === "web" && hoverDeleteIcon ? 1.08 : 1 }],
              }}
            >
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={14}
                color={Platform.OS === "web" && hoverDeleteIcon ? "#FFD7D7" : "#FFC4C4"}
              />
            </View>
          </Pressable>
        )}
        <MaterialCommunityIcons
          name={collapsed ? "chevron-down" : "chevron-up"}
          size={16}
          color={metaColor}
          style={styles.headerForeground}
        />
      </Pressable>

      {!collapsed && <View style={[styles.body, { backgroundColor: bodyTint }]}>{children}</View>}

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={closePopover}>
        <Pressable style={styles.modalBackdrop} onPress={closePopover}>
          <Pressable style={styles.popover} onPress={(e: any) => e?.stopPropagation?.()}>
            <Text style={styles.popoverTitle}>Edit room</Text>
            <Text style={styles.popoverSubtitle}>
              {canRename
                ? "Change the room name (Save name), pick a band color, then tap Done when you are finished."
                : "Pick a band color, then tap Done when you are finished."}
            </Text>
            {canRename && (
              <View style={styles.renameBlock}>
                <Text style={styles.popoverLabel}>Room name</Text>
                <TextInput
                  ref={nameInputRef}
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  placeholder="Room name"
                  placeholderTextColor="#9aa8b8"
                  style={styles.popoverNameInput}
                  returnKeyType="done"
                  onSubmitEditing={saveNameOnly}
                  blurOnSubmit={false}
                />
                <Pressable
                  onPress={saveNameOnly}
                  style={({ pressed }) => [styles.saveNameBtn, pressed && styles.saveNameBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Save room name as ${nameDraft.trim() || room.name}`}
                >
                  <MaterialCommunityIcons name="content-save-outline" size={18} color="#1d4ed8" />
                  <Text style={styles.saveNameBtnText}>Save name</Text>
                </Pressable>
              </View>
            )}
            <Text style={[styles.popoverLabel, canRename && styles.popoverLabelSpaced]}>Band color</Text>
            <View style={styles.swatchRow}>
              {ROOM_BAND_SWATCHES.map((hex) => (
                <Pressable
                  key={hex}
                  onPress={() => commitAccent(hex)}
                  style={({ pressed }) => [
                    styles.swatch,
                    { backgroundColor: hex },
                    (room.accentColor && normalizeHexColor(room.accentColor) === hex) && styles.swatchSelected,
                    pressed && styles.swatchPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Use color ${hex}`}
                  // @ts-ignore web-only
                  onMouseEnter={() => Platform.OS === "web" && setPreviewAccent(hex)}
                  // @ts-ignore web-only
                  onMouseLeave={() => Platform.OS === "web" && setPreviewAccent(null)}
                />
              ))}
            </View>
            <Text style={styles.popoverLabel}>Custom hex</Text>
            <TextInput
              value={hexDraft}
              onChangeText={(t) => {
                setHexDraft(t);
                setHexError(false);
              }}
              placeholder="#2d4a7a"
              placeholderTextColor="#9aa8b8"
              style={[styles.popoverHexInput, hexError && styles.popoverHexInputError]}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={commitHexFromDraft}
              onBlur={commitHexFromDraft}
            />
            {hexError ? (
              <Text style={styles.popoverError}>Enter a valid hex like #2D4A7A or #RGB</Text>
            ) : null}
            <Pressable
              onPress={closePopover}
              style={({ pressed }) => [styles.doneBtn, pressed && styles.doneBtnPressed]}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER_OUTER,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 13,
    gap: 9,
  },
  headerRel: {
    position: "relative",
  },
  headerWeb: {
    cursor: "pointer" as const,
  },
  headerPressed: {
    opacity: 0.92,
  },
  headerForeground: {
    zIndex: 1,
  },
  headerIcon: {
    flexShrink: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "600",
  },
  count: {
    fontSize: 13,
    flexShrink: 0,
  },
  body: {
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: BORDER_OUTER,
    padding: 10,
    gap: 8,
  },
  renameIconBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  renameIconBtnLight: {
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  renameIconBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  renameIconBtnPressedLight: {
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  renameIconBtnHover: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  renameIconBtnHoverLight: {
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  deleteIconBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 85, 85, 0.18)",
  },
  deleteIconBtnLight: {
    backgroundColor: "rgba(200, 60, 60, 0.15)",
  },
  deleteIconBtnPressed: {
    backgroundColor: "rgba(255, 85, 85, 0.28)",
  },
  deleteIconBtnHover: {
    backgroundColor: "rgba(255, 85, 85, 0.33)",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 72,
    paddingHorizontal: 16,
  },
  popover: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 12,
    padding: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: BORDER_OUTER,
  },
  popoverTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1a2a3d",
    marginBottom: 6,
  },
  popoverSubtitle: {
    fontSize: 13,
    color: "#5a6d82",
    lineHeight: 18,
    marginBottom: 14,
  },
  renameBlock: {
    marginBottom: 4,
  },
  saveNameBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#e8f0fe",
    borderWidth: 1,
    borderColor: "#c7d9f8",
  },
  saveNameBtnPressed: {
    opacity: 0.88,
  },
  saveNameBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1d4ed8",
  },
  popoverLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5a6d82",
    marginBottom: 6,
    marginTop: 4,
  },
  popoverNameInput: {
    borderWidth: 1,
    borderColor: "#c8dcf0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1a2a3d",
    marginBottom: 4,
  },
  popoverLabelSpaced: {
    marginTop: 12,
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.12)",
  },
  swatchSelected: {
    borderColor: "#2F80ED",
    borderWidth: 3,
  },
  swatchPressed: {
    opacity: 0.85,
  },
  popoverHexInput: {
    borderWidth: 1,
    borderColor: "#c8dcf0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1a2a3d",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  popoverHexInputError: {
    borderColor: "#c62828",
  },
  popoverError: {
    color: "#c62828",
    fontSize: 12,
    marginTop: 4,
  },
  doneBtn: {
    marginTop: 16,
    alignSelf: "flex-end",
    backgroundColor: "#2D4A7A",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  doneBtnPressed: {
    opacity: 0.88,
  },
  doneBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});
