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

  const ciphertext = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
  const iv = DEFAULT_IV;

  const key = await getKey();

  const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv}, key, ciphertext);
  
  return new TextDecoder().decode(decrypted);
};

