/* PROLOGUE
File name: encryptedApi.ts
Description: Encrypted wrappers for Feature and Task management. 
             Handles client-side encryption before sending data to the Pi.
*/

import { getToken } from "../utils/authStorage";
import { encryptData, decryptData } from "../utils/encryptionUtils";

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const API_BASE = `${API_URL}/api`;

async function authHeaders(withBody = false): Promise<Record<string, string>> {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (withBody) headers["Content-Type"] = "application/json";
    return headers;
}

// Inside encryptedApi.ts
export async function fetchHouseholdFeatures(householdId: number) {
    const res = await fetch(`${API_BASE}/household/${householdId}/features`, {
        headers: await authHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to fetch features: ${res.status}`);

    const features = await res.json();

    // Correctly await the entire mapping process
    return Promise.all(
        features.map(async (f: any) => {
            const decryptedFeatureName = await decryptData(f.feature_name);
            
            // Only decrypt type if it exists and looks like ciphertext
            const decryptedFeatureType = (f.feature_type && f.feature_type.length > 10) 
                ? await decryptData(f.feature_type) 
                : "";

            const decryptedTasks = await Promise.all(
                (f.tasks || []).map(async (t: any) => ({
                    ...t,
                    task_name: await decryptData(t.task_name),
                })),
            );

            return {
                ...f,
                feature_name: decryptedFeatureName,
                feature_type: decryptedFeatureType,
                tasks: decryptedTasks,
            };
        }),
    );
}

export const makeHouseholdJoinCodeSimple = (length: number = 8): string => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length }, () =>
        alphabet.charAt(Math.floor(Math.random() * alphabet.length)),
    ).join("");
};

export async function createHousehold(
    token: string | null,
    name: string,
) {

    const encrypted_name = await encryptData(name);
    const join_code = makeHouseholdJoinCodeSimple();
    const join_code_enc = await encryptData(join_code);

    console.log(encrypted_name)
      const response = await fetch(`${API_URL}/household/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },

        // Parse the backend response body
        body: JSON.stringify({ name: encrypted_name.ciphertext, join_code: join_code_enc.ciphertext }),
      });
      return {response, join_code};
}

// --- FEATURE FUNCTIONS ---

export async function createFeature(data: {
    household_id: number;
    feature_name: string;
    feature_type: string;
    x_pos: number;
    y_pos: number;
    z_pos: number;
    icon?: string;
}) {
    const encName = await encryptData(data.feature_name);
    console.log("CREATNIG FEATURE");
    const encType = await encryptData(data.feature_type);

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
