/* PROLOGUE
File name: useAuthGuard.tsx
Description: Provides a React hook and loading screen for authentication guarding.
Programmers: Logan Smith
Creation date: 4/9/26
Revision date: N/A
Preconditions: A React component calls the useAuthGuard hook to protect its content and redirect unauthenticated users to the login screen.
Postconditions: The hook returns the authentication status and whether it's still checking, allowing the component to conditionally render content or a loading screen.
Side effects: None
Invariants: None
Known faults: None
*/

// Imports
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { getToken, clearToken } from "../utils/authStorage";

// Returns true if the JWT token is expired or cannot be decoded
function isTokenExpired(token: string): boolean {
  try {

    // Split the JWT into header, payload, and signature
    const parts = token.split(".");

    // Treat the token as invalid if it does not have exactly three parts
    if (parts.length !== 3) return true;

    // Convert the payload from base64url format to standard base64 format
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");

    // Add '=' padding until the payload length is a multiple of 4
    while (payload.length % 4 !== 0) payload += "=";

    // Decode the payload string into plain text
    const decoded = Platform.OS === "web"
      ? atob(payload)
      : global.atob?.(payload) ?? atob(payload);

    // Parse the decoded payload text into a JavaScript object
    const parsed = JSON.parse(decoded);

    // Treat the token as valid if it does not include an expiration time
    if (!parsed.exp) return false;

    // Compare the token expiration time to the current time
    return Date.now() / 1000 > parsed.exp;
  } catch {
    // Treat the token as expired if decoding or parsing fails
    return true;
  }
}

// Check whether the user has a valid saved auth token and redirect if not
export function useAuthGuard() {

  // Get the router instance for redirecting unauthenticated users
  const router = useRouter();

  // Track whether the authentication check is still in progress
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Track whether the user has been confirmed as authenticated
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Run the authentication check when this hook is first used
  useEffect(() => {
    async function checkAuth() {
      try {
        
        // Get the saved auth token from storage
        const token = await getToken();

        // Redirect to login if no token exists
        if (!token) {
          setIsAuthenticated(false);
          setIsCheckingAuth(false);
          router.replace("/login");
          return;
        }

        // Clear the token and redirect if it exists but has expired
        if (isTokenExpired(token)) {
          await clearToken();
          setIsAuthenticated(false);
          setIsCheckingAuth(false);
          router.replace("/login");
          return;
        }

        // Mark the user as authenticated if a valid token exists
        setIsAuthenticated(true);
        setIsCheckingAuth(false);
      } catch {
        // Treat any storage or parsing failure as unauthenticated
        setIsAuthenticated(false);
        setIsCheckingAuth(false);
        router.replace("/login");
      }
    }

    // Start checking the user's authentication status
    checkAuth();
  }, [router]);

  // Return the current authentication check state to the screen
  return { isCheckingAuth, isAuthenticated };
}

// Show a loading screen while authentication is being checked
export function AuthLoadingScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3B6DB5" />
      <Text style={styles.text}>Checking your session...</Text>
    </View>
  );
}

// Define the styles used by the authentication loading screen
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F2F5",
    gap: 14,
  },
  text: {
    fontSize: 16,
    color: "#5B6B7F",
    fontWeight: "600",
  },
});
