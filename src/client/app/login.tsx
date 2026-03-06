/* PROLOGUE
File name: login.tsx
Description: Provide a login screen UI that accepts user credentials and navigates to the home page
Programmer: Logan Smith
Creation date: 2/14/26
Revision date: N/A
Preconditions: A React application requesting the login screen route ("/login")
Postconditions: A login screen component is ready for rendering; on sign-in, user is navigated to /home
Errors: None
Side effects: Navigation occurs when the user presses Sign In; local component state updates as user types
Invariants: None
Known faults: Login not storing data until backend database is established.
*/


import { View, Text, TextInput, Pressable, StyleSheet, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useState, useEffect } from "react";

// Local state for the email and password text boxes
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { registered } = useLocalSearchParams();

  // Show success message if redirected from registration
  useEffect(() => {
    if (registered === "true") {
      Alert.alert("Success", "Account created successfully. Please log in.");
    }
  }, [registered]);

  // Runs when the user presses the Sign In button
  async function handleLogin() {
    if (!email || !password) {
      Alert.alert("Missing fields", "Please enter your email and password.");
      return;
    }

    try {
      const response = await fetch("http://localhost:8000/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert("Login Failed", data.error || "Invalid credentials");
        return;
      }

      // Successful login
      router.replace("/home");

    } catch (error: any) {
      Alert.alert("Network Error", error.message);
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
          value={email}
          onChangeText={setEmail}
        />
        
        {/* Password input field */}
        <TextInput
          placeholder="Password"
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />

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