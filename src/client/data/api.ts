/* PROLOGUE
File name: api.ts
Description: Helper functions for making API calls to the Flask backend.
             Each function wraps a single REST endpoint and handles the fetch + error checking.
             Used by list.tsx to talk to the database instead of using local AsyncStorage.
             All requests attach a JWT Bearer token from authStorage for authentication.
Programmer: Nifemi Lawal, some by Jack Bauer
Creation date: 3/29/26
Revision date:
  - 3/29/26: Replace hardcoded localhost URL with EXPO_PUBLIC_API_URL env variable
  - 4/14/26: Room CRUD + feature room_id
  - 4/16/26: Add 3D scale, rotation support
  - 4/20/26: Add call to clear feature position data
Preconditions: Flask server must be reachable at EXPO_PUBLIC_API_URL; user must be logged in
Postconditions: Returns parsed JSON from the server or throws on failure
Errors: Throws an Error with the HTTP status if the response is not ok
Side effects: None (all side effects happen on the server)
Invariants: None
Known faults: None
*/

import { getToken } from "../utils/authStorage";
import type { HouseholdRoom } from "./room";

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const API_BASE = `${API_URL}/api`;

// Added to get the household name for the header
export async function fetchMyHouseholds(): Promise<{
  households: Array<{ household_id: number; household_name: string }>;
}> {
  const res = await fetch(`${API_URL}/household/mine`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch households: ${res.status}`);
  return res.json();
}

// Build headers with the stored JWT token attached; throws if no token is found
async function authHeaders(withBody = false): Promise<Record<string, string>> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (withBody) headers["Content-Type"] = "application/json";
  return headers;
}

// Get all features for a household, with each feature's tasks nested inside
// This is the main data-loading call the list view makes on mount
export async function fetchHouseholdFeatures(householdId: number) {
  const res = await fetch(`${API_BASE}/household/${householdId}/features`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch features: ${res.status}`);
  return res.json();
}

export async function fetchHouseholdRooms(householdId: number): Promise<HouseholdRoom[]> {
  const res = await fetch(`${API_BASE}/household/${householdId}/rooms`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch rooms: ${res.status}`);
  return res.json();
}

export async function createHouseholdRoom(data: {
  household_id: number;
  room_name: string;
  accent_color?: string | null;
}): Promise<{ room_id: number }> {
  const res = await fetch(`${API_BASE}/household/${data.household_id}/rooms`, {
    method: "POST",
    headers: await authHeaders(true),
    body: JSON.stringify({
      room_name: data.room_name,
      accent_color: data.accent_color,
    }),
  });
  if (!res.ok) throw new Error(`Failed to create room: ${res.status}`);
  return res.json();
}

export async function updateHouseholdRoom(
  roomId: number,
  data: { room_name?: string; accent_color?: string | null }
): Promise<void> {
  const res = await fetch(`${API_BASE}/room/${roomId}`, {
    method: "PUT",
    headers: await authHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update room: ${res.status}`);
}

export async function deleteHouseholdRoom(roomId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/room/${roomId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete room: ${res.status}`);
}

// Create a new feature (section/room) under a household
// Returns the new feature_id from the database so we can use it locally
export async function createFeature(data: {
  household_id: number;
  feature_name: string;
  feature_type?: string;
  x_pos?: number;
  y_pos?: number;
  z_pos?: number;
  icon?: string;
  room_id?: number | null;
}): Promise<{ feature_id: number }> {
  const res = await fetch(`${API_BASE}/feature`, {
    method: "POST",
    headers: await authHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create feature: ${res.status}`);
  return res.json();
}

// Update a feature (only send the fields we want to change)
// e.g. just { feature_name: "New Name" } for a rename
export async function updateFeature(
  featureId: number,
  data: {
    feature_name?: string;
    feature_type?: string;
    x_pos?: number;
    y_pos?: number;
    z_pos?: number;
    icon?: string;
    room_id?: number | null;
    scale?: number,
    rotation_y?: number,
  }
): Promise<void> {
  const res = await fetch(`${API_BASE}/feature/${featureId}`, {
    method: "PUT",
    headers: await authHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update feature: ${res.status}`);
}

// Clear a feature's position data
export async function clearFeaturePosition(featureId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/feature/position/${featureId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to clear feature position data: ${res.status}`);
}

// Delete a feature and all its tasks (cascade delete happens in the DB)
export async function deleteFeature(featureId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/feature/${featureId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete feature: ${res.status}`);
}

// Create a new task under a featuredata
// Defaults visibility to "household" if not specified
// Returns the new task_id so we can track it locally
export async function createTask(data: {
  feature_id: number;
  task_name: string;
  frequency_days: number;
  visibility?: string;
  created_by_account_id?: number | null;
  icon?: string;
  last_completed:  string | null;
}): Promise<{ task_id: number }> {
  const res = await fetch(`${API_BASE}/task`, {
    method: "POST",
    headers: await authHeaders(true),
    body: JSON.stringify({
      ...data,
      visibility: data.visibility || "household",
    }),
  });
  if (!res.ok) throw new Error(`Failed to create task: ${res.status}`);
  return res.json();
}

// Update task name, frequency, visibility, and optionally icon
export async function updateTask(
  taskId: number,
  data: {
    task_name: string;
    frequency_days: number;
    visibility: string;
    icon?: string;
  }
): Promise<void> {
  const res = await fetch(`${API_BASE}/task/${taskId}`, {
    method: "PUT",
    headers: await authHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update task: ${res.status}`);
}

// Delete a task by its id
export async function deleteTask(taskId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/task/${taskId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`);
}

// Mark a task as completed -- sets last_completed to right now on the server
// The health bar will reset to 100% after this
export async function completeTask(taskId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/task/${taskId}/complete`, {
    method: "POST",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to complete task: ${res.status}`);
}
