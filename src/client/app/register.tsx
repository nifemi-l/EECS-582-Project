/* PROLOGUE
File name: register.tsx
Description: Provide a registration screen UI that collects username, email, and password verification for account creation
Programmer: Logan Smith
Creation date: 2/14/26
Revision date: N/A
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

export default function RegisterScreen() {
  // Local state for the form fields
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password1, setPassword1] = useState("");
  const [password2, setPassword2] = useState("");

  // Runs when the user presses the Create Account button
  function handleRegister() {
    // Basic check: passwords must match
    if (password1 !== password2) {
      Alert.alert("Passwords do not match", "Please re-enter your passwords.");
      return;
    }

    // TODO (backend):
    // POST /api/auth/register
    // send username + email + password to server
    // server stores user in database
    // server returns auth token/session

    // For now: pretend success and return to login
    router.replace("/login");
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

        <Pressable style={styles.button} onPress={handleRegister}>
          <Text style={styles.buttonText}>Create Account</Text>
        </Pressable>

        <Pressable onPress={() => router.replace("/login")}>
          <Text style={styles.link}>Back to login</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // centers everything on the screen
  page: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f4f4f4",
  },

  // the white register box
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
