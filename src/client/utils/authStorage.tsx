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
const CRYPTO_KEY_NAME = "cryptokey"

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

// Store Encryption Key
export async function saveKey(keyPromise: Promise<CryptoKey>): Promise<void> {

    const key = await keyPromise;

    if (Platform.OS === "web") {
        const exported = await window.crypto.subtle.exportKey("raw", key);

        const base64Key = btoa(String.fromCharCode(...new Uint8Array(exported)));

        await AsyncStorage.setItem(CRYPTO_KEY_NAME, base64Key);
    } else {
        const exported = await window.crypto.subtle.exportKey("raw", key);
        const base64Key = btoa(String.fromCharCode(...new Uint8Array(exported)));

        await SecureStore.setItemAsync(CRYPTO_KEY_NAME, base64Key);
    }
}

// Retrieve Encryption Key
export async function getKey(): Promise<CryptoKey > {
  let stored: string | null;
  
  if (Platform.OS === "web") {
    stored = await AsyncStorage.getItem(CRYPTO_KEY_NAME);
  } else {
    stored = await SecureStore.getItemAsync(CRYPTO_KEY_NAME);
  }

  if (!stored) throw Error("Couldn't retreive crypto key");

  try {
    const binaryString = atob(stored);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return await window.crypto.subtle.importKey(
      "raw",
      bytes,
      { name: "AES-GCM" },
      true, 
      ["encrypt", "decrypt"]
    );
  } catch (error) {
    console.error("Failed to re-import crypto key:", error);
    throw error;
  }
}

// Delete Encryption Key
export async function clearKey(): Promise<void> {
    if (Platform.OS === "web") {
        await AsyncStorage.removeItem(CRYPTO_KEY_NAME);
    } else {
        await SecureStore.deleteItemAsync(CRYPTO_KEY_NAME);
    }
}
