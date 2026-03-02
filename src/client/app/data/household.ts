/* PROLOGUE
File name: household.ts
Description: Household data types, health-bar helpers, AsyncStorage persistence,
             and preset constants (icons, frequencies, task templates) for the list view
Programmer: Nifemi Lawal
Creation date: 2/6/26
Revision date:
  - 3/1/26: Add AsyncStorage save/load helpers, task/location icon sets,
             frequency presets, and task preset templates (NL)
Preconditions: @react-native-async-storage/async-storage must be installed
Postconditions: Exports types, helpers, presets, and storage utilities
Errors: loadLocations returns null on parse failure so callers can fall back to mock data
Side effects: saveLocations writes to AsyncStorage (localStorage on web)
Invariants: None
Known faults: None
*/

// uses localStorage on web, native key-value store on mobile
import AsyncStorage from "@react-native-async-storage/async-storage";

// Task interface representing a single chore or to-do item
export interface Task {
  id: string; // unique identifier
  name: string; // display name of the task
  frequencyHours: number; // how often this should get done in hours
  lastCompleted: string; // ISO timestamp of when it was last completed
  icon: string; // MaterialCommunityIcons icon name
}

// TaskLocation groups tasks under a room or area
export interface TaskLocation {
  id: string; // unique identifier
  name: string; // name of the location like "Kitchen"
  icon: string; // MaterialCommunityIcons icon name
  tasks: Task[]; // list of tasks in this location
}

// Top-level household that contains all locations
export interface Household {
  id: string; // unique identifier
  name: string; // name of the household
  locations: TaskLocation[]; // all the rooms/areas
}

// Calculate health percentage for a task based on time since last completion
// Returns 0 if overdue and 1 if just completed
export function healthPercent(task: Task): number {
  const now = Date.now(); // current time in ms
  const last = new Date(task.lastCompleted).getTime(); // last completion in ms
  const windowMs = task.frequencyHours * 60 * 60 * 1000; // convert frequency to ms
  const elapsed = now - last; // how long since it was last done
  return Math.max(0, Math.min(1, 1 - elapsed / windowMs)); // clamp between 0 and 1
}

// Pick a color based on the health percentage
// Green if healthy, orange if getting stale, red if overdue
export function healthColor(percent: number): string {
  if (percent >= 0.6) return "#4caf50"; // green for healthy
  if (percent >= 0.3) return "#ff9800"; // orange for mid-range
  return "#f44336"; // red for overdue
}

// key we use in AsyncStorage
const STORAGE_KEY = "household_locations";

// saves the locations array to local storage as JSON
export async function saveLocations(locations: TaskLocation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
  } catch (e) {
    console.error("Failed to save locations:", e);
  }
}

// loads locations from local storage, returns null if nothing saved yet
export async function loadLocations(): Promise<TaskLocation[] | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TaskLocation[];
  } catch (e) {
    console.error("Failed to load locations:", e);
    return null;
  }
}

// icons you can pick when creating a task
export const TASK_ICONS: string[] = [
  "clipboard-text-outline",
  "broom",
  "vacuum",
  "spray-bottle",
  "dishwasher",
  "toilet",
  "bed-outline",
  "washing-machine",
  "trash-can-outline",
  "silverware-fork-knife",
  "mirror-rectangle",
  "hand-wash-outline",
  "window-closed-variant",
  "fridge-outline",
  "stove",
  "dog",
  "flower-outline",
  "recycle",
  "water-outline",
];

// icons you can pick when creating a section/room
export const LOCATION_ICONS: string[] = [
  "home-outline",
  "silverware-fork-knife",
  "shower",
  "bed",
  "sofa",
  "desk",
  "garage",
  "tree",
  "car-outline",
  "stairs",
  "washing-machine",
  "door",
];

