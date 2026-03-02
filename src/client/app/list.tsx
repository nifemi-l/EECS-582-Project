/* PROLOGUE
File name: list.tsx
Description: A list view for managing household tasks grouped by location/room.
             Supports local persistence via AsyncStorage, task presets, icon pickers,
             and frequency selection when adding tasks or sections.
Programmer: Nifemi Lawal
Creation date: 2/6/26
Revision date:
  - 2/11/26: Fix padding for the new section name input area
  - 3/1/26: Add AsyncStorage persistence (load on mount, save on change),
             expanded add-task card with icon picker / frequency pills / presets,
             location icon picker for new sections; restore TaskRow comments
Preconditions: household.ts must export storage helpers and preset constants
Postconditions: Renders an interactive, persisted task list organized by location
Errors: None. Will always render successfully; storage failures are logged silently
Side effects: Reads/writes AsyncStorage on mount and on every mutation
Invariants: None
Known faults: None
*/

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

// Import data helpers, types, presets, and storage utilities
import {
  FREQUENCY_PRESETS,
  LOCATION_ICONS,
  MOCK_HOUSEHOLD,
  TASK_ICONS,
  TASK_PRESETS,
  Task,
  TaskLocation,
  healthColor,
  healthPercent,
  loadLocations,
  saveLocations,
} from "./data/household";

// Counter for generating unique IDs
let nextId = 100;
// Simple ID generator that increments and returns a prefixed string
function generateId(prefix = "t") {
  nextId += 1; // bump the counter
  return `${prefix}-gen-${nextId}`; // return something like "t-gen-101"
}

