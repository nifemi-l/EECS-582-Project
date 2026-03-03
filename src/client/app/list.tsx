/* PROLOGUE
File name: list.tsx
Description: A list view for managing household tasks grouped by feature/room
Programmer: Nifemi Lawal
Creation date: 2/6/26
Revision date:
  - 2/11/26: Fix padding for the new section name input area
Preconditions: Mock household data must be available from the data module
Postconditions: Renders an interactive task list organized by feature
Errors: None. Will always render successfully
Side effects: State changes when adding, deleting, or renaming tasks and features
Invariants: None
Known faults: None
*/

// Import react hooks we need for state and performance
import React, { useCallback, useRef, useState } from "react";
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

// Import mock data and types from our data module
import Task from "../../server/task";
import Household from "../../server/household";
import Feature from "../../server/feature";
import { DayAmount } from "../../server/frequency";

const MOCK_HOUSEHOLD = Household.createMockHousehold();

// Counter for generating unique IDs
let nextId = 100;
// Simple ID generator that increments and returns a prefixed string
function generateId(prefix = "t") {
    nextId += 1; // bump the counter
    return `${prefix}-gen-${nextId}`; // return something like "t-gen-101"
}

// Health bar component that shows how "healthy" a task is as a colored bar
function HealthBar({ task }: { task: Task }) {
    const pct = task.getAndSetHealthPercent(); // get the health as a 0-1 decimal
    const color = task.getHealthColor(pct); // pick a color based on the percentage
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

// A collapsible group of tasks under one feature/room
function FeatureGroup({
    feature,
    selectedIds,
    onToggleSelect,
    onDeleteSelected,
    onDeleteTask,
    onAddTask,
    onRenameFeature,
    onDeleteFeature,
}: {
    feature: Feature; // the feature data with its tasks
    selectedIds: Set<string>; // set of currently selected task IDs
    onToggleSelect: (id: string) => void; // toggle a task's selection
    onDeleteSelected: (featureId: string) => void; // delete all selected in this group
    onDeleteTask: (featureId: string, taskId: string) => void; // delete one task
    onAddTask: (featureId: string, name: string) => void; // add a new task here
    onRenameFeature: (featureId: string, newName: string) => void; // rename this feature
    onDeleteFeature: (featureId: string) => void; // delete the whole feature
}) {
    // State for the new task input field
    const [newTaskName, setNewTaskName] = useState("");
    // Whether we're currently editing the feature name
    const [isEditing, setIsEditing] = useState(false);
    // The text in the rename input
    const [editName, setEditName] = useState(feature.name);
    // Whether the group is collapsed or expanded
    const [collapsed, setCollapsed] = useState(false);
    // Ref to the rename input so we can focus it programmatically
    const inputRef = useRef<TextInput>(null);

    // Check if any tasks in this group are selected
    const hasSelection = feature.tasks.some((t) =>
        selectedIds.has(t.id),
    );
    // Count how many tasks are selected
    const selectedCount = feature.tasks.filter((t) =>
        selectedIds.has(t.id),
    ).length;

    // Handle adding a new task from the input field
    const handleAdd = () => {
        const trimmed = newTaskName.trim(); // remove whitespace
        if (!trimmed) return; // don't add empty tasks
        onAddTask(feature.id, trimmed); // call parent handler
        setNewTaskName(""); // clear the input
    };

    // Save the renamed feature name
    const handleSaveRename = () => {
        const trimmed = editName.trim(); // clean up whitespace
        if (trimmed && trimmed !== feature.name) {
            onRenameFeature(feature.id, trimmed); // only rename if it actually changed
        } else {
            setEditName(feature.name); // revert if empty or unchanged
        }
        setIsEditing(false); // exit editing mode
    };

    // Start editing the feature name
    const handleStartEdit = () => {
        setEditName(feature.name); // populate with the current name
        setIsEditing(true); // enter editing mode
        setTimeout(() => inputRef.current?.focus(), 50); // focus the input after a short delay
    };

    // Show a confirmation dialog before deleting the entire feature
    const confirmDeleteFeature = () => {
        if (Platform.OS === "web") {
            // Web uses window.confirm
            if (window.confirm(`Delete "${feature.name}" and all its tasks?`)) {
                onDeleteFeature(feature.id); // delete if confirmed
            }
        } else {
            // Mobile uses the native Alert API
            Alert.alert(
                "Delete Section",
                `Delete "${feature.name}" and all its tasks?`,
                [
                    { text: "Cancel", style: "cancel" }, // cancel option
                    {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => onDeleteFeature(feature.id), // delete on confirm
                    },
                ],
            );
        }
    };

    return (
        // Card-like container for the whole feature group
        <View style={styles.featureGroup}>
            {/* Collapsible header bar */}
            <Pressable
                style={styles.featureHeader}
                onPress={() => setCollapsed((c) => !c)}
            >
                {/* Feature icon */}
                <MaterialCommunityIcons
                    name={feature.icon as any}
                    size={24}
                    color="#4169E1"
                />

                {/* Show an editable input or the feature name depending on mode */}
                {isEditing ? (
                    // Rename input field
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
                    // Tappable feature name, long press to edit
                    <Pressable onLongPress={handleStartEdit} style={{ flex: 1 }}>
                        <Text style={styles.featureName}>{feature.name}</Text>
                    </Pressable>
                )}

                {/* Badge showing how many tasks are in this group */}
                <Text style={styles.taskCount}>{feature.tasks.length}</Text>

                {/* Batch delete button, only shows when tasks are selected */}
                {hasSelection && (
                    <Pressable
                        onPress={() => onDeleteSelected(feature.id)}
                        style={styles.batchDeleteBtn}
                    >
                        {/* Trash icon */}
                        <MaterialCommunityIcons
                            name="delete-outline"
                            size={18}
                            color="#f44336"
                        />
                        {/* Number of selected tasks */}
                        <Text style={styles.batchDeleteText}>{selectedCount}</Text>
                    </Pressable>
                )}

                {/* Edit and delete buttons for the feature itself */}
                {!isEditing && (
                    <View style={styles.headerActions}>
                        {/* Pencil icon to rename */}
                        <Pressable
                            onPress={handleStartEdit}
                            hitSlop={6}
                            style={styles.headerActionBtn}
                        >
                            <MaterialCommunityIcons
                                name="pencil-outline"
                                size={18}
                                color="#999"
                            />
                        </Pressable>
                        {/* Trash icon to delete the whole section */}
                        <Pressable
                            onPress={confirmDeleteFeature}
                            hitSlop={6}
                            style={styles.headerActionBtn}
                        >
                            <MaterialCommunityIcons
                                name="trash-can-outline"
                                size={18}
                                color="#999"
                            />
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
                    {feature.tasks.length === 0 ? (
                        // Empty state when there are no tasks
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons
                                name="playlist-remove"
                                size={32}
                                color="#ddd"
                            />
                            <Text style={styles.emptyStateText}>No tasks yet</Text>
                        </View>
                    ) : (
                        // Container for all the task rows
                        <View style={styles.taskListContainer}>
                            {/* Render each task as a row */}
                            {Array.from(feature.tasks).map((task) => (
                                <TaskRow
                                    key={task.id}
                                    task={task}
                                    isSelected={selectedIds.has(task.id)}
                                    onToggleSelect={onToggleSelect}
                                    onDeleteTask={(taskId) => onDeleteTask(feature.id, taskId)}
                                />
                            ))}
                        </View>
                    )}

                    {/* Input row for adding a new task */}
                    <View style={styles.addTaskRow}>
                        {/* Plus icon */}
                        <MaterialCommunityIcons
                            name="plus"
                            size={18}
                            color="#4169E1"
                            style={{ marginRight: 8 }}
                        />
                        {/* Text input for the new task name */}
                        <TextInput
                            style={styles.addTaskInput}
                            placeholder="Add a task…"
                            placeholderTextColor="#bbb"
                            value={newTaskName}
                            onChangeText={setNewTaskName}
                            onSubmitEditing={handleAdd}
                            returnKeyType="done"
                        />
                        {/* Show the add button only when there's text */}
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

// Row at the bottom for creating a brand new feature/section
function AddSectionRow({
    onAdd,
}: {
    onAdd: (name: string) => void; // callback when a new section is created
}) {
    // State for the section name input
    const [name, setName] = useState("");

    // Handle creating the new section
    const handleAdd = () => {
        const trimmed = name.trim(); // remove whitespace
        if (!trimmed) return; // skip if empty
        onAdd(trimmed); // pass the name up
        setName(""); // clear the input
    };

    return (
        // Dashed border container to visually separate it
        <View style={styles.addSectionRow}>
            {/* Plus box icon */}
            <MaterialCommunityIcons
                name="plus-box-outline"
                size={22}
                color="#4169E1"
            />
            {/* Text input for the new section name */}
            <TextInput
                style={styles.addSectionInput}
                placeholder="New section name…"
                placeholderTextColor="#bbb"
                value={name}
                onChangeText={setName}
                onSubmitEditing={handleAdd}
                returnKeyType="done"
            />
            {/* Show the create button only when there's text */}
            {name.trim().length > 0 && (
                <Pressable onPress={handleAdd} style={styles.addSectionBtn}>
                    <Text style={styles.addSectionBtnText}>Create</Text>
                </Pressable>
            )}
        </View>
    );
}

// Main screen component that ties everything together
export default function ListScreen() {
    // Initialize features state from the mock data, deep copy so we don't mutate the original
    //
    const [features, setFeatures] = useState<Feature[]>(() =>
        MOCK_HOUSEHOLD.features.map((loc) => ({
        ...loc, // spread the feature fields
        tasks: [...loc.tasks], // shallow copy the tasks array 
    }))
                                                       );

    // Track which task IDs are currently selected
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Toggle a task's selection on or off
    const handleToggleSelect = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev); // copy the set
            if (next.has(id))
                next.delete(id); // deselect if already selected
            else next.add(id); // select if not
            return next;
        });
    }, []);

    // Delete all selected tasks within a specific feature
    const handleDeleteSelected = useCallback(
        (featureId: string) => {
            setFeatures((prev) =>
                prev.map((loc) => {
                    if (loc.id !== featureId) return loc; // skip other features
                    return {
                        ...loc,
                        tasks: loc.tasks.filter((t) => !selectedIds.has(t.id)), // remove selected ones
                    };
                }),
            );
            setSelectedIds(new Set()); // clear all selections after deleting
        },
        [selectedIds],
    );

    // Delete a single task by its ID within a feature
    const handleDeleteTask = useCallback((featureId: string, taskId: string) => {
        setFeatures((prev) =>
            prev.map((loc) => {
                if (loc.id !== featureId) return loc; // skip other features
                return {
                    ...loc,
                    tasks: loc.tasks.filter((t) => t.id !== taskId), // filter out the deleted task
                };
            }),
        );
        // Also remove it from the selection set if it was selected
        setSelectedIds((prev) => {
            if (!prev.has(taskId)) return prev; // skip if not selected
            const next = new Set(prev); // copy
            next.delete(taskId); // remove
            return next;
        });
    }, []);

    // Add a new task to a specific feature
    const handleAddTask = useCallback((featureId: string, name: string) => {
        // Create a new task with default values
        const newTask: Task = new Task(
            "t",
            name,
            1,
            new Date(),
            "clipboard-text-outline",
        );

        setFeatures((prev) =>
            prev.map(
                (loc) =>
                    loc.id === featureId
                        ? { ...loc, tasks: [...loc.tasks, newTask] } // append the new task
                        : loc, // leave other features alone
            ),
        );
    }, []);

    // Rename a feature/section
    const handleRenameFeature = useCallback(
        (featureId: string, newName: string) => {
            setFeatures((prev) =>
                prev.map(
                    (loc) => (loc.id === featureId ? { ...loc, name: newName } : loc), // update the name
                ),
            );
        },
        [],
    );

    // Delete an entire feature and all its tasks
    const handleDeleteFeature = useCallback((featureId: string) => {
        setFeatures((prev) => prev.filter((loc) => loc.id !== featureId)); // filter it out
    }, []);

    // Add a brand new empty feature/section
    const handleAddFeature = useCallback((name: string) => {
        // Create a new feature with no tasks
        const newLoc: Feature = new Feature(
            generateId("loc"), // unique ID
            name, // name from the input
            "home-outline", // default house icon
        );
        setFeatures((prev) => [...prev, newLoc]); // append to the list
    }, []);

    return (
        <View style={styles.root} >
            {/* Title section showing household name and stats */}
            < View style={styles.titleBar} >
                {/* Household name */}
                < Text style={styles.title} > {MOCK_HOUSEHOLD.name}</Text>
                {/* Summary line with section and task counts */}
                < Text style={styles.subtitle} >
                    {features.length} section{features.length !== 1 ? "s" : ""} ·{" "}
                    {features.reduce((n, l) => n + l.tasks.length, 0)} tasks
                </Text >
            </View >

            {/* Scrollable area for all feature groups */}
            < ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Render each feature as a collapsible group */}
                {
                    features.map((loc) => (
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
                        />
                    ))
                }

                {/* Row for adding a new section at the bottom */}
                <AddSectionRow onAdd={handleAddFeature} />
            </ScrollView >
        </View >
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

    // Card container for each feature group
    featureGroup: {
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
    // Header bar inside each feature group
    featureHeader: {
        flexDirection: "row", // items in a row
        alignItems: "center", // vertically centered
        paddingVertical: 12, // top and bottom padding
        paddingHorizontal: 14, // side padding
        backgroundColor: "#fafbfd", // slightly off-white background
        borderBottomWidth: StyleSheet.hairlineWidth, // thin separator line
        borderBottomColor: "#e8e8e8", // light gray separator
    },
    // Feature name text
    featureName: {
        fontSize: 16, // medium text
        fontWeight: "600", // semi-bold
        color: "#1a1a2e", // dark
        marginLeft: 10, // gap after the icon
    },
    // Text input for renaming a feature
    featureNameInput: {
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

    // Empty state when a feature has no tasks
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

    // Row for adding a new task at the bottom of each group
    addTaskRow: {
        flexDirection: "row", // icon and input side by side
        alignItems: "center", // vertically centered
        paddingHorizontal: 14, // side padding
        paddingVertical: 10, // top/bottom padding
        borderTopWidth: StyleSheet.hairlineWidth, // separator from tasks above
        borderTopColor: "#f0f0f0", // light separator
    },
    // Text input for the new task name
    addTaskInput: {
        flex: 1, // fill remaining space
        fontSize: 14, // regular size
        color: "#333", // dark text
        paddingVertical: 6, // inner vertical padding
        paddingHorizontal: 10, // inner horizontal padding
    },
    // "Add" button that appears when text is entered
    addTaskBtn: {
        backgroundColor: ACCENT, // accent colored button
        paddingHorizontal: 14, // side padding
        paddingVertical: 6, // top/bottom padding
        borderRadius: 8, // rounded corners
        marginLeft: 8, // gap from the input
    },
    // Text inside the add button
    addTaskBtnText: {
        color: "#fff", // white text
        fontSize: 13, // small
        fontWeight: "700", // bold
    },

    // Dashed row for adding a new section/feature
    addSectionRow: {
        flexDirection: "row", // icon and input side by side
        alignItems: "center", // vertically centered
        backgroundColor: "#fff", // white background
        borderRadius: 14, // rounded corners
        paddingHorizontal: 14, // side padding
        paddingVertical: 14, // top/bottom padding
        marginBottom: 14, // space below
        borderWidth: 1.5, // dashed border thickness
        borderColor: "#e0e4f0", // light border color
        borderStyle: "dashed", // dashed style to look different from regular cards
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
});
