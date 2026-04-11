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

const encoder = new TextEncoder();

// Creates the SHA-256 string to send to your Python API
export const getSessionPassword = async (password: string) => {
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(password));
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
};

// Turns password + salt into a 256-bit AES key
export const deriveKey = async (password: string ) => {
  const passwordKey = await window.crypto.subtle.importKey(
    "raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    { name: "PBKDF2", iterations: 100000, hash: "SHA-256" },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false, ["encrypt", "decrypt"]
  );
};

// ENCRYPT / DECRYPT
export const encryptData = async (plainText: string) => {
  const password = window.sessionStorage.getItem('vault_secret');
  if (!password) throw new Error("Vault is locked");

  const key = await deriveKey(password);

  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM" }, key, encoder.encode(plainText)
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
  };
};

export const decryptData = async (ciphertextB64: string) => {
  const password = window.sessionStorage.getItem('vault_secret');
  if (!password) throw new Error("Vault is locked");

  const ciphertext = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));

  const key = await deriveKey(password);
  const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", }, key, ciphertext);
  
  return new TextDecoder().decode(decrypted);
};

