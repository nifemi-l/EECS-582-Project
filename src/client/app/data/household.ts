/* PROLOGUE
File name: household.ts
Description: Mock household data and health bar helper functions for the task list
Programmer: Nifemi Lawal
Creation date: 2/6/26
Revision date: None
Preconditions: None
Postconditions: Exports types, helper functions, and mock data for the household model
Errors: None. Will always render successfully
Side effects: None
Invariants: None
Known faults: None
*/

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

// Helper to generate an ISO timestamp for X hours ago
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString(); // subtract hours and convert
}

// Mock household data used until the real API is hooked up
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
