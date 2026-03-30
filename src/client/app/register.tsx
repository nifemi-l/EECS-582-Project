/* PROLOGUE
File name: register.tsx
Description: Provide a registration screen UI that collects username, email, and password verification for account creation
Programmers: Logan Smith, Nifemi Lawal
Creation date: 2/14/26
Revision date:
  - 3/29/26: Replace hardcoded localhost URL with EXPO_PUBLIC_API_URL env variable
Preconditions: A React application requesting the register screen route ("/register")
Postconditions: A registration screen component is ready for rendering; successful registration flow can route back to login (temporary)
Errors: None
Side effects: None
Invariants: None
Known faults: Backend persistence is not implemented yet; registration does not store user data.
*/


import { View, Text, TextInput, Pressable, StyleSheet, Alert } from "react-native";
import { router } from "expo-router";
import { useState } from "react";
import { saveToken } from "../utils/authStorage";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function RegisterScreen() {

  const [username, setUsername] = useState(""); // Stores the entered username for account creation
  const [email, setEmail] = useState(""); // Stores the entered email for account creation
  const [password1, setPassword1] = useState(""); // Stores the first password field value
  const [password2, setPassword2] = useState(""); // Stores the confirm password field value
  const [loading, setLoading] = useState(false); // Tracks whether the register request is currently running

  async function handleRegister() {
    // Block if the password and confirm password fields do not match
    if (password1 !== password2) {
      Alert.alert("Passwords do not match", "Please re-enter your passwords.");
      return;
    }

    // Block if any required field is missing
    if (!username || !email || !password1) {
      Alert.alert("Missing fields", "Please fill out all fields.");
      return;
    }

    // Disable repeated submits while the request is in progress
    setLoading(true);

    try {
      // Send a request to create the user's account in the backend
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
          // Send login credentials as JSON
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(), // Trim username so accidental spaces are not stored
          email: email.trim().toLowerCase(), // Normalize email for consistency in the database
          password: password1, // Send the confirmed password as the account password
        }),
      });

      // Parse the backend response body
      const data = await response.json();

      // If registration failed, show the backend error and stop
      if (!response.ok) {
        Alert.alert("Registration Failed", data.error || "Unknown error");
        setLoading(false);
        return;
      }

      // After successful registration, auto-login to keep user in auth state
      const loginResponse = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          // Send login credentials as JSON
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(), // Use the same normalized email format for login
          password: password1, // Use the password the user just created
        }),
      });

      // Parse the login response body
      const loginData = await loginResponse.json();

      // If login fails after account creation, send the user to the login screen manually
      if (!loginResponse.ok || !loginData.token) {
        Alert.alert("Success", "Account created. Please log in.");
        router.replace("/login");
        return;
      }

      // Save the returned JWT locally so the user stays authenticated
      await saveToken(loginData.token);

      // Notify the user and move them into the authenticated home screen
      Alert.alert("Success", "Account created and logged in!");
      router.replace("/home");

    } catch (error: any) {
      // Catch network/server errors that prevent the request from completing
      Alert.alert("Network Error", error.message);
    } finally {
      // Always reset loading state when the flow finishes
      setLoading(false);
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Create Account</Text>

        {/* Username */}
        <TextInput
          placeholder="Username"
          style={styles.input}
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
        />

        {/* Email */}
        <TextInput
          placeholder="Email"
          style={styles.input}
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        {/* Password */}
        <TextInput
          placeholder="Password"
          secureTextEntry
          style={styles.input}
          value={password1}
          onChangeText={setPassword1}
        />

        {/* Confirm Password */}
        <TextInput
          placeholder="Confirm Password"
          secureTextEntry
          style={styles.input}
          value={password2}
          onChangeText={setPassword2}
        />

        {/* Main action button that submits the register flow */}
        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? "Creating..." : "Create Account"}</Text>
        </Pressable>

         {/* Link back to the login screen for users who already have an account */}
        <Pressable onPress={() => router.replace("/login")}>
          <Text style={styles.link}>Back to login</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f4f4f4",
  },

  card: {
    width: "90%",
    maxWidth: 420,
    backgroundColor: "white",
    padding: 28,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },

  title: {
    fontSize: 28,
    marginBottom: 22,
    textAlign: "center",
    fontWeight: "600",
  },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 14,
    marginBottom: 14,
    borderRadius: 8,
    width: "100%",
  },

  button: {
    backgroundColor: "black",
    padding: 16,
    borderRadius: 8,
    marginTop: 6,
  },

  buttonDisabled: {
    backgroundColor: "#888",
  },

  buttonText: {
    color: "white",
    textAlign: "center",
    fontWeight: "600",
  },

  link: {
    marginTop: 18,
    textAlign: "center",
    color: "#333",
  },
});
