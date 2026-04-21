/* PROLOGUE
File name: list.tsx
Description: A list view for managing household tasks grouped by location/room.
             Connected to the Flask/PostgreSQL backend via api.ts (data/api.ts) loads features
             and tasks from the DB on mount, and all mutations (add, delete, rename,
             complete) hit the server then update local state optimistically.
Programmer: Nifemi Lawal
Creation date: 2/6/26
Revision date:
  - 2/11/26: Fix padding for the new section name input area
  - 3/1/26: Add AsyncStorage persistence (load on mount, save on change),
             expanded add-task card with icon picker / frequency pills / presets,
             location icon picker for new sections; restore TaskRow comments
  - 3/8/26: Use server classes for consistency
  - 3/29/26: Replace AsyncStorage with Flask API calls, add mark-complete button,
             read household id from route params; replace hardcoded localhost URL
             with EXPO_PUBLIC_API_URL env variable
  - 4/5/26: Add support for viewing next due date of a task
  - 4/6/26: Convert to use FeatureType enum
  - 4/12/26: Phone-sized layout fixes and in-app delete prompts instead of system popups
  - 4/13/26: Web hover feedback on list rows, headers, add-task/section controls
  - 4/14/26: Collapsible room grouping, room CRUD, feature room assignment
  - 4/15/26: Remove room_number and room_name parameters from the feature object
  - 4/20/26: Set XYZ positions on feature creation to undefined so they become NULL in the DB
Preconditions: Flask server reachable at EXPO_PUBLIC_API_URL with the household's data in the DB
Postconditions: Renders an interactive task list that stays in sync with the database
Errors: Shows error state with retry button if API is unreachable
Side effects: Makes HTTP requests to the Flask backend on every mutation
Invariants: None
Known faults: None
*/

//TODO: talk w/ group ab ids, currently strings, do we want to make numbers that the db references?
//TODO: work w/ jack to ensure all location logic is consistent
//TODO: make all ids use numbers 
//TODO: fix highlight not working

