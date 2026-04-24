/* PROLOGUE
File name: encryptionUtils.tsx
Description: Utilities for performing encryption of user data for database storage
Programmer: Delroy Wright
Creation date: 4/10/2026
Revision date: 
Preconditions: An Expo/React application that uses JWT authentication and needs to persist an auth token between app launches; required storage dependencies are installed.
Postconditions: An encryption key is created and available to be used.
Errors: None
Side effects: Creates an encryption key 
Invariants: 
Known faults: None
*/


// utils/crypto.ts
import {getKey} from "./authStorage"

const encoder = new TextEncoder();
const DEFAULT_SALT = new TextEncoder().encode("your-app-unique-static-salt");
const DEFAULT_IV = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);


// Turns password + salt into a 256-bit AES key
export const deriveKey = async (password: string ) => {
  const passwordKey = await window.crypto.subtle.importKey(
    "raw", encoder.encode(password), { name: "PBKDF2" }, true, ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: DEFAULT_SALT, iterations: 100000, hash: "SHA-256" },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    true, ["encrypt", "decrypt"]
  );
};

// ENCRYPT / DECRYPT
export const encryptData = async (plainText: string) => {
    const key = await getKey();
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: DEFAULT_IV }, key, encoder.encode(plainText)
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
  };
};

export const decryptData = async (ciphertextB64: string) => {
  if (!ciphertextB64) return "";

  try {
    // DEBUG: Look at the console to see what the Pi is actually sending
    console.log("Attempting decrypt on:", ciphertextB64.substring(0, 15));

    const ciphertext = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
    const key = await getKey();
    
    if (!key) throw new Error("Key missing from storage");

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: DEFAULT_IV }, 
      key, 
      ciphertext
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // This will tell us if it's an IV mismatch, a bad key, or bad Base64
    console.error("DECRYPTION CRASH:", e, "| Payload:", ciphertextB64);
    return `[DECRYPT_ERROR]`; 
  }
};

export const decryptFromJson = async (json: any): Promise<any> => {
  const encryptedFields = [
    "household_name", 
    "join_code", 
    "feature_name", 
    "feature_type", 
    "room_name", 
    "task_name"
  ];

  console.log("INPUT TO DECRYPT:", json)
  // 1. Handle Nulls/Primitives
  if (json === null || typeof json !== 'object') {
    return json;
  }

  // 2. Handle Arrays (recurse into each element)
  if (Array.isArray(json)) {
    return await Promise.all(json.map(item => decryptFromJson(item)));
  }

  // 3. Handle Objects
  const decryptedObj: any = {};

  for (const key in json) {
    if (Object.prototype.hasOwnProperty.call(json, key)) {
      const value = json[key];

      // If the key matches our list and it's a non-empty string
      if (encryptedFields.includes(key) && typeof value === 'string' && value.length > 0) {
        try {
          // Attempt decryption
          const clearText = await decryptData(value);
          decryptedObj[key] = clearText;
          
          console.log(`Decrypted ${key}:`, clearText);
        } catch (err) {
          console.error(`Failed to decrypt field [${key}]:`, err);
          decryptedObj[key] = "[DECRYPT_ERROR]";
        }
      } 
      // If it's a nested object or array (like the 'households' array)
      else if (value !== null && typeof value === 'object') {
        decryptedObj[key] = await decryptFromJson(value);
      } 
      // Plain values (IDs, dates, roles)
      else {
        decryptedObj[key] = value;
      }
    }
  }

  return decryptedObj;
  console.log(decryptedObj)
};
