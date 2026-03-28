/* PROLOGUE
File name: authStorage.ts
Description: Provide cross-platform token storage utilities for authentication (mobile uses Expo SecureStore; web uses AsyncStorage fallback).
Programmer: Logan Smith
Creation date: 3/1/26
Revision date: 
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