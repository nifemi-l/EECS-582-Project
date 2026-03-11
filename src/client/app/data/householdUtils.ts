/* PROLOGUE
File name: household.ts
Description: Household data types, health-bar helpers, AsyncStorage persistence,
             and preset constants (icons, frequencies, task templates) for the list view
Programmer: Nifemi Lawal
Creation date: 2/6/26
Revision date: 
  - 3/1/26: Add AsyncStorage save/load helpers, task/location icon sets,
             frequency presets, and task preset templates (NL)
  - 3/8/26: Use server classes for consistency
Preconditions: @react-native-async-storage/async-storage must be installed
Postconditions: Exports types, helpers, presets, and storage utilities
Errors: loadLocations returns null on parse failure so callers can fall back to mock data
Side effects: saveLocations writes to AsyncStorage (localStorage on web)
Invariants: None
Known faults: None
*/

import Task from "./task";
import Feature from "./feature";
import Household from "./household";

// Mock household data used until the real API is hooked up
export const MOCK_HOUSEHOLD = Household.createMockHousehold();

// uses localStorage on web, native key-value store on mobile
import AsyncStorage from "@react-native-async-storage/async-storage";

// Calculate health percentage for a task based on time since last completion
// Returns 0 if overdue and 1 if just completed
export function healthPercent(task: Task): number {
  const now = Date.now(); // current time in ms
  const rawLast = task.last_completed; // last completion in ms

  if (!rawLast) return 0;

  const last =
    rawLast instanceof Date ? rawLast : new Date(rawLast as string);

  const lastMs = last.getTime();
  if (Number.isNaN(lastMs)) return 0;

  const windowMs = task.frequency_days * 24 * 60 * 60 * 1000; // convert frequency to ms
  const elapsed = now - last.getTime(); // how long since it was last done
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
const STORAGE_KEY = "household_features";

// saves the features array to local storage as JSON
export async function saveFeatures(features: Feature[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(features));
  } catch (e) {
    console.error("Failed to save features:", e);
  }
}

// loads features from local storage, returns null if nothing saved yet
export async function loadFeatures(): Promise<Feature[] | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Feature[];
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
  days: number; // value in days
}
export const FREQUENCY_PRESETS: FrequencyPreset[] = [
  { label: "Daily", days: 1 },
  { label: "Every two days", days: 2 },
  { label: "Weekly", days: 7 },
];

// Bundled task presets that auto-fill name + icon + frequency
export interface TaskPreset {
  name: string; // task display name
  icon: string; // icon name
  frequencyDays: number; // how often
}
export const TASK_PRESETS: TaskPreset[] = [
  { name: "Wash dishes", icon: "dishwasher", frequencyDays: 1 },
  { name: "Vacuum", icon: "vacuum", frequencyDays: 3 },
  { name: "Mop floor", icon: "broom", frequencyDays: 7 },
  { name: "Wipe counters", icon: "spray-bottle", frequencyDays: 1 },
  { name: "Take out trash", icon: "trash-can-outline", frequencyDays: 3 },
  { name: "Do laundry", icon: "washing-machine", frequencyDays: 7 },
];
