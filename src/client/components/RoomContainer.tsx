/* PROLOGUE
File name: RoomContainer.tsx
Description: Collapsible room block with default dark navy header band and white feature body (list view).
Programmer: Nifemi Lawal
Creation date: 4/14/26
Revision date:
*/

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  TextInput,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { navy } from "../theme/colors";

/** Minimal room identity for the header (id distinguishes unassigned). */
export type RoomBand = {
  id: string;
  name: string;
};

const BORDER_OUTER = "#b8c8d8";
const TITLE_NAMED = "#e8f2fc";
const TITLE_UNASSIGNED = "#c0d0e6";
const ICON_NAMED = "#c2dafb";
const ICON_UNASSIGNED = "#a8c4e8";
const META = "#b4d2f0";

type Props = {
  room: RoomBand;
  featureCount: number;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  onRenameRoom?: (nextName: string) => void;
  onDeleteRoom?: () => void;
};

export function RoomContainer({
  room,
  featureCount,
  children,
  defaultCollapsed = false,
  onRenameRoom,
  onDeleteRoom,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(room.name);
  const [hoverHeader, setHoverHeader] = useState(false);
  const [hoverRenameIcon, setHoverRenameIcon] = useState(false);
  const [hoverDeleteIcon, setHoverDeleteIcon] = useState(false);
  const isUnassigned = room.id === "unassigned";
  const canRename = typeof onRenameRoom === "function";
  const canDelete = typeof onDeleteRoom === "function";
  const countLabel = `${featureCount} feature${featureCount === 1 ? "" : "s"}`;

  useEffect(() => {
    if (!isRenaming) setRenameDraft(room.name);
  }, [room.name, isRenaming]);

  function handleSubmitRename() {
    const next = renameDraft.trim();
    if (!next) return;
    if (next !== room.name) {
      onRenameRoom?.(next);
    }
    setIsRenaming(false);
  }

  function handleStartRename() {
    setRenameDraft(room.name);
    setIsRenaming(true);
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          if (isRenaming) return;
          setCollapsed((p) => !p);
        }}
        style={({ pressed }) => [
          styles.header,
          { backgroundColor: navy },
          Platform.OS === "web" && styles.headerWeb,
          Platform.OS === "web" && hoverHeader && styles.headerHover,
          pressed && styles.headerPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        // @ts-ignore web-only pointer hover
        onMouseEnter={() => Platform.OS === "web" && setHoverHeader(true)}
        // @ts-ignore web-only pointer hover
        onMouseLeave={() => Platform.OS === "web" && setHoverHeader(false)}
      >
        <MaterialCommunityIcons
          name="home-variant-outline"
          size={16}
          color={isUnassigned ? ICON_UNASSIGNED : ICON_NAMED}
          style={styles.headerIcon}
        />
        <Text
          style={[styles.title, isUnassigned && styles.titleUnassigned, isRenaming && styles.titleHidden]}
          numberOfLines={1}
        >
          {!isRenaming ? room.name : ""}
        </Text>
        {isRenaming && (
          <TextInput
            value={renameDraft}
            onChangeText={setRenameDraft}
            placeholder="Room name"
            placeholderTextColor="#9fb7d6"
            style={styles.inlineRenameInput}
            onSubmitEditing={handleSubmitRename}
            returnKeyType="done"
            autoFocus
            onPressIn={(e: any) => {
              e?.stopPropagation?.();
            }}
          />
        )}
        <Text style={styles.count} numberOfLines={1}>
          {countLabel}
        </Text>
        {canRename && !isRenaming && (
          <Pressable
            onPress={(e: any) => {
              e?.stopPropagation?.();
              e?.preventDefault?.();
              handleStartRename();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Rename room ${room.name}`}
            hitSlop={8}
            style={({ pressed }) => [
              styles.renameIconBtn,
              Platform.OS === "web" && hoverRenameIcon && styles.renameIconBtnHover,
              pressed && styles.renameIconBtnPressed,
            ]}
            // @ts-ignore web-only pointer hover
            onMouseEnter={() => Platform.OS === "web" && setHoverRenameIcon(true)}
            // @ts-ignore web-only pointer hover
            onMouseLeave={() => Platform.OS === "web" && setHoverRenameIcon(false)}
          >
            <View
              style={{
                transform: [{ scale: Platform.OS === "web" && hoverRenameIcon ? 1.08 : 1 }],
              }}
            >
              <MaterialCommunityIcons
                name="pencil"
                size={14}
                color={Platform.OS === "web" && hoverRenameIcon ? "#E8F5FF" : META}
              />
            </View>
          </Pressable>
        )}
        {canRename && isRenaming && (
          <>
            <Pressable
              onPress={(e: any) => {
                e?.stopPropagation?.();
                e?.preventDefault?.();
                handleSubmitRename();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Save room name ${room.name}`}
              hitSlop={8}
              style={({ pressed }) => [styles.renameIconBtn, pressed && styles.renameIconBtnPressed]}
            >
              <MaterialCommunityIcons name="check" size={14} color="#E8F5FF" />
            </Pressable>
            <Pressable
              onPress={(e: any) => {
                e?.stopPropagation?.();
                e?.preventDefault?.();
                setIsRenaming(false);
                setRenameDraft(room.name);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Cancel room rename ${room.name}`}
              hitSlop={8}
              style={({ pressed }) => [styles.renameIconBtn, pressed && styles.renameIconBtnPressed]}
            >
              <MaterialCommunityIcons name="close" size={14} color={META} />
            </Pressable>
          </>
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
              Platform.OS === "web" && hoverDeleteIcon && styles.deleteIconBtnHover,
              pressed && styles.deleteIconBtnPressed,
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
          color={META}
        />
      </Pressable>

      {!collapsed && (
        <View style={styles.body}>
          {children}
        </View>
      )}
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
  headerWeb: {
    cursor: "pointer" as const,
  },
  headerHover: {
    backgroundColor: "#355488",
  },
  headerPressed: {
    opacity: 0.92,
  },
  headerIcon: {
    flexShrink: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "600",
    color: TITLE_NAMED,
  },
  titleUnassigned: {
    color: TITLE_UNASSIGNED,
    fontStyle: "italic",
  },
  titleHidden: {
    display: "none",
  },
  inlineRenameInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "rgba(232,245,255,0.45)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 14,
    color: "#E8F2FC",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  count: {
    fontSize: 13,
    color: META,
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
  renameIconBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  renameIconBtnHover: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  deleteIconBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 85, 85, 0.18)",
  },
  deleteIconBtnPressed: {
    backgroundColor: "rgba(255, 85, 85, 0.28)",
  },
  deleteIconBtnHover: {
    backgroundColor: "rgba(255, 85, 85, 0.33)",
  },
});
