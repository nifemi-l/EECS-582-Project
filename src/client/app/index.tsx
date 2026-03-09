/* PROLOGUE
File name: index.tsx
Description: Provide the default landing route for the app by redirecting the user to the login screen
Programmer: Logan Smith
Creation date: 2/6/26
Revision date:
  - 2/14/26: Change index route to redirect to /login so authentication becomes the landing flow.
Preconditions: A React application requesting the default route ("/")
Postconditions: The user is redirected to the login screen route
Errors: If routing fails, the user may remain on the default route without navigation.
Side effects: Navigation to another route occurs immediately
Invariants: None
Known faults: None
*/


import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { getToken } from "./authStorage";

export default function Index() {
  useEffect(() => {
    async function checkAuth() {
      try {
        const token = await getToken();
        router.replace(token ? "/home" : "/login");
      } catch {
        // If storage fails for any reason, fall back to login
        router.replace("/login");
      }
    }

    checkAuth();
  }, []);

  // Simple loading indicator while we check storage
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" />
    </View>
  );
}