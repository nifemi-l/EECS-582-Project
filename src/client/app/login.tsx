/* PROLOGUE
File name: login.tsx
Description: Provide a login screen UI that accepts user credentials and navigates to the home page
Programmers: Logan Smith, Nifemi Lawal
Creation date: 2/14/26
Revision date:
  - 3/29/26: Replace hardcoded localhost URL with EXPO_PUBLIC_API_URL env variable
  - 4/9/26: Add AuthGuard to protect the screen and redirect unauthenticated users to login
  - 4/10/26: Add alert on successful registration redirect to login
  - 4/12/26: Login errors show on the page; you can send the form from the keyboard with enter/return key
Preconditions: A React application requesting the login screen route ("/login")
Postconditions: A login screen component is ready for rendering; on sign-in, user is navigated to /home
Errors: None
Side effects: Navigation occurs when the user presses Sign In; local component state updates as user types
Invariants: None
Known faults: Login not storing data until backend database is established.
*/

// Imports
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { saveToken } from "../utils/authStorage";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Local state for the email and password text boxes
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const { registered } = useLocalSearchParams();
  const passwordRef = useRef<TextInput>(null);

  // Show success message if redirected from registration
  useEffect(() => {
    if (registered === "true") {
      Alert.alert("Success", "Account created successfully. Please log in.");
    }
  }, [registered]);

  // Runs when the user presses the Sign In button
  async function handleLogin() {
    setAuthError(null);
    if (!email || !password) {
      Alert.alert("Missing fields", "Please enter your email and password.");
      return;
    }

    // Email format validation (simple regex)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password,
        }),
      });

      // Parse the JSON response from the server, which should contain a token if login is successful
      const data = await response.json();

      if (!response.ok) {
        setAuthError(
          typeof data?.error === "string" && data.error.trim()
            ? data.error.trim()
            : "Invalid email or password."
        );
        return;
      }

      const token = data.token;

      if (!token) {
        setAuthError("Invalid email or password.");
        return;
      }

      try {
        await saveToken(token);
      } catch {
        Alert.alert("Error", "Failed to store authentication token.");
        return;
      }

      // Successful login
      router.replace("/home");

    } catch (error: any) {
      Alert.alert("Network Error", error.message ?? "Something went wrong.");
    }
  }

  return (
    // Outer container that centers everything on the screen
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Login</Text>

        {/* Email input field */}
        <TextInput
          placeholder="Email"
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => {
            if (email.trim() && password.trim()) void handleLogin();
            else passwordRef.current?.focus();
          }}
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setAuthError(null);
          }}
        />

        <TextInput
          ref={passwordRef}
          placeholder="Password"
          secureTextEntry
          style={styles.input}
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => {
            void handleLogin();
          }}
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setAuthError(null);
          }}
        />

        {authError ? (
          <View style={styles.authErrorBox} accessibilityRole="alert">
            <Text style={styles.authErrorText}>{authError}</Text>
          </View>
        ) : null}

        {/* Sign In button */}
        <Pressable style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Sign In</Text>
        </Pressable>

        {/* Navigation link to future Register page */}
        <Pressable onPress={() => router.push("/register")}>
          <Text style={styles.link}>Create account</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Styling for the screen
const styles = StyleSheet.create({
  // Full page background + center alignment
  page: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f4f4f4",
  },

  // The white login card
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

  // "Login" title text
  title: {
    fontSize: 32,
    marginBottom: 24,
    textAlign: "center",
    fontWeight: "600",
  },

  // Input text boxes
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 14,
    marginBottom: 14,
    borderRadius: 8,
    width: "100%",
  },

  authErrorBox: {
    width: "100%",
    marginBottom: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#fff0f0",
    borderWidth: 1,
    borderColor: "#e8a0a0",
  },
  authErrorText: {
    color: "#7a1f1f",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "left",
  },

  // Sign In button styling
  button: {
    backgroundColor: "black",
    padding: 16,
    borderRadius: 8,
    marginTop: 6,
  },

  // Text inside the button
  buttonText: {
    color: "white",
    textAlign: "center",
    fontWeight: "600",
  },

  // "Create account" link text
  link: {
    marginTop: 18,
    textAlign: "center",
    color: "#333",
  },
});