// Health bar component that shows how "healthy" a task is as a colored bar
function HealthBar({ task }: { task: Task }) {
  const pct = healthPercent(task); // get the health as a 0-1 decimal
  const color = healthColor(pct); // pick a color based on the percentage
  const label = `${Math.round(pct * 100)}%`; // format as a readable percentage
  return (
    // Row that holds the bar and the label side by side
    <View style={styles.healthBarRow}>
      {/* Outer track of the bar */}
      <View style={styles.healthBarOuter}>
        {/* Inner fill, width and color depend on health */}
        <View
          style={[
            styles.healthBarInner,
            { width: `${Math.round(pct * 100)}%`, backgroundColor: color },
          ]}
        />
      </View>
      {/* Percentage text next to the bar */}
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
}: {
  task: Task; // the task data
  isSelected: boolean; // whether this task is currently selected
  onToggleSelect: (id: string) => void; // callback to toggle selection
  onDeleteTask: (id: string) => void; // callback to delete this task
}) {
  return (
    // Outer row container, highlighted if selected
    <View style={[styles.taskRow, isSelected && styles.taskRowSelected]}>
        {/* Checkbox to select/deselect the task */}
      <Pressable
        onPress={() => onToggleSelect(task.id)}
        hitSlop={8}
        style={styles.checkbox}
      >
        {/* Filled or empty checkbox icon depending on selection */}
        <MaterialCommunityIcons
          name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"}
          size={22}
          color={isSelected ? "#4169E1" : "#ccc"}
        />
      </Pressable>

      {/* Icon container for the task type */}
      <View style={styles.taskIconWrap}>
        {/* The actual task icon */}
        <MaterialCommunityIcons
          name={task.icon as any}
          size={20}
          color="#4169E1"
        />
      </View>

      {/* Task name and health bar */}
      <View style={styles.taskInfo}>
        {/* Task name, truncated to one line */}
        <Text style={styles.taskName} numberOfLines={1}>
          {task.name}
        </Text>
        {/* Health bar showing task status */}
        <HealthBar task={task} />
      </View>

      {/* Delete button for this individual task */}
      <Pressable
        onPress={() => onDeleteTask(task.id)}
        hitSlop={8}
        style={styles.taskDeleteBtn}
      >
        {/* X circle icon for delete */}
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
  onAdd: (name: string, icon: string, frequencyHours: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(TASK_ICONS[0]);
  const [freqHours, setFreqHours] = useState(FREQUENCY_PRESETS[0].hours);
  const [customFreq, setCustomFreq] = useState(false);
  const [customFreqText, setCustomFreqText] = useState("");

  // clears everything and collapses the card
  const resetForm = () => {
    setName("");
    setIcon(TASK_ICONS[0]);
    setFreqHours(FREQUENCY_PRESETS[0].hours);
    setCustomFreq(false);
    setCustomFreqText("");
    setExpanded(false);
  };

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, icon, freqHours);
    resetForm();
  };

  // fills in the form from a preset template
  const applyPreset = (preset: (typeof TASK_PRESETS)[number]) => {
    setName(preset.name);
    setIcon(preset.icon);
    setFreqHours(preset.frequencyHours);
    setCustomFreq(false);
    setCustomFreqText("");
  };

  // collapsed: just show a clickable "Add a task..." row
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

  // expanded: full form
  return (
    <View style={styles.addTaskCard}>
      {/* quick presets */}
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

      {/* task name input */}
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

      {/* icon picker grid */}
      <Text style={styles.addTaskLabel}>Icon</Text>
      <View style={styles.iconPickerRow}>
        {TASK_ICONS.map((ic) => (
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

      {/* frequency pills */}
      <Text style={styles.addTaskLabel}>Frequency</Text>
      <View style={styles.freqRow}>
        {FREQUENCY_PRESETS.map((fp) => (
          <Pressable
            key={fp.hours}
            onPress={() => {
              setFreqHours(fp.hours);
              setCustomFreq(false);
              setCustomFreqText("");
            }}
            style={[
              styles.freqPill,
              !customFreq && freqHours === fp.hours && styles.freqPillActive,
            ]}
          >
            <Text
              style={[
                styles.freqPillText,
                !customFreq && freqHours === fp.hours && styles.freqPillTextActive,
              ]}
            >
              {fp.label}
            </Text>
          </Pressable>
        ))}
        {/* custom pill */}
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

      {/* custom frequency input, only shows when custom is picked */}
      {customFreq && (
        <View style={styles.customFreqRow}>
          <Text style={styles.customFreqLabel}>Every</Text>
          <TextInput
            style={styles.customFreqInput}
            placeholder="e.g. 48"
            placeholderTextColor="#bbb"
            keyboardType="numeric"
            value={customFreqText}
            onChangeText={(t) => {
              setCustomFreqText(t);
              const parsed = parseFloat(t);
              if (!isNaN(parsed) && parsed > 0) setFreqHours(parsed);
            }}
          />
          <Text style={styles.customFreqLabel}>hours</Text>
        </View>
      )}

      {/* cancel / add buttons */}
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

// A collapsible group of tasks under one location/room
function LocationGroup({
  location,
  selectedIds,
  onToggleSelect,
  onDeleteSelected,
  onDeleteTask,
  onAddTask,
  onRenameLocation,
  onDeleteLocation,
}: {
  location: TaskLocation; // the location data with its tasks
  selectedIds: Set<string>; // set of currently selected task IDs
  onToggleSelect: (id: string) => void; // toggle a task's selection
  onDeleteSelected: (locationId: string) => void; // delete all selected in this group
  onDeleteTask: (locationId: string, taskId: string) => void; // delete one task
  onAddTask: (locationId: string, name: string, icon: string, freqHours: number) => void; // add a new task here
  onRenameLocation: (locationId: string, newName: string) => void; // rename this location
  onDeleteLocation: (locationId: string) => void; // delete the whole location
}) {
  // Whether we're currently editing the location name
  const [isEditing, setIsEditing] = useState(false);
  // The text in the rename input
  const [editName, setEditName] = useState(location.name);
  // Whether the group is collapsed or expanded
  const [collapsed, setCollapsed] = useState(false);
  // Ref to the rename input so we can focus it programmatically
  const inputRef = useRef<TextInput>(null);

  // Check if any tasks in this group are selected
  const hasSelection = location.tasks.some((t) => selectedIds.has(t.id));
  // Count how many tasks are selected
  const selectedCount = location.tasks.filter((t) => selectedIds.has(t.id)).length;

  // Save the renamed location name
  const handleSaveRename = () => {
    const trimmed = editName.trim(); // clean up whitespace
    if (trimmed && trimmed !== location.name) {
      onRenameLocation(location.id, trimmed); // only rename if it actually changed
    } else {
      setEditName(location.name); // revert if empty or unchanged
    }
    setIsEditing(false); // exit editing mode
  };

  // Start editing the location name
  const handleStartEdit = () => {
    setEditName(location.name); // populate with the current name
    setIsEditing(true); // enter editing mode
    setTimeout(() => inputRef.current?.focus(), 50); // focus the input after a short delay
  };

  // Show a confirmation dialog before deleting the entire location
  const confirmDeleteLocation = () => {
    if (Platform.OS === "web") {
      // Web uses window.confirm
      if (window.confirm(`Delete "${location.name}" and all its tasks?`)) {
        onDeleteLocation(location.id); // delete if confirmed
      }
    } else {
      // Mobile uses the native Alert API
      Alert.alert(
        "Delete Section",
        `Delete "${location.name}" and all its tasks?`,
        [
          { text: "Cancel", style: "cancel" }, // cancel option
          {
            text: "Delete",
            style: "destructive",
            onPress: () => onDeleteLocation(location.id), // delete on confirm
          },
        ]
      );
    }
  };

  return (
    // Card-like container for the whole location group
    <View style={styles.locationGroup}>
      {/* Collapsible header bar */}
      <Pressable
        style={styles.locationHeader}
        onPress={() => setCollapsed((c) => !c)}
      >
        {/* Location icon */}
        <MaterialCommunityIcons
          name={location.icon as any}
          size={24}
          color="#4169E1"
        />

        {/* Show an editable input or the location name depending on mode */}
        {isEditing ? (
          // Rename input field
          <TextInput
            ref={inputRef}
            style={styles.locationNameInput}
            value={editName}
            onChangeText={setEditName}
            onBlur={handleSaveRename}
            onSubmitEditing={handleSaveRename}
            returnKeyType="done"
            selectTextOnFocus
          />
        ) : (
          // Tappable location name, long press to edit
          <Pressable onLongPress={handleStartEdit} style={{ flex: 1 }}>
            <Text style={styles.locationName}>{location.name}</Text>
          </Pressable>
        )}

        {/* Badge showing how many tasks are in this group */}
        <Text style={styles.taskCount}>{location.tasks.length}</Text>

        {/* Batch delete button, only shows when tasks are selected */}
        {hasSelection && (
          <Pressable
            onPress={() => onDeleteSelected(location.id)}
            style={styles.batchDeleteBtn}
          >
            {/* Trash icon */}
            <MaterialCommunityIcons name="delete-outline" size={18} color="#f44336" />
            {/* Number of selected tasks */}
            <Text style={styles.batchDeleteText}>{selectedCount}</Text>
          </Pressable>
        )}

        {/* Edit and delete buttons for the location itself */}
        {!isEditing && (
          <View style={styles.headerActions}>
            {/* Pencil icon to rename */}
            <Pressable onPress={handleStartEdit} hitSlop={6} style={styles.headerActionBtn}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#999" />
            </Pressable>
            {/* Trash icon to delete the whole section */}
            <Pressable onPress={confirmDeleteLocation} hitSlop={6} style={styles.headerActionBtn}>
              <MaterialCommunityIcons name="trash-can-outline" size={18} color="#999" />
            </Pressable>
          </View>
        )}

        {/* Chevron that flips based on collapsed state */}
        <MaterialCommunityIcons
          name={collapsed ? "chevron-down" : "chevron-up"}
          size={22}
          color="#999"
          style={{ marginLeft: 4 }}
        />
      </Pressable>

      {/* Only show the task list and add row when not collapsed */}
      {!collapsed && (
        <>
          {/* Show empty state or the task list */}
          {location.tasks.length === 0 ? (
            // Empty state when there are no tasks
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="playlist-remove" size={32} color="#ddd" />
              <Text style={styles.emptyStateText}>No tasks yet</Text>
            </View>
          ) : (
            // Container for all the task rows
            <View style={styles.taskListContainer}>
              {/* Render each task as a row */}
              {location.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isSelected={selectedIds.has(task.id)}
                  onToggleSelect={onToggleSelect}
                  onDeleteTask={(taskId) => onDeleteTask(location.id, taskId)}
                />
              ))}
            </View>
          )}

          <AddTaskCard
            onAdd={(name, icon, freqHours) =>
              onAddTask(location.id, name, icon, freqHours)
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
        {/* tap the icon to show/hide the picker */}
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

      {/* icon picker for the section */}
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

// Main screen component that ties everything together
export default function ListScreen() {
  // Locations state: starts empty, loaded from storage or mock data on mount
  const [locations, setLocations] = useState<TaskLocation[]>([]);
  // Track whether we've finished loading from storage
  const [loaded, setLoaded] = useState(false);
  // Track which task IDs are currently selected
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // load saved data on mount, fall back to mock data if nothing saved
  useEffect(() => {
    loadLocations().then((saved) => {
      if (saved && saved.length > 0) {
        // Use the persisted data if it exists
        setLocations(saved);
      } else {
        // Fall back to mock data on first run
        setLocations(
          MOCK_HOUSEHOLD.locations.map((loc) => ({
            ...loc, // spread the location fields
            tasks: [...loc.tasks], // shallow copy the tasks array
          }))
        );
      }
      setLoaded(true); // mark as ready
    });
  }, []);

  // save to storage whenever locations change (but not before initial load)
  useEffect(() => {
    if (!loaded) return; // don't save until we've loaded
    saveLocations(locations);
  }, [locations, loaded]);

  // Toggle a task's selection on or off
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev); // copy the set
      if (next.has(id)) next.delete(id); // deselect if already selected
      else next.add(id); // select if not
      return next;
    });
  }, []);

  // Delete all selected tasks within a specific location
  const handleDeleteSelected = useCallback(
    (locationId: string) => {
      setLocations((prev) =>
        prev.map((loc) => {
          if (loc.id !== locationId) return loc; // skip other locations
          return {
            ...loc,
            tasks: loc.tasks.filter((t) => !selectedIds.has(t.id)), // remove selected ones
          };
        })
      );
      setSelectedIds(new Set()); // clear all selections after deleting
    },
    [selectedIds]
  );

  // Delete a single task by its ID within a location
  const handleDeleteTask = useCallback(
    (locationId: string, taskId: string) => {
      setLocations((prev) =>
        prev.map((loc) => {
          if (loc.id !== locationId) return loc; // skip other locations
          return {
            ...loc,
            tasks: loc.tasks.filter((t) => t.id !== taskId), // filter out the deleted task
          };
        })
      );
      // Also remove it from the selection set if it was selected
      setSelectedIds((prev) => {
        if (!prev.has(taskId)) return prev; // skip if not selected
        const next = new Set(prev); // copy
        next.delete(taskId); // remove
        return next;
      });
    },
    []
  );

  // Add a new task to a specific location with chosen icon and frequency
  const handleAddTask = useCallback(
    (locationId: string, name: string, icon: string, frequencyHours: number) => {
      // Create a new task with the provided values
      const newTask: Task = {
        id: generateId("t"), // generate a unique ID
        name, // the name from the input
        frequencyHours, // selected frequency
        lastCompleted: new Date().toISOString(), // mark as just completed
        icon, // selected icon
      };
      setLocations((prev) =>
        prev.map((loc) =>
          loc.id === locationId
            ? { ...loc, tasks: [...loc.tasks, newTask] } // append the new task
            : loc // leave other locations alone
        )
      );
    },
    []
  );

  // Rename a location/section
  const handleRenameLocation = useCallback(
    (locationId: string, newName: string) => {
      setLocations((prev) =>
        prev.map((loc) =>
          loc.id === locationId ? { ...loc, name: newName } : loc // update the name
        )
      );
    },
    []
  );

  // Delete an entire location and all its tasks
  const handleDeleteLocation = useCallback((locationId: string) => {
    setLocations((prev) => prev.filter((loc) => loc.id !== locationId)); // filter it out
  }, []);

  // Add a brand new empty location/section with a chosen icon
  const handleAddLocation = useCallback((name: string, icon: string) => {
    // Create a new location with no tasks
    const newLoc: TaskLocation = {
      id: generateId("loc"), // unique ID
      name, // name from the input
      icon, // chosen icon from the picker
      tasks: [], // starts empty
    };
    setLocations((prev) => [...prev, newLoc]); // append to the list
  }, []);

  // loading state while we read from storage
  if (!loaded) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.subtitle}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Title section showing household name and stats */}
      <View style={styles.titleBar}>
        {/* Household name */}
        <Text style={styles.title}>{MOCK_HOUSEHOLD.name}</Text>
        {/* Summary line with section and task counts */}
        <Text style={styles.subtitle}>
          {locations.length} section{locations.length !== 1 ? "s" : ""} ·{" "}
          {locations.reduce((n, l) => n + l.tasks.length, 0)} tasks
        </Text>
      </View>

      {/* Scrollable area for all location groups */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Render each location as a collapsible group */}
        {locations.map((loc) => (
          <LocationGroup
            key={loc.id}
            location={loc}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onDeleteSelected={handleDeleteSelected}
            onDeleteTask={handleDeleteTask}
            onAddTask={handleAddTask}
            onRenameLocation={handleRenameLocation}
            onDeleteLocation={handleDeleteLocation}
          />
        ))}

        {/* Row for adding a new section at the bottom */}
        <AddSectionRow onAdd={handleAddLocation} />
      </ScrollView>
    </View>
  );
}