// Prevents URL changing to bypass login.
import { AuthLoadingScreen, useAuthGuard } from "../../../utils/useAuthGuard";
// Import react hooks we need for state, lifecycle, and performance
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Import RN components for building the UI
import {
    Keyboard,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from "react-native";
import { Button, Dialog, PaperProvider, Portal, Text as PaperText } from "react-native-paper";
import { appPaperLightTheme } from "../../../theme/paperTheme";
// Material design icons
import { MaterialCommunityIcons } from "@expo/vector-icons";
// Need this to grab the household id from the URL (e.g. /household/3/list)
import { useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Import server classes
import Task from "../../../data/task";
import Feature, { FeatureType } from "../../../data/feature";
import type { HouseholdRoom } from "../../../data/room";

// Import data helpers, types, presets, and storage utilities
import {
  FREQUENCY_PRESETS,
  LOCATION_ICONS,
  TASK_ICONS,
  TASK_PRESETS,
  healthPercent,
  daysUntilNextDue,
  healthColor,
} from "../../../data/householdUtils";

// API functions for talking to the Flask backend
// Aliased with "api" prefix so they don't clash with handler names in this file
import {
  fetchHouseholdFeatures,
  fetchHouseholdRooms,
  fetchMyHouseholds,
  createFeature as apiCreateFeature,
  createHouseholdRoom as apiCreateHouseholdRoom,
  deleteHouseholdRoom as apiDeleteHouseholdRoom,
  updateHouseholdRoom as apiUpdateHouseholdRoom,
  updateFeature as apiUpdateFeature,
  deleteFeature as apiDeleteFeature,
  createTask as apiCreateTask,
  deleteTask as apiDeleteTask,
  completeTask as apiCompleteTask,
} from "../../../data/api";
import { RoomContainer } from "../../../components/RoomContainer";
import { normalizeHexColor } from "../../../utils/hexColor";
import {
  listBorder,
  listBrand,
  listSelection,
  listSurfaceSoft,
  textPrimary,
  textSecondary,
} from "../../../theme/colors";

/** Web-only pointer hover; handlers are no-ops on native */
function useWebHover(): readonly [
  boolean,
  { onMouseEnter?: () => void; onMouseLeave?: () => void },
] {
  const [hovered, setHovered] = useState(false);
  const handlers =
    Platform.OS === "web"
      ? {
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
        }
      : {};
  return [hovered, handlers] as const;
}

// Health bar component that shows how "healthy" a task is as a colored bar
function HealthBar({ task }: { task: Task }) {
    const pct = healthPercent(task); // get the health as a 0-1 decimal
    const color = healthColor(pct); // pick a color based on the percentage
    const label = `${Math.round(pct * 100)}%`; // format as a readable percentage
    return (
        <View style={styles.healthBarRow}>
            <View style={styles.healthBarOuter}>
                <View
                    style={[
                        styles.healthBarInner,
                        { width: `${Math.round(pct * 100)}%`, backgroundColor: color },
                    ]}
                />
            </View>
            <Text style={[styles.healthBarLabel, { color }]}>{label}</Text>
        </View>
    );
}

// A single task row showing a checkbox, icon, name, health bar, and delete button
function TaskRow({
    task,
    isSelected,
    onToggleSelect,
    onRequestDeleteTask,
    onCompleteTask,
}: {
    task: Task;
    isSelected: boolean;
    onToggleSelect: (id: number) => void;
    /** Opens the styled delete confirmation (parent performs delete on confirm). */
    onRequestDeleteTask: (task: Task) => void;
    onCompleteTask: (id: number) => void;
}) {
  const daysLeft = daysUntilNextDue(task);
  const duePhrase = `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;
  const [hoverRow, hoverRowHandlers] = useWebHover();
  const [hoverCheck, hoverCheckHandlers] = useWebHover();
  const [hoverDone, hoverDoneHandlers] = useWebHover();
  const [hoverDel, hoverDelHandlers] = useWebHover();

  return (
    <View
      style={[
        styles.taskRow,
        isSelected && styles.taskRowSelected,
        Platform.OS === "web" && hoverRow && styles.listRowHoverDarken,
      ]}
      // @ts-ignore web-only pointer hover — whole task row
      {...hoverRowHandlers}
    >
      <Pressable
        onPress={() => onToggleSelect(task.id)}
        hitSlop={8}
        style={({ pressed }) => [
          styles.checkbox,
          Platform.OS === "web" && hoverCheck && styles.taskRowControlHover,
          pressed && styles.taskRowControlPressed,
        ]}
        // @ts-ignore web-only
        {...hoverCheckHandlers}
      >
        <View
          style={{
            transform: [{ scale: Platform.OS === "web" && hoverCheck ? 1.08 : 1 }],
          }}
        >
          <MaterialCommunityIcons
            name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"}
            size={22}
            color={isSelected ? listBrand : "#ccc"}
          />
        </View>
      </Pressable>

      <View style={styles.taskIconWrap}>
        <MaterialCommunityIcons
          name={task.icon as any}
          size={20}
          color={listBrand}
        />
      </View>

      <View style={styles.taskInfo}>
        <Text style={styles.taskName} numberOfLines={1}>
          {task.name}  
        </Text>
        <HealthBar task={task} />
        <Text style={styles.taskDueText}>
          Time Until Due:{" "}
          <Text style={[styles.taskDueText, { color: healthColor(task.healthPercent) }]}>
            {duePhrase}
          </Text>
        </Text>
      </View>

      {/* Green check button to mark task as done (resets the health bar to 100%) */}
      <Pressable
        onPress={() => onCompleteTask(task.id)}
        hitSlop={8}
        style={({ pressed }) => [
          styles.completeBtn,
          Platform.OS === "web" && hoverDone && styles.taskRowControlHover,
          pressed && styles.taskRowControlPressed,
        ]}
        // @ts-ignore web-only
        {...hoverDoneHandlers}
      >
        <View
          style={{
            transform: [{ scale: Platform.OS === "web" && hoverDone ? 1.08 : 1 }],
          }}
        >
          <MaterialCommunityIcons
            name="check-circle-outline"
            size={20}
            color={Platform.OS === "web" && hoverDone ? "#2e7d32" : "#4caf50"}
          />
        </View>
      </Pressable>

      <Pressable
        onPress={() => onRequestDeleteTask(task)}
        hitSlop={8}
        style={({ pressed }) => [
          styles.taskDeleteBtn,
          Platform.OS === "web" && hoverDel && styles.taskRowControlHover,
          pressed && styles.taskRowControlPressed,
        ]}
        // @ts-ignore web-only
        {...hoverDelHandlers}
      >
        <View
          style={{
            transform: [{ scale: Platform.OS === "web" && hoverDel ? 1.08 : 1 }],
          }}
        >
          <MaterialCommunityIcons
            name="close-circle-outline"
            size={20}
            color={Platform.OS === "web" && hoverDel ? "#e57373" : "#ccc"}
          />
        </View>
      </Pressable>
    </View>
  );
}

// expandable card that lets you add a new task with presets, icon picker, etc.
function AddTaskCard({
  onAdd,
}: {
  onAdd: (name: string, icon: string, frequencyDays: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(TASK_ICONS[0]);
  const [freqDays, setFreqDays] = useState(FREQUENCY_PRESETS[0].days);
  const [customFreq, setCustomFreq] = useState(false);
  const [customFreqText, setCustomFreqText] = useState("");

  const resetForm = () => {
    setName("");
    setIcon(TASK_ICONS[0]);
    setFreqDays(FREQUENCY_PRESETS[0].days);
    setCustomFreq(false);
    setCustomFreqText("");
    setExpanded(false);
  };

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, icon, freqDays);
    resetForm();
  };

  const applyPreset = (preset: (typeof TASK_PRESETS)[number]) => {
    setName(preset.name);
    setIcon(preset.icon);
    setFreqDays(preset.frequencyDays);
    setCustomFreq(false);
    setCustomFreqText("");
  };

  const [hoverAddRow, hoverAddRowHandlers] = useWebHover();
  const [hoverPresetKey, setHoverPresetKey] = useState<string | null>(null);
  const [hoverIconKey, setHoverIconKey] = useState<string | null>(null);
  const [hoverFreqKey, setHoverFreqKey] = useState<number | "custom" | null>(null);
  const [hoverCancel, hoverCancelHandlers] = useWebHover();
  const [hoverSubmit, hoverSubmitHandlers] = useWebHover();

  if (!expanded) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.addTaskRow,
          Platform.OS === "web" && hoverAddRow && styles.listRowHoverDarken,
          pressed && styles.listPressablePressed,
        ]}
        onPress={() => setExpanded(true)}
        // @ts-ignore web-only pointer hover
        {...hoverAddRowHandlers}
      >
        <View
          style={{
            transform: [{ scale: Platform.OS === "web" && hoverAddRow ? 1.05 : 1 }],
          }}
        >
          <MaterialCommunityIcons
            name="plus"
            size={18}
            color={listBrand}
            style={{ marginRight: 8 }}
          />
        </View>
        <Text
          style={[
            styles.addTaskPlaceholder,
            Platform.OS === "web" && hoverAddRow && { color: "#8A9BAE" },
          ]}
        >
          Add a task...
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.addTaskCard}>
      <Text style={styles.addTaskLabel}>Quick presets</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.presetScroll}
        contentContainerStyle={styles.presetScrollContent}
      >
        {TASK_PRESETS.map((p) => (
          <Pressable
            key={p.name}
            style={[
              styles.presetChip,
              name === p.name && styles.presetChipActive,
              Platform.OS === "web" &&
                hoverPresetKey === p.name &&
                !(name === p.name) &&
                styles.chipInactiveHover,
              Platform.OS === "web" &&
                hoverPresetKey === p.name &&
                name === p.name &&
                styles.chipActiveHover,
            ]}
            onPress={() => applyPreset(p)}
            // @ts-ignore web-only pointer hover
            onMouseEnter={() => Platform.OS === "web" && setHoverPresetKey(p.name)}
            // @ts-ignore web-only pointer hover
            onMouseLeave={() =>
              Platform.OS === "web" &&
              setHoverPresetKey((k) => (k === p.name ? null : k))
            }
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                transform: [
                  {
                    scale:
                      Platform.OS === "web" && hoverPresetKey === p.name ? 1.03 : 1,
                  },
                ],
              }}
            >
              <MaterialCommunityIcons
                name={p.icon as any}
                size={14}
                color={name === p.name ? "#fff" : listBrand}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.presetChipText,
                  name === p.name && styles.presetChipTextActive,
                ]}
              >
                {p.name}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.addTaskLabel}>Task name</Text>
      <TextInput
        style={styles.addTaskNameInput}
        placeholder="e.g. Scrub toilet"
        placeholderTextColor="#bbb"
        value={name}
        onChangeText={setName}
        onSubmitEditing={handleSubmit}
        returnKeyType="done"
      />

      <Text style={styles.addTaskLabel}>Icon</Text>
      <View style={styles.iconPickerRow}>
        {TASK_ICONS.slice(0, 12).map((ic) => (
          <Pressable
            key={ic}
            onPress={() => setIcon(ic)}
            style={[
              styles.iconPickerItem,
              icon === ic && styles.iconPickerItemActive,
              Platform.OS === "web" &&
                hoverIconKey === ic &&
                !(icon === ic) &&
                styles.chipInactiveHover,
              Platform.OS === "web" &&
                hoverIconKey === ic &&
                icon === ic &&
                styles.chipActiveHover,
            ]}
            // @ts-ignore web-only pointer hover
            onMouseEnter={() => Platform.OS === "web" && setHoverIconKey(ic)}
            // @ts-ignore web-only pointer hover
            onMouseLeave={() =>
              Platform.OS === "web" && setHoverIconKey((k) => (k === ic ? null : k))
            }
          >
            <View
              style={{
                transform: [
                  { scale: Platform.OS === "web" && hoverIconKey === ic ? 1.08 : 1 },
                ],
              }}
            >
              <MaterialCommunityIcons
                name={ic as any}
                size={20}
                color={icon === ic ? "#fff" : "#666"}
              />
            </View>
          </Pressable>
        ))}
      </View>

      <Text style={styles.addTaskLabel}>Frequency</Text>
      <View style={styles.freqRow}>
        {FREQUENCY_PRESETS.map((fp) => (
          <Pressable
            key={fp.days}
            onPress={() => {
              setFreqDays(fp.days);
              setCustomFreq(false);
              setCustomFreqText("");
            }}
            style={[
              styles.freqPill,
              !customFreq && freqDays === fp.days && styles.freqPillActive,
              Platform.OS === "web" &&
                hoverFreqKey === fp.days &&
                !(!customFreq && freqDays === fp.days) &&
                styles.chipInactiveHover,
              Platform.OS === "web" &&
                hoverFreqKey === fp.days &&
                !customFreq &&
                freqDays === fp.days &&
                styles.chipActiveHover,
            ]}
            // @ts-ignore web-only pointer hover
            onMouseEnter={() => Platform.OS === "web" && setHoverFreqKey(fp.days)}
            // @ts-ignore web-only pointer hover
            onMouseLeave={() =>
              Platform.OS === "web" &&
              setHoverFreqKey((k) => (k === fp.days ? null : k))
            }
          >
            <View
              style={{
                transform: [
                  {
                    scale:
                      Platform.OS === "web" && hoverFreqKey === fp.days ? 1.04 : 1,
                  },
                ],
              }}
            >
              <Text
                style={[
                  styles.freqPillText,
                  !customFreq && freqDays === fp.days && styles.freqPillTextActive,
                ]}
              >
                {fp.label}
              </Text>
            </View>
          </Pressable>
        ))}
        <Pressable
          onPress={() => setCustomFreq(true)}
          style={[
            styles.freqPill,
            customFreq && styles.freqPillActive,
            Platform.OS === "web" &&
              hoverFreqKey === "custom" &&
              !customFreq &&
              styles.chipInactiveHover,
            Platform.OS === "web" &&
              hoverFreqKey === "custom" &&
              customFreq &&
              styles.chipActiveHover,
          ]}
          // @ts-ignore web-only pointer hover
          onMouseEnter={() => Platform.OS === "web" && setHoverFreqKey("custom")}
          // @ts-ignore web-only pointer hover
          onMouseLeave={() =>
            Platform.OS === "web" &&
            setHoverFreqKey((k) => (k === "custom" ? null : k))
          }
        >
          <View
            style={{
              transform: [
                {
                  scale:
                    Platform.OS === "web" && hoverFreqKey === "custom" ? 1.04 : 1,
                },
              ],
            }}
          >
            <Text
              style={[styles.freqPillText, customFreq && styles.freqPillTextActive]}
            >
              Custom
            </Text>
          </View>
        </Pressable>
      </View>

      {customFreq && (
        <View style={styles.customFreqRow}>
          <Text style={styles.customFreqLabel}>Every</Text>
          <TextInput
            style={styles.customFreqInput}
            placeholder="e.g. 2"
            placeholderTextColor="#bbb"
            keyboardType="numeric"
            value={customFreqText}
            onChangeText={(t) => {
              setCustomFreqText(t);
              const parsed = parseFloat(t);
              if (!isNaN(parsed) && parsed > 0) setFreqDays(parsed);
            }}
          />
          <Text style={styles.customFreqLabel}>days</Text>
        </View>
      )}

      <View style={styles.addTaskActions}>
        <Pressable
          onPress={resetForm}
          style={({ pressed }) => [
            styles.addTaskCancelBtn,
            Platform.OS === "web" && hoverCancel && styles.addTaskCancelBtnHover,
            pressed && styles.listPressablePressed,
          ]}
          // @ts-ignore web-only pointer hover
          {...hoverCancelHandlers}
        >
          <Text
            style={[
              styles.addTaskCancelText,
              Platform.OS === "web" && hoverCancel && { color: "#666" },
            ]}
          >
            Cancel
          </Text>
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          style={({ pressed }) => [
            styles.addTaskSubmitBtn,
            !name.trim() && styles.addTaskSubmitBtnDisabled,
            Platform.OS === "web" &&
              hoverSubmit &&
              !!name.trim() &&
              styles.addTaskSubmitBtnHover,
            pressed && styles.listPressablePressed,
          ]}
          // @ts-ignore web-only pointer hover
          {...hoverSubmitHandlers}
        >
          <Text style={styles.addTaskSubmitText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Single row in the Assign to room modal —-> faint dividers + web hover fill */
function RoomPickerOption({
  label,
  onSelect,
  showTopRule,
}: {
  label: string;
  onSelect: () => void;
  /** Separator line above (not on first row under title) */
  showTopRule?: boolean;
}) {
  const [hover, hoverHandlers] = useWebHover();
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.roomModalOption,
        showTopRule && styles.roomModalOptionTopRule,
        Platform.OS === "web" && hover && styles.roomModalOptionHover,
        pressed && styles.roomModalOptionPressed,
        Platform.OS === "web" && styles.roomModalOptionWeb,
      ]}
      // @ts-ignore web-only pointer hover
      {...hoverHandlers}
    >
      <Text style={styles.roomModalOptionText}>{label}</Text>
    </Pressable>
  );
}

// A collapsible group of tasks under one feature/room
// onCompleteTask is passed down to each TaskRow so tapping the check button works
function FeatureGroup({
  feature,
  selectedIds,
  onToggleSelect,
  onDeleteSelected,
  onRequestDeleteTask,
  onAddTask,
  onRenameFeature,
  onRequestDeleteSection,
  onCompleteTask,
  rooms,
  onAssignFeatureRoom,
}: {
  feature: Feature;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onDeleteSelected: (featureId: number) => void;
  onRequestDeleteTask: (featureId: number, task: Task) => void;
  onAddTask: (featureId: number, name: string, icon: string, freqDays: number) => void;
  onRenameFeature: (featureId: number, newName: string) => void;
  onRequestDeleteSection: (featureId: number, sectionName: string) => void;
  onCompleteTask: (taskId: number) => void;
  rooms: HouseholdRoom[];
  onAssignFeatureRoom: (featureId: number, roomId: number | null) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(feature.name);
  const taskCount = Array.from(feature.tasks).length;
  const [collapsed, setCollapsed] = useState(taskCount === 0);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const previousTaskCountRef = useRef(taskCount);

  const hasSelection = Array.from(feature.tasks).some((t) => selectedIds.has(t.id));
  const selectedCount = Array.from(feature.tasks).filter((t) => selectedIds.has(t.id)).length;

  const [hoverHeader, hoverHeaderHandlers] = useWebHover();
  const [hoverBatch, hoverBatchHandlers] = useWebHover();
  const [hoverEditBtn, hoverEditBtnHandlers] = useWebHover();
  const [hoverTrashBtn, hoverTrashBtnHandlers] = useWebHover();
  const [hoverDoneEdit, hoverDoneEditHandlers] = useWebHover();
  const { height: windowHeight } = useWindowDimensions();

  const persistRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== feature.name) {
      onRenameFeature(feature.id, trimmed);
    } else {
      setEditName(feature.name);
    }
  };

  const exitEditMode = () => {
    setIsEditing(false);
  };

  const commitRenameAndExit = () => {
    persistRename();
    exitEditMode();
  };

  const handleStartEdit = () => {
    setEditName(feature.name);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const confirmDeleteFeature = () => {
    onRequestDeleteSection(feature.id, feature.name);
  };

  useEffect(() => {
    const previousTaskCount = previousTaskCountRef.current;

    if (taskCount === 0 && previousTaskCount > 0) {
      setCollapsed(true);
    } else if (taskCount > 0 && previousTaskCount === 0) {
      setCollapsed(false);
    }

    previousTaskCountRef.current = taskCount;
  }, [taskCount]);

  return (
    <View style={styles.featureGroup}>
      <Pressable
        style={({ pressed }) => [
          styles.featureHeader,
          Platform.OS === "web" && hoverHeader && styles.listRowHoverDarken,
          pressed && styles.listPressablePressed,
        ]}
        onPress={() => setCollapsed((c) => !c)}
        // @ts-ignore web-only pointer hover
        {...hoverHeaderHandlers}
      >
        <View
          style={{
            transform: [{ scale: Platform.OS === "web" && hoverHeader ? 1.06 : 1 }],
          }}
        >
          <MaterialCommunityIcons
            name={feature.icon as any}
            size={24}
            color={listBrand}
          />
        </View>

        {isEditing ? (
          <TextInput
            ref={inputRef}
            style={styles.featureNameInput}
            value={editName}
            onChangeText={setEditName}
            onBlur={persistRename}
            onSubmitEditing={commitRenameAndExit}
            returnKeyType="done"
            selectTextOnFocus
          />
        ) : (
          <View style={styles.featureTitleWrap}>
            <Pressable onLongPress={handleStartEdit} style={styles.featureTitlePressable}>
              <Text style={styles.featureName} numberOfLines={2} ellipsizeMode="tail">
                {feature.name}
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.taskCount}>{taskCount}</Text>

        {hasSelection && (
          <Pressable
            onPress={() => onDeleteSelected(feature.id)}
            style={({ pressed }) => [
              styles.batchDeleteBtn,
              Platform.OS === "web" && hoverBatch && styles.batchDeleteBtnHover,
              pressed && styles.listPressablePressed,
            ]}
            // @ts-ignore web-only pointer hover
            {...hoverBatchHandlers}
          >
            <MaterialCommunityIcons name="delete-outline" size={18} color="#f44336" />
            <Text style={styles.batchDeleteText}>{selectedCount}</Text>
          </Pressable>
        )}

        {isEditing ? (
          <Pressable
            onPress={commitRenameAndExit}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Done editing section"
            style={({ pressed }) => [
              styles.headerActionBtn,
              Platform.OS === "web" && hoverDoneEdit && styles.headerActionBtnHover,
              pressed && styles.listPressablePressed,
            ]}
            // @ts-ignore web-only pointer hover
            {...hoverDoneEditHandlers}
          >
            <View
              style={{
                transform: [{ scale: Platform.OS === "web" && hoverDoneEdit ? 1.1 : 1 }],
              }}
            >
              <MaterialCommunityIcons
                name="check"
                size={20}
                color={Platform.OS === "web" && hoverDoneEdit ? listBrand : "#2e7d32"}
              />
            </View>
          </Pressable>
        ) : (
          <View style={styles.headerActions}>
            <Pressable
              onPress={handleStartEdit}
              hitSlop={6}
              style={({ pressed }) => [
                styles.headerActionBtn,
                Platform.OS === "web" && hoverEditBtn && styles.headerActionBtnHover,
                pressed && styles.listPressablePressed,
              ]}
              // @ts-ignore web-only pointer hover
              {...hoverEditBtnHandlers}
            >
              <View
                style={{
                  transform: [{ scale: Platform.OS === "web" && hoverEditBtn ? 1.1 : 1 }],
                }}
              >
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={18}
                  color={Platform.OS === "web" && hoverEditBtn ? listBrand : "#999"}
                />
              </View>
            </Pressable>
            <Pressable
              onPress={confirmDeleteFeature}
              hitSlop={6}
              style={({ pressed }) => [
                styles.headerActionBtn,
                Platform.OS === "web" && hoverTrashBtn && styles.headerActionBtnHover,
                pressed && styles.listPressablePressed,
              ]}
              // @ts-ignore web-only pointer hover
              {...hoverTrashBtnHandlers}
            >
              <View
                style={{
                  transform: [{ scale: Platform.OS === "web" && hoverTrashBtn ? 1.1 : 1 }],
                }}
              >
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={18}
                  color={Platform.OS === "web" && hoverTrashBtn ? "#e53935" : "#999"}
                />
              </View>
            </Pressable>
          </View>
        )}

        <MaterialCommunityIcons
          name={collapsed ? "chevron-down" : "chevron-up"}
          size={22}
          color={Platform.OS === "web" && hoverHeader ? listBrand : "#999"}
          style={{
            marginLeft: 4,
            transform: [{ scale: Platform.OS === "web" && hoverHeader ? 1.08 : 1 }],
          }}
        />
      </Pressable>

      {isEditing && (
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            setRoomPickerOpen(true);
          }}
          style={({ pressed }) => [
            styles.roomAssignRow,
            Platform.OS === "web" && pressed && styles.listRowHoverDarken,
          ]}
        >
          <MaterialCommunityIcons name="door-open" size={18} color={listBrand} />
          <Text style={styles.roomAssignText} numberOfLines={1}>
            {feature.room_id == null
              ? "Unassigned"
              : rooms.find((r) => r.room_id === feature.room_id)?.room_name ?? "Unassigned"}
          </Text>
          <Text style={styles.roomAssignAction}>Change room</Text>
        </Pressable>
      )}

      <Modal
        visible={roomPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRoomPickerOpen(false)}
      >
        <View
          style={[
            styles.roomModalBackdrop,
            { paddingTop: windowHeight * 0.35 },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setRoomPickerOpen(false)}
            accessibilityLabel="Dismiss room picker"
          />
          <View style={styles.roomModalCard}>
            <Text style={styles.roomModalTitle}>Assign to room</Text>
            <View style={styles.roomModalOptionList}>
              <RoomPickerOption
                label="Unassigned"
                showTopRule={false}
                onSelect={() => {
                  onAssignFeatureRoom(feature.id, null);
                  setRoomPickerOpen(false);
                  setIsEditing(false);
                }}
              />
              {rooms.map((r) => (
                <RoomPickerOption
                  key={r.room_id}
                  label={r.room_name}
                  showTopRule
                  onSelect={() => {
                    onAssignFeatureRoom(feature.id, r.room_id);
                    setRoomPickerOpen(false);
                    setIsEditing(false);
                  }}
                />
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {!collapsed && (
        <>
          {taskCount === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="playlist-remove" size={32} color="#ddd" />
              <Text style={styles.emptyStateText}>No tasks yet</Text>
            </View>
          ) : (
            <View style={styles.taskListContainer}>
              {Array.from(feature.tasks).map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isSelected={selectedIds.has(task.id)}
                  onToggleSelect={onToggleSelect}
                  onRequestDeleteTask={(t) => onRequestDeleteTask(feature.id, t)}
                  onCompleteTask={onCompleteTask}
                />
              ))}
            </View>
          )}

          <AddTaskCard
            onAdd={(name, icon, freqDays) =>
              onAddTask(feature.id, name, icon, freqDays)
            }
          />
        </>
      )}
    </View>
  );
}

// Creates a new feature (section) under a room group, with an icon picker
function AddSectionRow({
  onAdd,
  label,
}: {
  onAdd: (name: string, icon: string) => void;
  /** Shown above the row, e.g. inside each room container */
  label?: string;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(LOCATION_ICONS[0]);
  const [showIcons, setShowIcons] = useState(false);
  const [hoverLocPicker, hoverLocPickerHandlers] = useWebHover();
  const [hoverCreate, hoverCreateHandlers] = useWebHover();
  const [hoverSectionIconKey, setHoverSectionIconKey] = useState<string | null>(null);

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, icon);
    setName("");
    setIcon(LOCATION_ICONS[0]);
    setShowIcons(false);
  };

  return (
    <View style={styles.addSectionRow}>
      {label ? <Text style={styles.addSectionLabel}>{label}</Text> : null}
      <View style={styles.addSectionTopRow}>
        <Pressable
          onPress={() => setShowIcons((v) => !v)}
          style={({ pressed }) => [
            styles.addSectionIconBtn,
            Platform.OS === "web" && hoverLocPicker && styles.addSectionIconBtnHover,
            pressed && styles.listPressablePressed,
          ]}
          // @ts-ignore web-only pointer hover
          {...hoverLocPickerHandlers}
        >
          <View
            style={{
              transform: [{ scale: Platform.OS === "web" && hoverLocPicker ? 1.1 : 1 }],
            }}
          >
            <MaterialCommunityIcons name={icon as any} size={22} color={listBrand} />
          </View>
        </Pressable>
        <TextInput
          style={styles.addSectionInput}
          placeholder="New feature name..."
          placeholderTextColor="#bbb"
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (t.trim().length > 0 && !showIcons) setShowIcons(true);
          }}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        {name.trim().length > 0 && (
          <Pressable
            onPress={handleAdd}
            style={({ pressed }) => [
              styles.addSectionBtn,
              Platform.OS === "web" && hoverCreate && styles.addSectionBtnHover,
              pressed && styles.listPressablePressed,
            ]}
            // @ts-ignore web-only pointer hover
            {...hoverCreateHandlers}
          >
            <Text style={styles.addSectionBtnText}>Create</Text>
          </Pressable>
        )}
      </View>

      {showIcons && (
        <View style={styles.sectionIconRow}>
          {LOCATION_ICONS.map((ic) => (
            <Pressable
              key={ic}
              onPress={() => setIcon(ic)}
              style={[
                styles.iconPickerItem,
                icon === ic && styles.iconPickerItemActive,
                Platform.OS === "web" &&
                  hoverSectionIconKey === ic &&
                  !(icon === ic) &&
                  styles.chipInactiveHover,
                Platform.OS === "web" &&
                  hoverSectionIconKey === ic &&
                  icon === ic &&
                  styles.chipActiveHover,
              ]}
              // @ts-ignore web-only pointer hover
              onMouseEnter={() => Platform.OS === "web" && setHoverSectionIconKey(ic)}
              // @ts-ignore web-only pointer hover
              onMouseLeave={() =>
                Platform.OS === "web" &&
                setHoverSectionIconKey((k) => (k === ic ? null : k))
              }
            >
              <View
                style={{
                  transform: [
                    { scale: Platform.OS === "web" && hoverSectionIconKey === ic ? 1.08 : 1 },
                  ],
                }}
              >
                <MaterialCommunityIcons
                  name={ic as any}
                  size={20}
                  color={icon === ic ? "#fff" : "#666"}
                />
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function AddRoomRow({ onCreate }: { onCreate: (roomName: string) => void }) {
  const [name, setName] = useState("");
  const [hoverAdd, hoverAddHandlers] = useWebHover();
  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName("");
  };
  return (
    <View style={styles.addRoomRow}>
      <Text style={styles.addRoomLabel}>Add room</Text>
      <View style={styles.addRoomInner}>
        <TextInput
          style={styles.addRoomInput}
          placeholder="e.g. Kitchen"
          placeholderTextColor="#bbb"
          value={name}
          onChangeText={setName}
          onSubmitEditing={handleCreate}
          returnKeyType="done"
        />
        <Pressable
          onPress={handleCreate}
          style={({ pressed }) => [
            styles.addRoomBtn,
            Platform.OS === "web" && hoverAdd && styles.addRoomBtnHover,
            pressed && styles.listPressablePressed,
          ]}
          // @ts-ignore web-only
          {...hoverAddHandlers}
        >
          <Text style={styles.addRoomBtnText}>Create</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** React Native Paper dialog payload for task / batch / section delete confirmation */
type DeleteDialogState =
  | null
  | {
      mode: "task";
      featureId: number;
      taskId: number;
      taskName: string;
    }
  | { mode: "batch"; featureId: number; taskIds: number[] }
  | { mode: "section"; featureId: number; sectionName: string }
  | { mode: "room"; roomId: number; roomName: string }
  | { mode: "unassignedLabel"; currentLabel: string };

// Main list screen (connected to the database via the Flask API) 
export default function ListScreen() {
  const { isCheckingAuth, isAuthenticated } = useAuthGuard();

  if (isCheckingAuth || !isAuthenticated) {
    return <AuthLoadingScreen />;
  }

  return <AuthenticatedListScreen />;
}

function AuthenticatedListScreen() {
  // Grab the household id from the route (e.g. /household/3/list -> id = "3")
  const { id } = useLocalSearchParams<{ id: string }>();
  const householdId = Number(id) || 1; // fallback to 1 if somehow missing

  const [features, setFeatures] = useState<Feature[]>([]);
  const [rooms, setRooms] = useState<HouseholdRoom[]>([]);
  const [unassignedRoomLabel, setUnassignedRoomLabel] = useState("Unassigned");
  /** Persisted locally (no Room row for the synthetic Unassigned band). */
  const [unassignedAccent, setUnassignedAccent] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null);
  const [hoverRetry, hoverRetryHandlers] = useWebHover();

  // Fetch all features + tasks from the server and map them into our local class instances
  const loadFromApi = useCallback(() => {
    setError(null);
    Promise.all([
      fetchHouseholdFeatures(householdId),
      fetchHouseholdRooms(householdId).catch((e) => {
        console.warn("Rooms unavailable (migrate DB or update server):", e);
        return [] as HouseholdRoom[];
      }),
    ])
      .then(([data, roomsData]) => {
        setRooms(Array.isArray(roomsData) ? roomsData : []);
        const mapped = data.map((f: any) => {
          const feat = new Feature(
            f.feature_name,
            f.household_id,
            f.feature_type || "",
            f.x_pos,
            f.y_pos,
            f.z_pos,
            f.feature_id,
            f.icon || "home-outline",
            f.room_id != null ? Number(f.room_id) : null
          );
          feat.tasks = (f.tasks || []).map((t: any) => {
            const task = new Task(
              t.task_name,
              t.feature_id,
              t.frequency_days,
              t.icon || "clipboard-text-outline",
              t.visibility || "household",
              t.created_by_account_id,
              t.task_id
            );
            task.last_completed = t.last_completed ? new Date(t.last_completed) : null;
            return task;
          });
          return feat;
        });
        setFeatures(mapped);
        setLoaded(true);
      })
      .catch((e) => {
        console.error("Failed to load features:", e);
        setError("Could not load data from server.");
        setLoaded(true);
      });
  }, [householdId]);

  // Load data from the API when the component mounts (or if householdId changes)
  useEffect(() => {
    loadFromApi();
  }, [loadFromApi]);

  // Resolve display name for this household (same source as home: /household/mine)
  useEffect(() => {
    let cancelled = false;
    fetchMyHouseholds()
      .then((res) => {
        if (cancelled) return;
        const row = res.households?.find((h) => Number(h.household_id) === householdId);
        setHouseholdName(row?.household_name?.trim() || null);
      })
      .catch(() => {
        if (!cancelled) setHouseholdName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  useEffect(() => {
    setUnassignedRoomLabel("Unassigned");
    setUnassignedAccent(null);
    let cancelled = false;
    const key = `list_unassigned_band_accent_${householdId}`;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (cancelled) return;
        if (raw == null || raw === "") {
          setUnassignedAccent(null);
          return;
        }
        const n = normalizeHexColor(raw);
        setUnassignedAccent(n);
      })
      .catch(() => {
        if (!cancelled) setUnassignedAccent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Opens styled dialog to delete all selected tasks in one section
  const handleDeleteSelected = useCallback(
    (featureId: number) => {
      const feature = features.find((f) => f.id === featureId);
      if (!feature) return;
      const toDelete = Array.from(feature.tasks)
        .filter((t) => selectedIds.has(t.id))
        .map((t) => t.id);
      if (toDelete.length === 0) return;
      setDeleteDialog({ mode: "batch", featureId, taskIds: toDelete });
    },
    [selectedIds, features]
  );

  // Delete a single task (tell the server first, then remove from local state)
  const handleDeleteTask = useCallback(
    (featureId: number, taskId: number) => {
      apiDeleteTask(taskId).catch(console.error);
      setFeatures((prev) =>
        prev.map((loc) => {
          if (loc.id !== featureId) return loc;
          return {
            ...loc,
            tasks: Array.from(loc.tasks).filter((t) => t.id !== taskId),
          } as any;
        })
      );
      setSelectedIds((prev) => {
        if (!prev.has(taskId)) return prev;
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    },
    []
  );

  // Add a new task (POST to the server and wait for the task_id before adding to state)
  // We need the real DB id so deletes and completes work later
  const handleAddTask = useCallback(
    (featureId: number, name: string, icon: string, freqDays: number) => {
      const now = new Date();
      apiCreateTask({
        feature_id: featureId,
        task_name: name,
        frequency_days: freqDays,
        icon,
        visibility: "household",
        last_completed: now.toISOString(),
      })
        .then(({ task_id }) => {
          const newTask = new Task(name, featureId, freqDays, icon);
          // Use the id the database gave us so future operations reference the right row
          newTask.id = task_id;
          // Mirror the last_completed sent to the server so the health bar starts at 100%
          newTask.last_completed = now;
          setFeatures((prev) =>
            prev.map((loc) =>
              loc.id === featureId
                ? ({ ...loc, tasks: [...Array.from(loc.tasks), newTask] } as any)
                : loc
            )
          );
        })
        .catch(console.error);
    },
    []
  );

  // Rename a feature/section (update on the server and locally at the same time)
  const handleRenameFeature = useCallback(
    (featureId: number, newName: string) => {
      apiUpdateFeature(featureId, { feature_name: newName }).catch(console.error);
      setFeatures((prev) =>
        prev.map((loc) =>
          loc.id === featureId
            ? ({ ...loc, name: newName, feature_name: newName } as any)
            : loc
        )
      );
    },
    []
  );

  const handleAssignFeatureRoom = useCallback((featureId: number, roomId: number | null) => {
    apiUpdateFeature(featureId, { room_id: roomId }).catch(console.error);
    setFeatures((prev) =>
      prev.map((loc) =>
        loc.id === featureId ? ({ ...loc, room_id: roomId } as any) : loc
      )
    );
  }, []);

  // Delete a feature and all its tasks (cascade delete happens in the DB)
  const handleDeleteFeature = useCallback((featureId: number) => {
    apiDeleteFeature(featureId).catch(console.error);
    setFeatures((prev) => prev.filter((loc) => loc.id !== featureId));
  }, []);

  const openDeleteTaskDialog = useCallback((featureId: number, task: Task) => {
    setDeleteDialog({
      mode: "task",
      featureId,
      taskId: task.id,
      taskName: task.name?.trim() ? task.name.trim() : "Unnamed task",
    });
  }, []);

  const openDeleteSectionDialog = useCallback((featureId: number, sectionName: string) => {
    setDeleteDialog({
      mode: "section",
      featureId,
      sectionName,
    });
  }, []);

  const openDeleteRoomDialog = useCallback((roomId: number, roomName: string) => {
    setDeleteDialog({
      mode: "room",
      roomId,
      roomName: roomName?.trim() ? roomName.trim() : "this room",
    });
  }, []);

  const openResetUnassignedLabelDialog = useCallback(() => {
    setDeleteDialog({
      mode: "unassignedLabel",
      currentLabel: unassignedRoomLabel,
    });
  }, [unassignedRoomLabel]);

  const confirmPendingDelete = useCallback(() => {
    if (!deleteDialog) return;
    const d = deleteDialog;
    setDeleteDialog(null);
    if (d.mode === "task") {
      handleDeleteTask(d.featureId, d.taskId);
      return;
    }
    if (d.mode === "batch") {
      Promise.all(d.taskIds.map((taskId) => apiDeleteTask(taskId).catch(console.error)));
      setFeatures((prev) =>
        prev.map((loc) => {
          if (loc.id !== d.featureId) return loc;
          return {
            ...loc,
            tasks: Array.from(loc.tasks).filter((t) => !d.taskIds.includes(t.id)),
          } as any;
        })
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        d.taskIds.forEach((id) => next.delete(id));
        return next;
      });
      return;
    }
    if (d.mode === "room") {
      apiDeleteHouseholdRoom(d.roomId)
        .then(() => {
          setRooms((prev) => prev.filter((r) => r.room_id !== d.roomId));
          setFeatures((prev) =>
            prev.map((loc) =>
              loc.room_id === d.roomId ? ({ ...loc, room_id: null } as any) : loc
            )
          );
        })
        .catch(console.error);
      return;
    }
    if (d.mode === "unassignedLabel") {
      setUnassignedRoomLabel("Unassigned");
      return;
    }
    handleDeleteFeature(d.featureId);
  }, [deleteDialog, handleDeleteTask, handleDeleteFeature]);

  // Add a new section/feature (POST to the server and use the returned id)
  const handleAddFeature = useCallback(
    (name: string, icon: string, roomId: number | null) => {
      apiCreateFeature({
        household_id: householdId,
        feature_name: name,
        icon,
        room_id: roomId ?? undefined,
      })
        .then(({ feature_id }) => {
          const newLoc = new Feature(
            name,
            householdId,
            FeatureType.UNDEFINED,
            undefined,
            undefined,
            undefined,
            feature_id,
            icon,
            roomId
          );
          setFeatures((prev) => [...prev, newLoc]);
        })
        .catch(console.error);
    },
    [householdId]
  );

  // Mark a task as done (tell the server, then update last_completed locally)
  // so the health bar immediately jumps to 100% without needing a full reload
  const handleCompleteTask = useCallback((taskId: number) => {
    apiCompleteTask(taskId).catch(console.error);
    const now = new Date();
    setFeatures((prev) =>
      prev.map((loc) => ({
        ...loc,
        tasks: Array.from(loc.tasks).map((t) =>
          t.id === taskId ? { ...t, last_completed: now } : t
        ),
      } as any))
    );
  }, []);

  const deleteDialogTitle =
    deleteDialog?.mode === "task"
      ? "Delete task?"
      : deleteDialog?.mode === "batch"
        ? "Delete selected tasks?"
        : deleteDialog?.mode === "section"
          ? "Delete section?"
          : deleteDialog?.mode === "room"
            ? "Delete room?"
            : deleteDialog?.mode === "unassignedLabel"
              ? "Reset unassigned name?"
          : "";

  const deleteDialogBody =
    deleteDialog?.mode === "task"
      ? `“${deleteDialog.taskName}” will be removed. This cannot be undone.`
      : deleteDialog?.mode === "batch"
        ? `${deleteDialog.taskIds.length} selected task${
            deleteDialog.taskIds.length === 1 ? "" : "s"
          } will be permanently removed.`
        : deleteDialog?.mode === "section"
          ? `“${deleteDialog.sectionName}” and every task in this section will be removed. This cannot be undone.`
          : deleteDialog?.mode === "room"
            ? `“${deleteDialog.roomName}” will be removed. Features in that room will be moved to the Unassigned group.`
            : deleteDialog?.mode === "unassignedLabel"
              ? `This will reset “${deleteDialog.currentLabel}” back to “Unassigned”.`
          : "";

  const roomGroups = useMemo(() => {
    const byRoom = new Map<number, Feature[]>();
    for (const r of rooms) {
      byRoom.set(r.room_id, []);
    }
    const unassigned: Feature[] = [];
    for (const f of features) {
      const rid = f.room_id;
      if (rid == null || !byRoom.has(rid)) {
        unassigned.push(f);
      } else {
        byRoom.get(rid)!.push(f);
      }
    }
    const out: Array<{
      key: string;
      roomId: number | null;
      displayName: string;
      accent: string | null;
      isUnassigned: boolean;
      features: Feature[];
    }> = [];
    for (const r of rooms) {
      out.push({
        key: `room-${r.room_id}`,
        roomId: r.room_id,
        displayName: r.room_name,
        accent: r.accent_color,
        isUnassigned: false,
        features: byRoom.get(r.room_id) ?? [],
      });
    }
    if (unassigned.length > 0) {
      out.push({
        key: "unassigned",
        roomId: null,
        displayName: unassignedRoomLabel,
        accent: null,
        isUnassigned: true,
        features: unassigned,
      });
    }
    return out;
  }, [rooms, features, unassignedRoomLabel]);

  const listBody = !loaded ? (
    <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
      <Text style={styles.subtitle}>Loading...</Text>
    </View>
  ) : error ? (
    <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
      <Text style={[styles.subtitle, { color: "#f44336" }]}>{error}</Text>
      <Pressable
        onPress={loadFromApi}
        style={({ pressed }) => [
          styles.retryBtn,
          Platform.OS === "web" && hoverRetry && styles.retryBtnHover,
          pressed && styles.listPressablePressed,
        ]}
        // @ts-ignore web-only pointer hover
        {...hoverRetryHandlers}
      >
        <Text
          style={[
            styles.retryBtnText,
            Platform.OS === "web" && hoverRetry && styles.retryBtnTextHover,
          ]}
        >
          Retry
        </Text>
      </Pressable>
    </View>
  ) : (
    <View style={styles.root}>
      <View style={styles.titleBar}>
        <Text style={styles.title} numberOfLines={2}>
          {householdName || "Household"}
        </Text>
        <Text style={styles.subtitle}>
          {features.length} section{features.length !== 1 ? "s" : ""} ·{" "}
          {features.reduce((n, l) => n + Array.from(l.tasks).length, 0)} tasks
        </Text>
      </View>

      <AddRoomRow
        onCreate={(roomName) => {
          apiCreateHouseholdRoom({ household_id: householdId, room_name: roomName })
            .then(({ room_id }) => {
              const trimmed = roomName.trim();
              setRooms((prev) => [
                ...prev,
                {
                  room_id,
                  household_id: householdId,
                  room_name: trimmed,
                  accent_color: null,
                },
              ]);
            })
            .catch(console.error);
        }}
      />

      <ScrollView
        style={[styles.scroll, styles.webScroll]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
        persistentScrollbar
      >
        {roomGroups.map((g) => (
          <RoomContainer
            key={g.key}
            room={{
              id: g.key,
              name: g.displayName,
              accentColor: g.isUnassigned ? unassignedAccent : g.accent,
            }}
            featureCount={g.features.length}
            onRenameRoom={
              g.roomId == null
                ? (nextName) => {
                    setUnassignedRoomLabel(nextName);
                  }
                : (nextName) => {
                    const roomId = g.roomId!;
                    apiUpdateHouseholdRoom(roomId, { room_name: nextName })
                      .then(() => {
                        setRooms((prev) =>
                          prev.map((r) =>
                            r.room_id === roomId ? { ...r, room_name: nextName } : r
                          )
                        );
                      })
                      .catch(console.error);
                  }
            }
            onCommitAccent={(hex) => {
              if (g.roomId == null) {
                const key = `list_unassigned_band_accent_${householdId}`;
                setUnassignedAccent(hex);
                if (hex == null) {
                  AsyncStorage.removeItem(key).catch(console.error);
                } else {
                  AsyncStorage.setItem(key, hex).catch(console.error);
                }
                return;
              }
              const roomId = g.roomId;
              apiUpdateHouseholdRoom(roomId, { accent_color: hex })
                .then(() => {
                  setRooms((prev) =>
                    prev.map((r) =>
                      r.room_id === roomId ? { ...r, accent_color: hex } : r
                    )
                  );
                })
                .catch(console.error);
            }}
            onDeleteRoom={
              g.roomId == null
                ? openResetUnassignedLabelDialog
                : () => {
                    openDeleteRoomDialog(g.roomId!, g.displayName);
                  }
            }
          >
            {g.features.map((loc) => (
              <FeatureGroup
                key={loc.id}
                feature={loc}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onDeleteSelected={handleDeleteSelected}
                onRequestDeleteTask={openDeleteTaskDialog}
                onAddTask={handleAddTask}
                onRenameFeature={handleRenameFeature}
                onRequestDeleteSection={openDeleteSectionDialog}
                onCompleteTask={handleCompleteTask}
                rooms={rooms}
                onAssignFeatureRoom={handleAssignFeatureRoom}
              />
            ))}
            <AddSectionRow
              label="Add new feature"
              onAdd={(name, icon) => handleAddFeature(name, icon, g.roomId)}
            />
          </RoomContainer>
        ))}

        {roomGroups.length === 0 && (
          <AddSectionRow
            label="Add new feature"
            onAdd={(name, icon) => handleAddFeature(name, icon, null)}
          />
        )}
      </ScrollView>
    </View>
  );

  return (
    <PaperProvider theme={appPaperLightTheme}>
      {listBody}
      <Portal>
        <Dialog
          visible={deleteDialog != null}
          onDismiss={() => setDeleteDialog(null)}
          style={styles.deleteDialogWrap}
        >
          <Dialog.Title style={styles.deleteDialogTitle}>{deleteDialogTitle}</Dialog.Title>
          <Dialog.Content>
            <PaperText variant="bodyMedium" style={styles.deleteDialogBody}>
              {deleteDialogBody}
            </PaperText>
          </Dialog.Content>
          <Dialog.Actions style={styles.deleteDialogActions}>
            <Button mode="text" onPress={() => setDeleteDialog(null)}>
              Cancel
            </Button>
            <Button
              mode="contained"
              buttonColor="#c62828"
              textColor="#fff"
              onPress={confirmPendingDelete}
            >
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </PaperProvider>
  );
}

/** Page wash behind bold navy room bands */
const LIST_PAGE_BAND_BG = "#e8eef5";

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: LIST_PAGE_BAND_BG,
        minWidth: 0,
        width: "100%",
        maxWidth: "100%",
    },
    scroll: {
        flex: 1,
        minWidth: 0,
        maxWidth: "100%",
    },
    webScroll: Platform.select({
        web: {
            overflowY: "scroll",
            scrollbarGutter: "stable",
            width: "100%",
            maxWidth: "100%",
        } as any,
        default: {},
    }),
    scrollContent: {
        padding: 16,
        paddingBottom: 48,
        maxWidth: "100%",
    },
    titleBar: {
        paddingLeft: 20,
        paddingRight: 22,
        paddingTop: 16,
        paddingBottom: 12,
    },
    title: {
        fontSize: 22,
        fontWeight: "700",
        color: textPrimary,
    },
    subtitle: {
        fontSize: 13,
        color: "#5A6B7E",
        marginTop: 2,
    },
    deleteDialogWrap: {
        borderRadius: 16,
        maxWidth: 400,
        width: "92%",
        alignSelf: "center",
        transform: [{ translateY: -100 }],
    },
    deleteDialogTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: textPrimary,
    },
    deleteDialogBody: {
        color: textPrimary,
        lineHeight: 22,
        paddingTop: 4,
    },
    deleteDialogActions: {
        flexDirection: "row",
        justifyContent: "flex-end",
        flexWrap: "wrap",
        gap: 8,
        paddingHorizontal: 8,
        paddingBottom: 8,
    },
    retryBtn: {
        marginTop: 12,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 8,
    },
    retryBtnHover: {
        backgroundColor: listSelection,
    },
    retryBtnText: {
        color: listBrand,
        fontWeight: "600",
        fontSize: 15,
    },
    retryBtnTextHover: {
        textDecorationLine: "underline",
    },
    listPressablePressed: {
        opacity: 0.88,
    },
    /** Web: shared faint darken when hovering a single row (section header, task row, add-task row) */
    listRowHoverDarken: {
        backgroundColor: "rgba(22, 30, 42, 0.055)",
    },
    chipInactiveHover: {
        borderColor: listBrand,
        backgroundColor: listSelection,
    },
    chipActiveHover: {
        borderColor: "#B8D4F5",
        shadowColor: listBrand,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 2,
    },
    addTaskCancelBtnHover: {
        backgroundColor: "#EBEEF2",
        borderRadius: 8,
    },
    addTaskSubmitBtnHover: {
        backgroundColor: "#2568D4",
    },
    batchDeleteBtnHover: {
        backgroundColor: "#fcd4d0",
    },
    headerActionBtnHover: {
        backgroundColor: listSelection,
        borderRadius: 8,
    },
    addSectionIconBtn: {
        padding: 4,
        borderRadius: 8,
    },
    addSectionIconBtnHover: {
        backgroundColor: listSelection,
    },
    addSectionBtnHover: {
        backgroundColor: "#2568D4",
    },
    addRoomRow: {
        paddingHorizontal: 16,
        paddingBottom: 10,
        maxWidth: "100%",
    },
    addRoomLabel: {
        fontSize: 12,
        fontWeight: "500",
        color: textSecondary,
        marginBottom: 6,
    },
    addRoomInner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minWidth: 0,
    },
    addRoomInput: {
        flex: 1,
        minWidth: 0,
        borderWidth: 1,
        borderColor: listBorder,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        color: textPrimary,
        backgroundColor: "#fff",
    },
    addRoomBtn: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: listBrand,
    },
    addRoomBtnHover: {
        backgroundColor: "#2568D4",
    },
    addRoomBtnText: {
        color: "#fff",
        fontWeight: "600",
        fontSize: 14,
    },
    roomAssignRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 14,
        gap: 8,
        backgroundColor: listSelection,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: listBorder,
    },
    roomAssignText: {
        flex: 1,
        fontSize: 14,
        fontWeight: "400",
        color: textPrimary,
        minWidth: 0,
    },
    roomAssignAction: {
        fontSize: 13,
        fontWeight: "500",
        color: listBrand,
    },
    roomModalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(45, 74, 122, 0.22)",
        justifyContent: "flex-start",
        alignItems: "center",
    },
    roomModalCard: {
        width: "88%",
        maxWidth: 380,
        backgroundColor: "#fff",
        borderRadius: 14,
        paddingVertical: 0,
        paddingHorizontal: 0,
        zIndex: 2,
        elevation: 6,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(45, 74, 122, 0.18)",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        overflow: "hidden",
    },
    roomModalTitle: {
        fontSize: 15,
        fontWeight: "600",
        color: textPrimary,
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "rgba(45, 74, 122, 0.12)",
        backgroundColor: "#fafcfe",
    },
    roomModalOptionList: {
        paddingVertical: 4,
    },
    roomModalOption: {
        paddingVertical: 13,
        paddingHorizontal: 16,
        marginHorizontal: 6,
        marginVertical: 2,
        borderRadius: 8,
    },
    roomModalOptionTopRule: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: "rgba(45, 74, 122, 0.1)",
        marginTop: 2,
        paddingTop: 14,
    },
    roomModalOptionHover: {
        backgroundColor: "rgba(45, 116, 200, 0.09)",
    },
    roomModalOptionPressed: {
        backgroundColor: "rgba(45, 116, 200, 0.14)",
    },
    roomModalOptionWeb: {
        cursor: "pointer" as const,
    },
    roomModalOptionText: {
        fontSize: 15,
        color: textPrimary,
        fontWeight: "400",
    },
    featureGroup: {
        backgroundColor: "#fff",
        borderRadius: 14,
        marginBottom: 0,
        maxWidth: "100%",
        overflow: "hidden",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: listBorder,
        elevation: 1,
        shadowColor: "#2d4a7a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
    },
    featureHeader: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: "#F7FAFE",
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: listBorder,
        minWidth: 0,
    },
    featureTitleWrap: {
        flex: 1,
        minWidth: 0,
    },
    featureTitlePressable: {
        flex: 1,
        minWidth: 0,
    },
    featureName: {
        fontSize: 16,
        fontWeight: "600",
        color: textPrimary,
        marginLeft: 10,
        flexShrink: 1,
    },
    featureNameInput: {
        flex: 1,
        minWidth: 0,
        fontSize: 16,
        fontWeight: "600",
        color: textPrimary,
        marginLeft: 10,
        borderBottomWidth: 2,
        borderBottomColor: listBrand,
        paddingVertical: 2,
        paddingHorizontal: 4,
    },
    taskCount: {
        fontSize: 12,
        fontWeight: "600",
        color: "#6B7C8F",
        backgroundColor: listSurfaceSoft,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginLeft: 6,
        overflow: "hidden",
    },
    headerActions: {
        flexDirection: "row",
        marginLeft: 6,
    },
    headerActionBtn: {
        padding: 4,
        marginLeft: 2,
    },
    batchDeleteBtn: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: "#fdecea",
        marginLeft: 8,
    },
    batchDeleteText: {
        color: "#f44336",
        fontSize: 12,
        fontWeight: "700",
        marginLeft: 2,
    },
    taskListContainer: {
        paddingHorizontal: 4,
    },
    taskRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 4,
        marginHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#f0f0f0",
        minWidth: 0,
    },
    taskRowSelected: {
        backgroundColor: listSelection,
    },
    taskRowControlHover: {
        backgroundColor: listSelection,
        borderRadius: 8,
    },
    taskRowControlPressed: {
        opacity: 0.88,
    },
    checkbox: {
        marginRight: 6,
    },
    taskIconWrap: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: listSurfaceSoft,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 10,
    },
    taskInfo: {
        flex: 1,
        minWidth: 0,
    },
    taskName: {
        fontSize: 14,
        fontWeight: "500",
        color: "#333",
        marginBottom: 4,
    },
    taskDueText: {
        fontSize: 12,
        fontWeight: "300",
        color: "#333",
        marginBottom: 4,
        flexShrink: 1,
    },
    completeBtn: {
        padding: 6,
        marginLeft: 4,
    },
    taskDeleteBtn: {
        padding: 6,
        marginLeft: 4,
    },
    healthBarRow: {
        flexDirection: "row",
        alignItems: "center",
        minWidth: 0,
    },
    healthBarOuter: {
        flex: 1,
        minWidth: 0,
        height: 5,
        borderRadius: 3,
        backgroundColor: "#E2EAF2",
        overflow: "hidden",
    },
    healthBarInner: {
        height: "100%",
        borderRadius: 3,
    },
    healthBarLabel: {
        fontSize: 10,
        fontWeight: "700",
        marginLeft: 6,
        width: 32,
        textAlign: "right",
    },
    emptyState: {
        alignItems: "center",
        paddingVertical: 20,
    },
    emptyStateText: {
        fontSize: 13,
        color: "#ccc",
        marginTop: 4,
    },
    addTaskRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "#f0f0f0",
    },
    addTaskPlaceholder: {
      fontSize: 14,
      color: "#bbb",
    },
    addTaskCard: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: listBorder,
      backgroundColor: "#FAFCFE",
    },
    addTaskLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: "#6A7A8C",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginTop: 8,
      marginBottom: 4,
    },
    addTaskNameInput: {
      fontSize: 14,
      color: "#333",
      backgroundColor: "#fff",
      borderWidth: 1,
      borderColor: listBorder,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginBottom: 4,
    },
    presetScroll: {
      marginBottom: 4,
    },
    presetScrollContent: {
      gap: 6,
    },
    presetChip: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: listSurfaceSoft,
      borderWidth: 1,
      borderColor: listBorder,
    },
    presetChipActive: {
      backgroundColor: listBrand,
      borderColor: listBrand,
    },
    presetChipText: {
      fontSize: 12,
      fontWeight: "500",
      color: listBrand,
    },
    presetChipTextActive: {
      color: "#fff",
    },
    iconPickerRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 4,
    },
    iconPickerItem: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: listSurfaceSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    iconPickerItemActive: {
      backgroundColor: listBrand,
    },
    freqRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 8,
    },
    freqPill: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: "#EFF4FA",
      borderWidth: 1,
      borderColor: listBorder,
    },
    freqPillActive: {
      backgroundColor: listBrand,
      borderColor: listBrand,
    },
    freqPillText: {
      fontSize: 12,
      fontWeight: "500",
      color: "#666",
    },
    freqPillTextActive: {
      color: "#fff",
    },
    customFreqRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
    },
    customFreqLabel: {
      fontSize: 13,
      color: "#666",
    },
    customFreqInput: {
      width: 70,
      fontSize: 14,
      color: "#333",
      backgroundColor: "#fff",
      borderWidth: 1,
      borderColor: "#e8e8e8",
      borderRadius: 8,
      paddingVertical: 5,
      paddingHorizontal: 8,
      textAlign: "center",
    },
    addTaskActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 4,
    },
    addTaskCancelBtn: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 8,
    },
    addTaskCancelText: {
      fontSize: 13,
      fontWeight: "600",
      color: "#999",
    },
    addTaskSubmitBtn: {
      backgroundColor: listBrand,
      paddingHorizontal: 18,
      paddingVertical: 7,
      borderRadius: 8,
    },
    addTaskSubmitBtnDisabled: {
      opacity: 0.4,
    },
    addTaskSubmitText: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "700",
    },
    addSectionRow: {
      backgroundColor: "#fff",
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 14,
      marginBottom: 14,
      borderWidth: 1.5,
      borderColor: listBorder,
      borderStyle: "dashed",
    },
    addSectionLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: textSecondary,
      marginBottom: 8,
    },
    addSectionTopRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    addSectionInput: {
      flex: 1,
      fontSize: 15,
      color: "#333",
      marginLeft: 10,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    addSectionBtn: {
      backgroundColor: listBrand,
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 8,
      marginLeft: 8,
    },
    addSectionBtnText: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "700",
    },
    sectionIconRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 10,
    },
});
