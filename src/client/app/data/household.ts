// Mock household data + health bar helpers
// Matches the server-side model (Household -> TaskLocation -> Task)
// but lives client-side for now until we hook up the API

export interface Task {
  id: string;
  name: string;
  frequencyHours: number;   // how often this should get done (hours)
  lastCompleted: string;     // ISO timestamp of last completion
  icon: string;              // MaterialCommunityIcons name
}

export interface TaskLocation {
  id: string;
  name: string;
  icon: string; // MaterialCommunityIcons name
  tasks: Task[];
}

export interface Household {
  id: string;
  name: string;
  locations: TaskLocation[];
}

// 0 = overdue, 1 = just done. Based on how far we are into the frequency window.
export function healthPercent(task: Task): number {
  const now = Date.now();
  const last = new Date(task.lastCompleted).getTime();
  const windowMs = task.frequencyHours * 60 * 60 * 1000;
  const elapsed = now - last;
  return Math.max(0, Math.min(1, 1 - elapsed / windowMs));
}

// Green if healthy, orange if mid, red if overdue
export function healthColor(percent: number): string {
  if (percent >= 0.6) return "#4caf50";
  if (percent >= 0.3) return "#ff9800";
  return "#f44336";
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

export const MOCK_HOUSEHOLD: Household = {
  id: "h1",
  name: "My Home",
  locations: [
    {
      id: "loc-kitchen",
      name: "Kitchen",
      icon: "silverware-fork-knife",
      tasks: [
        {
          id: "t1",
          name: "Wash dishes",
          frequencyHours: 12,
          lastCompleted: hoursAgo(4),
          icon: "dishwasher",
        },
        {
          id: "t2",
          name: "Wipe counters",
          frequencyHours: 24,
          lastCompleted: hoursAgo(20),
          icon: "spray-bottle",
        },
        {
          id: "t3",
          name: "Mop floor",
          frequencyHours: 168,
          lastCompleted: hoursAgo(100),
          icon: "broom",
        },
      ],
    },
    {
      id: "loc-bathroom",
      name: "Bathroom",
      icon: "shower",
      tasks: [
        {
          id: "t4",
          name: "Scrub toilet",
          frequencyHours: 168,
          lastCompleted: hoursAgo(150),
          icon: "toilet",
        },
        {
          id: "t5",
          name: "Clean mirror",
          frequencyHours: 168,
          lastCompleted: hoursAgo(50),
          icon: "mirror-rectangle",
        },
      ],
    },
    {
      id: "loc-living",
      name: "Living Room",
      icon: "sofa",
      tasks: [
        {
          id: "t6",
          name: "Vacuum carpet",
          frequencyHours: 72,
          lastCompleted: hoursAgo(10),
          icon: "vacuum",
        },
        {
          id: "t7",
          name: "Dust shelves",
          frequencyHours: 168,
          lastCompleted: hoursAgo(160),
          icon: "bookshelf",
        },
      ],
    },
    {
      id: "loc-bedroom",
      name: "Bedroom",
      icon: "bed",
      tasks: [
        {
          id: "t8",
          name: "Make bed",
          frequencyHours: 24,
          lastCompleted: hoursAgo(2),
          icon: "bed-outline",
        },
        {
          id: "t9",
          name: "Organize closet",
          frequencyHours: 336,
          lastCompleted: hoursAgo(200),
          icon: "wardrobe-outline",
        },
      ],
    },
  ],
};
