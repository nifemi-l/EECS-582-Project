/* PROLOGUE
File name: api.ts
Description: Helper functions for making API calls to the Flask backend.
             Each function wraps a single REST endpoint and handles the fetch + error checking.
             Used by list.tsx to talk to the database instead of using local AsyncStorage.
Programmer: Nifemi Lawal
Creation date: 3/29/26
Preconditions: Flask server must be running on localhost:8000
Postconditions: Returns parsed JSON from the server or throws on failure
Errors: Throws an Error with the HTTP status if the response is not ok
Side effects: None (all side effects happen on the server)
Invariants: None
Known faults: Hardcoded to localhost, won't work on a real device without changing the URL
*/

// Base URL for the Flask backend (all routes are under /api)
const API_BASE = "http://localhost:8000/api";

// Get all features for a household, with each feature's tasks nested inside
// This is the main data-loading call the list view makes on mount
export async function fetchHouseholdFeatures(householdId: number) {
  const res = await fetch(`${API_BASE}/household/${householdId}/features`);
  if (!res.ok) throw new Error(`Failed to fetch features: ${res.status}`);
  return res.json();
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
}): Promise<{ feature_id: number }> {
  const res = await fetch(`${API_BASE}/feature`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  }
): Promise<void> {
  const res = await fetch(`${API_BASE}/feature/${featureId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update feature: ${res.status}`);
}

// Delete a feature and all its tasks (cascade delete happens in the DB)
export async function deleteFeature(featureId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/feature/${featureId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete feature: ${res.status}`);
}

// Create a new task under a feature
// Defaults visibility to "household" if not specified
// Returns the new task_id so we can track it locally
export async function createTask(data: {
  feature_id: number;
  task_name: string;
  frequency_days: number;
  visibility?: string;
  created_by_account_id?: number | null;
  icon?: string;
}): Promise<{ task_id: number }> {
  const res = await fetch(`${API_BASE}/task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update task: ${res.status}`);
}

// Delete a task by its id
export async function deleteTask(taskId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/task/${taskId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`);
}

// Mark a task as completed -- sets last_completed to right now on the server
// The health bar will reset to 100% after this
export async function completeTask(taskId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/task/${taskId}/complete`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to complete task: ${res.status}`);
}