// Accent color and background color constants
const ACCENT = "#4169E1";
const BG = "#f0f2f5";

// All styles for the list screen
const styles = StyleSheet.create({
  // Root container fills the screen
  root: {
    flex: 1, // take up all available space
    backgroundColor: BG, // light gray background
  },
  // Scroll view fills remaining space
  scroll: {
    flex: 1, // take remaining vertical space
  },
  // Padding inside the scroll view
  scrollContent: {
    padding: 16, // space around content
    paddingBottom: 48, // extra space at the bottom so content isn't cut off
  },

  // Title bar above the scroll area
  titleBar: {
    paddingHorizontal: 20, // side padding
    paddingTop: 4, // small top gap
    paddingBottom: 10, // space before the list starts
  },
  // Main title text
  title: {
    fontSize: 22, // large text
    fontWeight: "700", // bold
    color: "#1a1a2e", // dark color
  },
  // Subtitle showing counts
  subtitle: {
    fontSize: 13, // smaller text
    color: "#888", // gray
    marginTop: 2, // tiny gap below the title
  },

  // Card container for each location group
  locationGroup: {
    backgroundColor: "#fff", // white card
    borderRadius: 14, // rounded corners
    marginBottom: 14, // space between cards
    overflow: "hidden", // clip children to rounded corners
    elevation: 1, // android shadow
    shadowColor: "#000", // ios shadow color
    shadowOffset: { width: 0, height: 1 }, // shadow direction
    shadowOpacity: 0.06, // very subtle shadow
    shadowRadius: 4, // shadow blur
  },
  // Header bar inside each location group
  locationHeader: {
    flexDirection: "row", // items in a row
    alignItems: "center", // vertically centered
    paddingVertical: 12, // top and bottom padding
    paddingHorizontal: 14, // side padding
    backgroundColor: "#fafbfd", // slightly off-white background
    borderBottomWidth: StyleSheet.hairlineWidth, // thin separator line
    borderBottomColor: "#e8e8e8", // light gray separator
  },
  // Location name text
  locationName: {
    fontSize: 16, // medium text
    fontWeight: "600", // semi-bold
    color: "#1a1a2e", // dark
    marginLeft: 10, // gap after the icon
  },
  // Text input for renaming a location
  locationNameInput: {
    flex: 1, // fill available space
    fontSize: 16, // match the name text size
    fontWeight: "600", // match the name weight
    color: "#1a1a2e", // match the name color
    marginLeft: 10, // same gap as the name
    borderBottomWidth: 2, // underline to show editing
    borderBottomColor: ACCENT, // accent colored underline
    paddingVertical: 2, // small vertical padding
    paddingHorizontal: 4, // small horizontal padding
  },
  // Small badge showing the number of tasks
  taskCount: {
    fontSize: 12, // small text
    fontWeight: "600", // semi-bold
    color: "#bbb", // light gray
    backgroundColor: "#f0f0f0", // pill background
    borderRadius: 10, // rounded pill shape
    paddingHorizontal: 8, // side padding
    paddingVertical: 2, // top/bottom padding
    marginLeft: 6, // gap from the name
    overflow: "hidden", // clip to rounded corners
  },
  // Container for the edit/delete action buttons
  headerActions: {
    flexDirection: "row", // buttons side by side
    marginLeft: 6, // gap from the task count
  },
  // Individual header action button
  headerActionBtn: {
    padding: 4, // tap target padding
    marginLeft: 2, // small gap between buttons
  },

  // Red batch delete button that appears when tasks are selected
  batchDeleteBtn: {
    flexDirection: "row", // icon and count side by side
    alignItems: "center", // vertically centered
    paddingHorizontal: 8, // side padding
    paddingVertical: 3, // top/bottom padding
    borderRadius: 6, // slightly rounded
    backgroundColor: "#fdecea", // light red background
    marginLeft: 8, // gap from other elements
  },
  // Text showing how many are selected for deletion
  batchDeleteText: {
    color: "#f44336", // red text
    fontSize: 12, // small
    fontWeight: "700", // bold
    marginLeft: 2, // gap after the icon
  },

  // Container for the list of task rows
  taskListContainer: {
    paddingHorizontal: 4, // slight indent
  },
  // Individual task row
  taskRow: {
    flexDirection: "row", // everything in a row
    alignItems: "center", // vertically centered
    paddingVertical: 10, // top/bottom spacing
    paddingHorizontal: 4, // side spacing
    marginHorizontal: 4, // outer margin
    borderBottomWidth: StyleSheet.hairlineWidth, // thin separator
    borderBottomColor: "#f0f0f0", // very light separator
  },
  // Highlighted style when a task row is selected
  taskRowSelected: {
    backgroundColor: "#f3f0ff", // light purple tint
  },
  // Checkbox area
  checkbox: {
    marginRight: 6, // gap between checkbox and icon
  },
  // Wrapper around the task type icon
  taskIconWrap: {
    width: 32, // fixed size
    height: 32, // square
    borderRadius: 8, // rounded square
    backgroundColor: "#eef0ff", // light accent background
    alignItems: "center", // center the icon
    justifyContent: "center", // center the icon
    marginRight: 10, // gap before the task info
  },
  // Container for task name and health bar
  taskInfo: {
    flex: 1, // take up remaining space
  },
  // Task name text
  taskName: {
    fontSize: 14, // regular size
    fontWeight: "500", // medium weight
    color: "#333", // dark gray
    marginBottom: 4, // gap before the health bar
  },
  // Delete button on the right side of each task
  taskDeleteBtn: {
    padding: 6, // tap target
    marginLeft: 4, // gap from task info
  },

  // Row layout for the health bar and its label
  healthBarRow: {
    flexDirection: "row", // bar and label side by side
    alignItems: "center", // vertically centered
  },
  // Outer track of the health bar
  healthBarOuter: {
    flex: 1, // fill available width
    height: 5, // thin bar
    borderRadius: 3, // rounded ends
    backgroundColor: "#ececec", // gray track
    overflow: "hidden", // clip the inner fill
  },
  // Inner colored fill of the health bar
  healthBarInner: {
    height: "100%", // fill the track height
    borderRadius: 3, // match the track rounding
  },
  // Percentage label next to the health bar
  healthBarLabel: {
    fontSize: 10, // small text
    fontWeight: "700", // bold
    marginLeft: 6, // gap from the bar
    width: 32, // fixed width so it doesn't shift
    textAlign: "right", // right-align the percentage
  },

  // Empty state when a location has no tasks
  emptyState: {
    alignItems: "center", // center horizontally
    paddingVertical: 20, // vertical spacing
  },
  // "No tasks yet" text
  emptyStateText: {
    fontSize: 13, // small text
    color: "#ccc", // light gray
    marginTop: 4, // gap below the icon
  },

  // Collapsed add-task row
  addTaskRow: {
    flexDirection: "row", // icon and text side by side
    alignItems: "center", // vertically centered
    paddingHorizontal: 14, // side padding
    paddingVertical: 12, // top/bottom padding
    borderTopWidth: StyleSheet.hairlineWidth, // separator from tasks above
    borderTopColor: "#f0f0f0", // light separator
  },
  // Placeholder text in the collapsed add-task row
  addTaskPlaceholder: {
    fontSize: 14, // regular size
    color: "#bbb", // muted
  },

  // Expanded add-task card
  addTaskCard: {
    paddingHorizontal: 14, // side padding
    paddingVertical: 12, // top/bottom padding
    borderTopWidth: StyleSheet.hairlineWidth, // separator line
    borderTopColor: "#eee", // light border
    backgroundColor: "#fbfbfd", // very faint background
  },
  // Section label inside the add-task card
  addTaskLabel: {
    fontSize: 11, // small label
    fontWeight: "600", // semi-bold
    color: "#999", // muted
    textTransform: "uppercase", // ALL CAPS
    letterSpacing: 0.5, // slight letter spread
    marginTop: 8, // gap above
    marginBottom: 4, // gap below
  },
  // Text input for the new task name
  addTaskNameInput: {
    fontSize: 14, // regular size
    color: "#333", // dark text
    backgroundColor: "#fff", // white background
    borderWidth: 1, // thin border
    borderColor: "#e8e8e8", // light border color
    borderRadius: 8, // rounded corners
    paddingVertical: 8, // vertical inner padding
    paddingHorizontal: 10, // horizontal inner padding
    marginBottom: 4, // gap below
  },

  // Preset chips
  presetScroll: {
    marginBottom: 4, // gap below the scroll
  },
  presetScrollContent: {
    gap: 6, // spacing between chips
  },
  // Individual preset chip
  presetChip: {
    flexDirection: "row", // icon + text side by side
    alignItems: "center", // vertically centered
    paddingHorizontal: 10, // side padding
    paddingVertical: 5, // top/bottom padding
    borderRadius: 14, // pill shape
    backgroundColor: "#eef0ff", // light accent bg
    borderWidth: 1, // thin border
    borderColor: "#dde0f0", // subtle border
  },
  // Active (selected) preset chip
  presetChipActive: {
    backgroundColor: ACCENT, // accent fill
    borderColor: ACCENT, // matching border
  },
  // Preset chip text
  presetChipText: {
    fontSize: 12, // small text
    fontWeight: "500", // medium weight
    color: ACCENT, // accent colored
  },
  // Active preset chip text
  presetChipTextActive: {
    color: "#fff", // white on accent background
  },

  // Icon picker grid
  iconPickerRow: {
    flexDirection: "row", // icons side by side
    flexWrap: "wrap", // wrap to next line if needed
    gap: 6, // spacing between icons
    marginBottom: 4, // gap below
  },
  // Individual icon in the picker
  iconPickerItem: {
    width: 36, // fixed size
    height: 36, // square
    borderRadius: 8, // rounded square
    backgroundColor: "#f0f0f0", // light background
    alignItems: "center", // center the icon
    justifyContent: "center", // center the icon
  },
  // Active (selected) icon
  iconPickerItemActive: {
    backgroundColor: ACCENT, // accent fill when selected
  },

  // Frequency pills
  freqRow: {
    flexDirection: "row", // pills side by side
    flexWrap: "wrap", // wrap if needed
    gap: 6, // spacing between pills
    marginBottom: 8, // gap below
  },
  // Individual frequency pill
  freqPill: {
    paddingHorizontal: 12, // side padding
    paddingVertical: 5, // top/bottom padding
    borderRadius: 14, // pill shape
    backgroundColor: "#f0f0f0", // light background
    borderWidth: 1, // thin border
    borderColor: "#e0e0e0", // subtle border
  },
  // Active frequency pill
  freqPillActive: {
    backgroundColor: ACCENT, // accent fill
    borderColor: ACCENT, // matching border
  },
  // Frequency pill text
  freqPillText: {
    fontSize: 12, // small text
    fontWeight: "500", // medium weight
    color: "#666", // muted
  },
  // Active frequency pill text
  freqPillTextActive: {
    color: "#fff", // white on accent
  },

  // Custom frequency input row
  customFreqRow: {
    flexDirection: "row", // label + input + label in a row
    alignItems: "center", // vertically centered
    gap: 6, // spacing between elements
    marginBottom: 8, // gap below
  },
  // "Every" / "hours" labels beside the input
  customFreqLabel: {
    fontSize: 13, // regular size
    color: "#666", // muted text
  },
  // Numeric text input for custom hours
  customFreqInput: {
    width: 70, // fixed width for the number
    fontSize: 14, // regular size
    color: "#333", // dark text
    backgroundColor: "#fff", // white bg
    borderWidth: 1, // thin border
    borderColor: "#e8e8e8", // light border
    borderRadius: 8, // rounded corners
    paddingVertical: 5, // vertical padding
    paddingHorizontal: 8, // horizontal padding
    textAlign: "center", // center the number
  },

  // Add-task action buttons
  addTaskActions: {
    flexDirection: "row", // buttons side by side
    justifyContent: "flex-end", // align to the right
    gap: 8, // spacing between buttons
    marginTop: 4, // gap above
  },
  // Cancel button
  addTaskCancelBtn: {
    paddingHorizontal: 14, // side padding
    paddingVertical: 7, // top/bottom padding
    borderRadius: 8, // rounded corners
  },
  // Cancel button text
  addTaskCancelText: {
    fontSize: 13, // small text
    fontWeight: "600", // semi-bold
    color: "#999", // muted
  },
  // Submit / Add button
  addTaskSubmitBtn: {
    backgroundColor: ACCENT, // accent color
    paddingHorizontal: 18, // side padding
    paddingVertical: 7, // top/bottom padding
    borderRadius: 8, // rounded corners
  },
  // Disabled state for the submit button
  addTaskSubmitBtnDisabled: {
    opacity: 0.4, // faded out when disabled
  },
  // Submit button text
  addTaskSubmitText: {
    color: "#fff", // white text
    fontSize: 13, // small
    fontWeight: "700", // bold
  },

  // Dashed row for adding a new section/location
  addSectionRow: {
    backgroundColor: "#fff", // white background
    borderRadius: 14, // rounded corners
    paddingHorizontal: 14, // side padding
    paddingVertical: 14, // top/bottom padding
    marginBottom: 14, // space below
    borderWidth: 1.5, // dashed border thickness
    borderColor: "#e0e4f0", // light border color
    borderStyle: "dashed", // dashed style to look different from regular cards
  },
  // Top row inside add-section: icon + input + button
  addSectionTopRow: {
    flexDirection: "row", // items in a row
    alignItems: "center", // vertically centered
  },
  // Text input for the new section name
  addSectionInput: {
    flex: 1, // fill remaining space
    fontSize: 15, // slightly larger text
    color: "#333", // dark text
    marginLeft: 10, // gap after the icon
    paddingVertical: 6, // inner vertical padding
    paddingHorizontal: 10, // inner horizontal padding
  },
  // "Create" button that appears when text is entered
  addSectionBtn: {
    backgroundColor: ACCENT, // accent colored
    paddingHorizontal: 16, // side padding
    paddingVertical: 7, // top/bottom padding
    borderRadius: 8, // rounded corners
    marginLeft: 8, // gap from the input
  },
  // Text inside the create button
  addSectionBtnText: {
    color: "#fff", // white text
    fontSize: 13, // small
    fontWeight: "700", // bold
  },
  // Icon picker row inside the add-section card
  sectionIconRow: {
    flexDirection: "row", // icons side by side
    flexWrap: "wrap", // wrap if needed
    gap: 6, // spacing
    marginTop: 10, // gap from the input row above
  },
});
