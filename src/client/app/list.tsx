import React, { useCallback, useRef, useState } from "react";
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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  healthColor,
  healthPercent,
  MOCK_HOUSEHOLD,
  Task,
  TaskLocation,
} from "./data/household";
import ViewToggle from "./components/ViewToggle";

let nextId = 100;
function generateId(prefix = "t") {
  nextId += 1;
  return `${prefix}-gen-${nextId}`;
}

function HealthBar({ task }: { task: Task }) {
  const pct = healthPercent(task);
  const color = healthColor(pct);
  const label = `${Math.round(pct * 100)}%`;
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

function TaskRow({
  task,
  isSelected,
  onToggleSelect,
  onDeleteTask,
}: {
  task: Task;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onDeleteTask: (id: string) => void;
}) {
  return (
    <View
      style={[
        styles.taskRow,
        isSelected && styles.taskRowSelected,
      ]}
    >
      <Pressable
        onPress={() => onToggleSelect(task.id)}
        hitSlop={8}
        style={styles.checkbox}
      >
        <MaterialCommunityIcons
          name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"}
          size={22}
          color={isSelected ? "#5c6bc0" : "#ccc"}
        />
      </Pressable>

      <View style={styles.taskIconWrap}>
        <MaterialCommunityIcons
          name={task.icon as any}
          size={20}
          color="#5c6bc0"
        />
      </View>

      <View style={styles.taskInfo}>
        <Text style={styles.taskName} numberOfLines={1}>
          {task.name}
        </Text>
        <HealthBar task={task} />
      </View>

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
  location: TaskLocation;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onDeleteSelected: (locationId: string) => void;
  onDeleteTask: (locationId: string, taskId: string) => void;
  onAddTask: (locationId: string, name: string) => void;
  onRenameLocation: (locationId: string, newName: string) => void;
  onDeleteLocation: (locationId: string) => void;
}) {
  const [newTaskName, setNewTaskName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(location.name);
  const [collapsed, setCollapsed] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const hasSelection = location.tasks.some((t) => selectedIds.has(t.id));
  const selectedCount = location.tasks.filter((t) => selectedIds.has(t.id)).length;

  const handleAdd = () => {
    const trimmed = newTaskName.trim();
    if (!trimmed) return;
    onAddTask(location.id, trimmed);
    setNewTaskName("");
  };

  const handleSaveRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== location.name) {
      onRenameLocation(location.id, trimmed);
    } else {
      setEditName(location.name);
    }
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    setEditName(location.name);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const confirmDeleteLocation = () => {
    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${location.name}" and all its tasks?`)) {
        onDeleteLocation(location.id);
      }
    } else {
      Alert.alert(
        "Delete Section",
        `Delete "${location.name}" and all its tasks?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => onDeleteLocation(location.id),
          },
        ]
      );
    }
  };

  return (
    <View style={styles.locationGroup}>
      <Pressable
        style={styles.locationHeader}
        onPress={() => setCollapsed((c) => !c)}
      >
        <MaterialCommunityIcons
          name={location.icon as any}
          size={24}
          color="#5c6bc0"
        />

        {isEditing ? (
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
          <Pressable onLongPress={handleStartEdit} style={{ flex: 1 }}>
            <Text style={styles.locationName}>{location.name}</Text>
          </Pressable>
        )}

        <Text style={styles.taskCount}>{location.tasks.length}</Text>

        {hasSelection && (
          <Pressable
            onPress={() => onDeleteSelected(location.id)}
            style={styles.batchDeleteBtn}
          >
            <MaterialCommunityIcons
              name="delete-outline"
              size={18}
              color="#f44336"
            />
            <Text style={styles.batchDeleteText}>{selectedCount}</Text>
          </Pressable>
        )}

        {!isEditing && (
          <View style={styles.headerActions}>
            <Pressable onPress={handleStartEdit} hitSlop={6} style={styles.headerActionBtn}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#999" />
            </Pressable>
            <Pressable onPress={confirmDeleteLocation} hitSlop={6} style={styles.headerActionBtn}>
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
          {location.tasks.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="playlist-remove" size={32} color="#ddd" />
              <Text style={styles.emptyStateText}>No tasks yet</Text>
            </View>
          ) : (
            <View style={styles.taskListContainer}>
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

          <View style={styles.addTaskRow}>
            <MaterialCommunityIcons
              name="plus"
              size={18}
              color="#5c6bc0"
              style={{ marginRight: 8 }}
            />
            <TextInput
              style={styles.addTaskInput}
              placeholder="Add a task…"
              placeholderTextColor="#bbb"
              value={newTaskName}
              onChangeText={setNewTaskName}
              onSubmitEditing={handleAdd}
              returnKeyType="done"
            />
            {newTaskName.trim().length > 0 && (
              <Pressable onPress={handleAdd} style={styles.addTaskBtn}>
                <Text style={styles.addTaskBtnText}>Add</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function AddSectionRow({
  onAdd,
}: {
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
  };

  return (
    <View style={styles.addSectionRow}>
      <MaterialCommunityIcons name="plus-box-outline" size={22} color="#5c6bc0" />
      <TextInput
        style={styles.addSectionInput}
        placeholder="New section name…"
        placeholderTextColor="#bbb"
        value={name}
        onChangeText={setName}
        onSubmitEditing={handleAdd}
        returnKeyType="done"
      />
      {name.trim().length > 0 && (
        <Pressable onPress={handleAdd} style={styles.addSectionBtn}>
          <Text style={styles.addSectionBtnText}>Create</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function ListScreen() {
  const [locations, setLocations] = useState<TaskLocation[]>(() =>
    MOCK_HOUSEHOLD.locations.map((loc) => ({
      ...loc,
      tasks: [...loc.tasks],
    }))
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDeleteSelected = useCallback(
    (locationId: string) => {
      setLocations((prev) =>
        prev.map((loc) => {
          if (loc.id !== locationId) return loc;
          return {
            ...loc,
            tasks: loc.tasks.filter((t) => !selectedIds.has(t.id)),
          };
        })
      );
      setSelectedIds(new Set());
    },
    [selectedIds]
  );

  const handleDeleteTask = useCallback(
    (locationId: string, taskId: string) => {
      setLocations((prev) =>
        prev.map((loc) => {
          if (loc.id !== locationId) return loc;
          return {
            ...loc,
            tasks: loc.tasks.filter((t) => t.id !== taskId),
          };
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

  const handleAddTask = useCallback((locationId: string, name: string) => {
    const newTask: Task = {
      id: generateId("t"),
      name,
      frequencyHours: 24,
      lastCompleted: new Date().toISOString(),
      icon: "clipboard-text-outline",
    };
    setLocations((prev) =>
      prev.map((loc) =>
        loc.id === locationId
          ? { ...loc, tasks: [...loc.tasks, newTask] }
          : loc
      )
    );
  }, []);

  const handleRenameLocation = useCallback(
    (locationId: string, newName: string) => {
      setLocations((prev) =>
        prev.map((loc) =>
          loc.id === locationId ? { ...loc, name: newName } : loc
        )
      );
    },
    []
  );

  const handleDeleteLocation = useCallback((locationId: string) => {
    setLocations((prev) => prev.filter((loc) => loc.id !== locationId));
  }, []);

  const handleAddLocation = useCallback((name: string) => {
    const newLoc: TaskLocation = {
      id: generateId("loc"),
      name,
      icon: "home-outline",
      tasks: [],
    };
    setLocations((prev) => [...prev, newLoc]);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <ViewToggle active="list" />

        <View style={styles.titleBar}>
          <Text style={styles.title}>{MOCK_HOUSEHOLD.name}</Text>
          <Text style={styles.subtitle}>
            {locations.length} section{locations.length !== 1 ? "s" : ""} ·{" "}
            {locations.reduce((n, l) => n + l.tasks.length, 0)} tasks
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
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

          <AddSectionRow onAdd={handleAddLocation} />
        </ScrollView>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const ACCENT = "#5c6bc0";
const BG = "#f0f2f5";

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  safeArea: {
    flex: 1,
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

  locationGroup: {
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
  locationHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#fafbfd",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e8e8e8",
  },
  locationName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a2e",
    marginLeft: 10,
  },
  locationNameInput: {
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
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#f0f0f0",
  },
  addTaskInput: {
    flex: 1,
    fontSize: 14,
    color: "#333",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  addTaskBtn: {
    backgroundColor: ACCENT,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  addTaskBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  addSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: "#e0e4f0",
    borderStyle: "dashed",
  },
  addSectionInput: {
    flex: 1,
    fontSize: 15,
    color: "#333",
    marginLeft: 10,
    paddingVertical: 4,
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
});
