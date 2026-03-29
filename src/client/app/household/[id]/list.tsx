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
             read household id from route params
Preconditions: Flask server running on localhost:8000 with the household's data in the DB
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

// Import react hooks we need for state, lifecycle, and performance
import React, { useCallback, useEffect, useRef, useState } from "react";
// Import RN components for building the UI
import {
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
// Material design icons
import { MaterialCommunityIcons } from "@expo/vector-icons";
// Need this to grab the household id from the URL (e.g. /household/3/list)
import { useLocalSearchParams } from "expo-router";

// Import server classes
import Task from "../../../data/task";
import Feature from "../../../data/feature";

// Import data helpers, types, presets, and storage utilities
import {
  FREQUENCY_PRESETS,
  LOCATION_ICONS,
  TASK_ICONS,
  TASK_PRESETS,
  healthPercent,
  healthColor,
} from "../../../data/householdUtils";

// API functions for talking to the Flask backend
// Aliased with "api" prefix so they don't clash with handler names in this file
import {
  fetchHouseholdFeatures,
  createFeature as apiCreateFeature,
  updateFeature as apiUpdateFeature,
  deleteFeature as apiDeleteFeature,
  createTask as apiCreateTask,
  deleteTask as apiDeleteTask,
  completeTask as apiCompleteTask,
} from "../../../data/api";

const ACCENT = "#4169E1";
const BG = "#f0f2f5";

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
    onDeleteTask,
    onCompleteTask,
}: {
    task: Task;
    isSelected: boolean;
    onToggleSelect: (id: number) => void;
    onDeleteTask: (id: number) => void;
    onCompleteTask: (id: number) => void;
}) {
  return (
    <View style={[styles.taskRow, isSelected && styles.taskRowSelected]}>
      <Pressable
        onPress={() => onToggleSelect(task.id)}
        hitSlop={8}
        style={styles.checkbox}
      >
        <MaterialCommunityIcons
          name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"}
          size={22}
          color={isSelected ? ACCENT : "#ccc"}
        />
      </Pressable>

      <View style={styles.taskIconWrap}>
        <MaterialCommunityIcons
          name={task.icon as any}
          size={20}
          color={ACCENT}
        />
      </View>

      <View style={styles.taskInfo}>
        <Text style={styles.taskName} numberOfLines={1}>
          {task.name}
        </Text>
        {/* Tapping the health bar also marks the task complete */}
        <Pressable onPress={() => onCompleteTask(task.id)}>
          <HealthBar task={task} />
        </Pressable>
      </View>

      {/* Green check button to mark task as done (resets the health bar to 100%) */}
      <Pressable
        onPress={() => onCompleteTask(task.id)}
        hitSlop={8}
        style={styles.completeBtn}
      >
        <MaterialCommunityIcons
          name="check-circle-outline"
          size={20}
          color="#4caf50"
        />
      </Pressable>

      <Pressable
        onPress={() => onDeleteTask(task.id)}
        hitSlop={8}
        style={styles.taskDeleteBtn}
      >
        <MaterialCommunityIcons
          name="close-circle-outline"
          size={20}
          color="#ccc"
        />
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

  if (!expanded) {
    return (
      <Pressable style={styles.addTaskRow} onPress={() => setExpanded(true)}>
        <MaterialCommunityIcons
          name="plus"
          size={18}
          color={ACCENT}
          style={{ marginRight: 8 }}
        />
        <Text style={styles.addTaskPlaceholder}>Add a task...</Text>
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
            ]}
            onPress={() => applyPreset(p)}
          >
            <MaterialCommunityIcons
              name={p.icon as any}
              size={14}
              color={name === p.name ? "#fff" : ACCENT}
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
            ]}
          >
            <MaterialCommunityIcons
              name={ic as any}
              size={20}
              color={icon === ic ? "#fff" : "#666"}
            />
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
            ]}
          >
            <Text
              style={[
                styles.freqPillText,
                !customFreq && freqDays === fp.days && styles.freqPillTextActive,
              ]}
            >
              {fp.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => setCustomFreq(true)}
          style={[styles.freqPill, customFreq && styles.freqPillActive]}
        >
          <Text
            style={[styles.freqPillText, customFreq && styles.freqPillTextActive]}
          >
            Custom
          </Text>
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
        <Pressable onPress={resetForm} style={styles.addTaskCancelBtn}>
          <Text style={styles.addTaskCancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          style={[
            styles.addTaskSubmitBtn,
            !name.trim() && styles.addTaskSubmitBtnDisabled,
          ]}
        >
          <Text style={styles.addTaskSubmitText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

// A collapsible group of tasks under one feature/room
// onCompleteTask is passed down to each TaskRow so tapping the check button works
function FeatureGroup({
  feature,
  selectedIds,
  onToggleSelect,
  onDeleteSelected,
  onDeleteTask,
  onAddTask,
  onRenameFeature,
  onDeleteFeature,
  onCompleteTask,
}: {
  feature: Feature;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onDeleteSelected: (featureId: number) => void;
  onDeleteTask: (featureId: number, taskId: number) => void;
  onAddTask: (featureId: number, name: string, icon: string, freqDays: number) => void;
  onRenameFeature: (featureId: number, newName: string) => void;
  onDeleteFeature: (featureId: number) => void;
  onCompleteTask: (taskId: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(feature.name);
  const [collapsed, setCollapsed] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const hasSelection = Array.from(feature.tasks).some((t) => selectedIds.has(t.id));
  const selectedCount = Array.from(feature.tasks).filter((t) => selectedIds.has(t.id)).length;

  const handleSaveRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== feature.name) {
      onRenameFeature(feature.id, trimmed);
    } else {
      setEditName(feature.name);
    }
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    setEditName(feature.name);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const confirmDeleteFeature = () => {
    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${feature.name}" and all its tasks?`)) {
        onDeleteFeature(feature.id);
      }
    } else {
      Alert.alert(
        "Delete Section",
        `Delete "${feature.name}" and all its tasks?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => onDeleteFeature(feature.id),
          },
        ]
      );
    }
  };

  return (
    <View style={styles.featureGroup}>
      <Pressable
        style={styles.featureHeader}
        onPress={() => setCollapsed((c) => !c)}
      >
        <MaterialCommunityIcons
          name={feature.icon as any}
          size={24}
          color={ACCENT}
        />

        {isEditing ? (
          <TextInput
            ref={inputRef}
            style={styles.featureNameInput}
            value={editName}
            onChangeText={setEditName}
            onBlur={handleSaveRename}
            onSubmitEditing={handleSaveRename}
            returnKeyType="done"
            selectTextOnFocus
          />
        ) : (
          <Pressable onLongPress={handleStartEdit} style={{ flex: 1 }}>
            <Text style={styles.featureName}>{feature.name}</Text>
          </Pressable>
        )}

        <Text style={styles.taskCount}>{Array.from(feature.tasks).length}</Text>

        {hasSelection && (
          <Pressable
            onPress={() => onDeleteSelected(feature.id)}
            style={styles.batchDeleteBtn}
          >
            <MaterialCommunityIcons name="delete-outline" size={18} color="#f44336" />
            <Text style={styles.batchDeleteText}>{selectedCount}</Text>
          </Pressable>
        )}

        {!isEditing && (
          <View style={styles.headerActions}>
            <Pressable onPress={handleStartEdit} hitSlop={6} style={styles.headerActionBtn}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#999" />
            </Pressable>
            <Pressable onPress={confirmDeleteFeature} hitSlop={6} style={styles.headerActionBtn}>
              <MaterialCommunityIcons name="trash-can-outline" size={18} color="#999" />
            </Pressable>
          </View>
        )}

        <MaterialCommunityIcons
          name={collapsed ? "chevron-down" : "chevron-up"}
          size={22}
          color="#999"
          style={{ marginLeft: 4 }}
        />
      </Pressable>

      {!collapsed && (
        <>
          {Array.from(feature.tasks).length === 0 ? (
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
                  onDeleteTask={(taskId) => onDeleteTask(feature.id, taskId)}
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

// row at the bottom for creating a new section, with an icon picker
function AddSectionRow({
  onAdd,
}: {
  onAdd: (name: string, icon: string) => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(LOCATION_ICONS[0]);
  const [showIcons, setShowIcons] = useState(false);

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
      <View style={styles.addSectionTopRow}>
        <Pressable onPress={() => setShowIcons((v) => !v)}>
          <MaterialCommunityIcons name={icon as any} size={22} color={ACCENT} />
        </Pressable>
        <TextInput
          style={styles.addSectionInput}
          placeholder="New section name..."
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
          <Pressable onPress={handleAdd} style={styles.addSectionBtn}>
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
              ]}
            >
              <MaterialCommunityIcons
                name={ic as any}
                size={20}
                color={icon === ic ? "#fff" : "#666"}
              />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// Main list screen (connected to the database via the Flask API) 
export default function ListScreen() {
  // Grab the household id from the route (e.g. /household/3/list -> id = "3")
  const { id } = useLocalSearchParams<{ id: string }>();
  const householdId = Number(id) || 1; // fallback to 1 if somehow missing

  const [features, setFeatures] = useState<Feature[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Fetch all features + tasks from the server and map them into our local class instances
  const loadFromApi = useCallback(() => {
    setError(null);
    fetchHouseholdFeatures(householdId)
      .then((data: any[]) => {
        // Convert the raw JSON objects into Feature/Task class instances
        // so the health bar math and other methods still work
        const mapped = data.map((f: any) => {
          const feat = new Feature(
            f.feature_name,
            f.household_id,
            f.feature_type || "",
            f.x_pos, f.y_pos, f.z_pos,
            f.feature_id,
            f.icon || "home-outline"
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
            // Parse the ISO date string back into a Date object for health calculations
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

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Delete all selected tasks at once (fires off delete requests in parallel)
  const handleDeleteSelected = useCallback(
    (featureId: number) => {
      const toDelete = Array.from(selectedIds);
      Promise.all(toDelete.map((taskId) => apiDeleteTask(taskId).catch(console.error)));
      setFeatures((prev) =>
        prev.map((loc) => {
          if (loc.id !== featureId) return loc;
          return {
            ...loc,
            tasks: Array.from(loc.tasks).filter((t) => !selectedIds.has(t.id)),
          } as any;
        })
      );
      setSelectedIds(new Set());
    },
    [selectedIds]
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
      apiCreateTask({
        feature_id: featureId,
        task_name: name,
        frequency_days: freqDays,
        icon,
        visibility: "household",
      })
        .then(({ task_id }) => {
          const newTask = new Task(name, featureId, freqDays, icon);
          // Use the id the database gave us so future operations reference the right row
          newTask.id = task_id;
          // Set last_completed to now so the health bar starts at 100%
          newTask.last_completed = new Date();
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

  // Delete a feature and all its tasks (cascade delete happens in the DB)
  const handleDeleteFeature = useCallback((featureId: number) => {
    apiDeleteFeature(featureId).catch(console.error);
    setFeatures((prev) => prev.filter((loc) => loc.id !== featureId));
  }, []);

  // Add a new section/feature (POST to the server and use the returned id)
  const handleAddFeature = useCallback(
    (name: string, icon: string) => {
      apiCreateFeature({
        household_id: householdId,
        feature_name: name,
        icon,
      })
        .then(({ feature_id }) => {
          const newLoc = new Feature(name, householdId, "", 0, 0, 0, feature_id, icon);
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

  if (!loaded) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.subtitle}>Loading...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={[styles.subtitle, { color: "#f44336" }]}>{error}</Text>
        <Pressable onPress={loadFromApi} style={{ marginTop: 12 }}>
          <Text style={{ color: ACCENT, fontWeight: "600" }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.titleBar}>
        <Text style={styles.title}>Household</Text>
        <Text style={styles.subtitle}>
          {features.length} section{features.length !== 1 ? "s" : ""} ·{" "}
          {features.reduce((n, l) => n + Array.from(l.tasks).length, 0)} tasks
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {features.map((loc) => (
          <FeatureGroup
            key={loc.id}
            feature={loc}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onDeleteSelected={handleDeleteSelected}
            onDeleteTask={handleDeleteTask}
            onAddTask={handleAddTask}
            onRenameFeature={handleRenameFeature}
            onDeleteFeature={handleDeleteFeature}
            onCompleteTask={handleCompleteTask}
          />
        ))}

        <AddSectionRow onAdd={handleAddFeature} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: BG,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 48,
    },
    titleBar: {
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 10,
    },
    title: {
        fontSize: 22,
        fontWeight: "700",
        color: "#1a1a2e",
    },
    subtitle: {
        fontSize: 13,
        color: "#888",
        marginTop: 2,
    },
    featureGroup: {
        backgroundColor: "#fff",
        borderRadius: 14,
        marginBottom: 14,
        overflow: "hidden",
        elevation: 1,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
    },
    featureHeader: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: "#fafbfd",
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#e8e8e8",
    },
    featureName: {
        fontSize: 16,
        fontWeight: "600",
        color: "#1a1a2e",
        marginLeft: 10,
    },
    featureNameInput: {
        flex: 1,
        fontSize: 16,
        fontWeight: "600",
        color: "#1a1a2e",
        marginLeft: 10,
        borderBottomWidth: 2,
        borderBottomColor: ACCENT,
        paddingVertical: 2,
        paddingHorizontal: 4,
    },
    taskCount: {
        fontSize: 12,
        fontWeight: "600",
        color: "#bbb",
        backgroundColor: "#f0f0f0",
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
    },
    taskRowSelected: {
        backgroundColor: "#f3f0ff",
    },
    checkbox: {
        marginRight: 6,
    },
    taskIconWrap: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: "#eef0ff",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 10,
    },
    taskInfo: {
        flex: 1,
    },
    taskName: {
        fontSize: 14,
        fontWeight: "500",
        color: "#333",
        marginBottom: 4,
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
    },
    healthBarOuter: {
        flex: 1,
        height: 5,
        borderRadius: 3,
        backgroundColor: "#ececec",
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
      borderTopColor: "#eee",
      backgroundColor: "#fbfbfd",
    },
    addTaskLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: "#999",
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
      borderColor: "#e8e8e8",
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
      backgroundColor: "#eef0ff",
      borderWidth: 1,
      borderColor: "#dde0f0",
    },
    presetChipActive: {
      backgroundColor: ACCENT,
      borderColor: ACCENT,
    },
    presetChipText: {
      fontSize: 12,
      fontWeight: "500",
      color: ACCENT,
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
      backgroundColor: "#f0f0f0",
      alignItems: "center",
      justifyContent: "center",
    },
    iconPickerItemActive: {
      backgroundColor: ACCENT,
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
      backgroundColor: "#f0f0f0",
      borderWidth: 1,
      borderColor: "#e0e0e0",
    },
    freqPillActive: {
      backgroundColor: ACCENT,
      borderColor: ACCENT,
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
      backgroundColor: ACCENT,
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
      borderColor: "#e0e4f0",
      borderStyle: "dashed",
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
      backgroundColor: ACCENT,
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