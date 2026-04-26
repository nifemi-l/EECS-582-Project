/* PROLOGUE
File name: encryptedApi.ts
Description: Encrypted wrappers for Feature and Task management. 
             Handles client-side encryption before sending data to the Pi.
*/

import { authHeaders } from "./api"
import { getToken } from "../utils/authStorage";
import { encryptData, decryptData, decryptFromJson } from "../utils/encryptionUtils";

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const API_BASE = `${API_URL}/api`;

export async function fetchMyHouseholds(): Promise<{
  households: Array<{ household_id: number; household_name: string }>;
}> {
  const res = await fetch(`${API_URL}/household/mine`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch households: ${res.status}`);
  return await decryptFromJson(await res.json());
}



// Get all features for a household, with each feature's tasks nested inside
// This is the main data-loading call the list view makes on mount
export async function fetchHouseholdFeatures(householdId: number) {
  const res = await fetch(`${API_BASE}/household/${householdId}/features`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch features: ${res.status}`);
  return await decryptFromJson(await res.json())
}

export async function fetchHouseholdRooms(householdId: number): Promise<HouseholdRoom[]> {
  const res = await fetch(`${API_BASE}/household/${householdId}/rooms`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch rooms: ${res.status}`);
  return await decryptFromJson(await res.json());
}

// // Inside encryptedApi.ts
// export async function fetchHouseholdFeatures(householdId: number) {
//     const res = await fetch(`${API_BASE}/household/${householdId}/features`, {
//         headers: await authHeaders(),
//     });
//     if (!res.ok) throw new Error(`Failed to fetch features: ${res.status}`);
//
//     const features = await res.json();
//
//     // Correctly await the entire mapping process
//     return Promise.all(
//         features.map(async (f: any) => {
//             const decryptedFeatureName = await decryptData(f.feature_name);
//
//             // Only decrypt type if it exists and looks like ciphertext
//             const decryptedFeatureType = (f.feature_type && f.feature_type.length > 10) 
//                 ? await decryptData(f.feature_type) 
//                 : "";
//
//             const decryptedTasks = await Promise.all(
//                 (f.tasks || []).map(async (t: any) => ({
//                     ...t,
//                     task_name: await decryptData(t.task_name),
//                 })),
//             );
//
//             return {
//                 ...f,
//                 feature_name: decryptedFeatureName,
//                 feature_type: decryptedFeatureType,
//                 tasks: decryptedTasks,
//             };
//         }),
//     );
// }

export async function makeHouseholdJoinCodeSimple (length: number = 8): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed ambiguous O, 0, I, 1
  const bytes = new Uint32Array(length);
  
  // Fills the array with cryptographically strong random numbers
  window.crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => 
    alphabet.charAt(byte % alphabet.length)
  ).join("");
};

export async function createHousehold(
    token: string | null,
    name: string,
) {

    const encrypted_name = await encryptData(name);

      const response = await fetch(`${API_URL}/household/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },

        // Parse the backend response body
        body: JSON.stringify({ name: encrypted_name.ciphertext}),
      });

      const body = await response.json();

    return {
        ok: response.ok,
        status: response.status,
        data: body,
        join_code: join_code // The cleartext code for the UI
    };}

// --- FEATURE FUNCTIONS ---

export async function createFeature(data: {
    household_id: number;
    feature_name: string;
    feature_type: string;
    x_pos?: number;
    y_pos?: number;
    z_pos?: number;
    icon?: string;
    room_id?: number | null;
}) {
    const encName = await encryptData(data.feature_name);
    console.log("CREATNIG FEATURE");
    const encType = await encryptData(data.feature_type);
    console.log(data.room_id)

    const res = await fetch(`${API_BASE}/feature`, {
        method: "POST",
        headers: await authHeaders(true),
        body: JSON.stringify({
            household_id: data.household_id,
            feature_name: encName.ciphertext,
            feature_type: encType.ciphertext,
            x_pos: data.x_pos,
            y_pos: data.y_pos,
            z_pos: data.z_pos,
            icon: data.icon,
            room_id: data.room_id,
        }),
    });
    return res.json();
}

export async function updateFeature(
    featureId: number,
    data: { feature_name?: string },
) {
    let payload: any = {};

    if (data.feature_name) {
        const enc = await encryptData(data.feature_name);
        payload.feature_name = enc.ciphertext;
    }

    const res = await fetch(`${API_BASE}/feature/${featureId}`, {
        method: "PUT",
        headers: await authHeaders(true),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Update failed");
}

// --- TASK FUNCTIONS ---

export async function createTask(data: {
    feature_id: number;
    task_name: string;
    frequency_days: number;
    visibility?: string;
    icon?: string;
}) {
    const enc = await encryptData(data.task_name);

    const res = await fetch(`${API_BASE}/task`, {
        method: "POST",
        headers: await authHeaders(true),
        body: JSON.stringify({
            feature_id: data.feature_id,
            task_name: enc.ciphertext,
            frequency_days: data.frequency_days,
            visibility: data.visibility || "household",
            icon: data.icon,
        }),
    });
    return res.json();
}

export async function updateTask(
    taskId: number,
    data: { task_name?: string; frequency_days?: number },
) {
    let payload: any = { ...data };

    if (data.task_name) {
        const enc = await encryptData(data.task_name);
        payload.task_name = enc.ciphertext;
    }

    const res = await fetch(`${API_BASE}/task/${taskId}`, {
        method: "PUT",
        headers: await authHeaders(true),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Update failed");
}

export async function createHouseholdRoom(data: {
  household_id: number;
  room_name: string;
  accent_color?: string | null;
}): Promise<{ room_id: number }> {
    const room_name_encrypted = await encryptData(data.room_name);

  const res = await fetch(`${API_BASE}/household/${data.household_id}/rooms`, {
    method: "POST",
    headers: await authHeaders(true),
    body: JSON.stringify({
      room_name: room_name_encrypted.ciphertext,
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
    let payload : any = {...data}

    if (data.room_name){
        const room_name_encrypted = await encryptData(data.room_name)
        payload.room_name = room_name_encrypted.ciphertext;
    }

  const res = await fetch(`${API_BASE}/room/${roomId}`, {
    method: "PUT",
    headers: await authHeaders(true),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update room: ${res.status}`);
}