// Frequency preset options shown as selectable pills
export interface FrequencyPreset {
  label: string; // display text like "Daily"
  hours: number; // value in hours
}
export const FREQUENCY_PRESETS: FrequencyPreset[] = [
  { label: "Daily", hours: 24 },
  { label: "Every 3 days", hours: 72 },
  { label: "Weekly", hours: 168 },
  { label: "Biweekly", hours: 336 },
];

// Bundled task presets that auto-fill name + icon + frequency
export interface TaskPreset {
  name: string; // task display name
  icon: string; // icon name
  frequencyHours: number; // how often
}
export const TASK_PRESETS: TaskPreset[] = [
  { name: "Wash dishes", icon: "dishwasher", frequencyHours: 12 },
  { name: "Vacuum", icon: "vacuum", frequencyHours: 72 },
  { name: "Mop floor", icon: "broom", frequencyHours: 168 },
  { name: "Wipe counters", icon: "spray-bottle", frequencyHours: 24 },
  { name: "Take out trash", icon: "trash-can-outline", frequencyHours: 72 },
  { name: "Do laundry", icon: "washing-machine", frequencyHours: 168 },
];

// Helper to generate an ISO timestamp for X hours ago
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString(); // subtract hours and convert
}

// Mock household data used as the initial seed when nothing is in storage yet
export const MOCK_HOUSEHOLD: Household = {
  id: "h1", // household id
  name: "My Home", // household name
  locations: [
    {
      id: "loc-kitchen", // kitchen section
      name: "Kitchen",
      icon: "silverware-fork-knife", // fork and knife icon
      tasks: [
        {
          id: "t1", // wash dishes task
          name: "Wash dishes",
          frequencyHours: 12, // twice a day
          lastCompleted: hoursAgo(4), // done 4 hours ago
          icon: "dishwasher",
        },
        {
          id: "t2", // wipe counters task
          name: "Wipe counters",
          frequencyHours: 24, // once a day
          lastCompleted: hoursAgo(20), // done 20 hours ago
          icon: "spray-bottle",
        },
        {
          id: "t3", // mop floor task
          name: "Mop floor",
          frequencyHours: 168, // once a week
          lastCompleted: hoursAgo(100), // done about 4 days ago
          icon: "broom",
        },
      ],
    },
    {
      id: "loc-bathroom", // bathroom section
      name: "Bathroom",
      icon: "shower", // shower icon
      tasks: [
        {
          id: "t4", // scrub toilet task
          name: "Scrub toilet",
          frequencyHours: 168, // once a week
          lastCompleted: hoursAgo(150), // almost a week ago
          icon: "toilet",
        },
        {
          id: "t5", // clean mirror task
          name: "Clean mirror",
          frequencyHours: 168, // once a week
          lastCompleted: hoursAgo(50), // done a couple days ago
          icon: "mirror-rectangle",
        },
      ],
    },
    {
      id: "loc-living", // living room section
      name: "Living Room",
      icon: "sofa", // couch icon
      tasks: [
        {
          id: "t6", // vacuum task
          name: "Vacuum carpet",
          frequencyHours: 72, // every 3 days
          lastCompleted: hoursAgo(10), // done 10 hours ago
          icon: "vacuum",
        },
        {
          id: "t7", // dust shelves task
          name: "Dust shelves",
          frequencyHours: 168, // once a week
          lastCompleted: hoursAgo(160), // almost overdue
          icon: "bookshelf",
        },
      ],
    },
    {
      id: "loc-bedroom", // bedroom section
      name: "Bedroom",
      icon: "bed", // bed icon
      tasks: [
        {
          id: "t8", // make bed task
          name: "Make bed",
          frequencyHours: 24, // daily
          lastCompleted: hoursAgo(2), // done 2 hours ago
          icon: "bed-outline",
        },
        {
          id: "t9", // organize closet task
          name: "Organize closet",
          frequencyHours: 336, // every 2 weeks
          lastCompleted: hoursAgo(200), // done over a week ago
          icon: "wardrobe-outline",
        },
      ],
    },
  ],
};
