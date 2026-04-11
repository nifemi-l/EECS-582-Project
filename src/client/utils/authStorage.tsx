/* PROLOGUE
File name: authStorage.ts
Description: Provide cross-platform token storage utilities for authentication (mobile uses Expo SecureStore; web uses AsyncStorage fallback).
Programmer: Logan Smith
Creation date: 3/1/26
Revision date: 
    - 4/10/26 Delroy Wright: Add storge of encryption key
Preconditions: An Expo/React application that uses JWT authentication and needs to persist an auth token between app launches; required storage dependencies are installed.
Postconditions: Utility functions are available for saving, retrieving, and clearing the auth token in a platform-appropriate storage backend.
Errors: None
Side effects: Writes, reads, or deletes the stored authentication token on the local device/browser.
Invariants: Token key name remains consistent across save/retrieve/delete operations to ensure reliable authentication persistence.
Known faults: None
*/

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "token";
const CRYPTO_KEY_NAME = "crypto";

// Store token
export async function saveToken(token: string): Promise<void> {
    if (Platform.OS === "web") {
        await AsyncStorage.setItem(TOKEN_KEY, token);
    } else {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
    }
}

// Retrieve token
export async function getToken(): Promise<string | null> {
    if (Platform.OS === "web") {
        return await AsyncStorage.getItem(TOKEN_KEY);
    } else {
        return await SecureStore.getItemAsync(TOKEN_KEY);
    }
}

// Delete token (logout)
export async function clearToken(): Promise<void> {
    if (Platform.OS === "web") {
        await AsyncStorage.removeItem(TOKEN_KEY);
    } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
}

// Save encryption key
export async function saveKey(keyPromise: Promise<CryptoKey>): Promise<void> {
    const key = await keyPromise;

    if (Platform.OS === "web") {
         // Export the key to a raw format (ArrayBuffer)
        const exported = await window.crypto.subtle.exportKey("raw", key);

        // Convert ArrayBuffer to a Base64 string for AsyncStorage
        const base64Key = btoa(String.fromCharCode(...new Uint8Array(exported)));

        await AsyncStorage.setItem(CRYPTO_KEY_NAME, base64Key);
    } else {
        // On Mobile, we do the same because SecureStore only takes strings
        const exported = await window.crypto.subtle.exportKey("raw", key);
        const base64Key = btoa(String.fromCharCode(...new Uint8Array(exported)));

        // SecureStore is hardware-encrypted on iOS/Android
        await SecureStore.setItemAsync(CRYPTO_KEY_NAME, base64Key);
    }
}

// Load encryption key
export async function loadKey(): Promise<CryptoKey | null> {
  const stored = Platform.OS === 'web' 
    ? await AsyncStorage.getItem(CRYPTO_KEY_NAME)
    : await SecureStore.getItemAsync(CRYPTO_KEY_NAME);

  if (!stored) return null;

  // Convert Base64 back to Uint8Array
  const rawKey = Uint8Array.from(atob(stored), c => c.charCodeAt(0));

  // Import it back into a CryptoKey object
  return await window.crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" }, // Use the same algorithm you used to create it
    true,
    ["encrypt", "decrypt"]
  );
}

// delete encryption key
export async function clearKey(): Promise<void> {
    if (Platform.OS === "web") {
        await AsyncStorage.removeItem(CRYPTO_KEY_NAME);
    } else {
        await SecureStore.deleteItemAsync(CRYPTO_KEY_NAME);
    }
}
