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
  - 4/19/26: Major UI overhaul: split layout with background image panel, polished form card, icons, password toggle
Preconditions: A React application requesting the login screen route ("/login")
Postconditions: A login screen component is ready for rendering; on sign-in, user is navigated to /home
Errors: None
Side effects: Navigation occurs when the user presses Sign In; local component state updates as user types
Invariants: None
Known faults: None.
*/

// Imports
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Image, Platform, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { saveToken } from "../utils/authStorage";
import { navy } from "../theme/colors";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Brand blue used throughout the login form
const BRAND_BLUE = "#3B6DB5";
const BUTTON_GRADIENT = ["#3B6DB5", "#5B8AD4"] as const;
const BUTTON_GRADIENT_HOVER = ["#2F5494", "#4A7ABF"] as const;

// Local state for the email and password text boxes
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [hoverSignIn, setHoverSignIn] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const { registered } = useLocalSearchParams();
  const passwordRef = useRef<TextInput>(null);
  const { width: windowWidth } = useWindowDimensions();

  // Responsive breakpoints matching home.tsx patterns
  const isWide = windowWidth > 860;
  const isCompact = windowWidth < 480;

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
      // Send a POST request to the server with the email and password
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Trim and lowercase the email to ensure consistent formatting; password is sent as-is
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password,
        }),
      });

      // Parse the JSON response from the server, which should contain a token if login is successful
      const data = await response.json();

      // If the response is not OK, display an error message. The server may provide a specific error message in data.error, but if not, show a generic message.
      if (!response.ok) {
        setAuthError(
          typeof data?.error === "string" && data.error.trim()
            ? data.error.trim()
            : "Invalid email or password."
        );
        return;
      }

      // Extract the token from the response data
      const token = data.token;

      // If no token is present, treat it as a login failure and show an error message
      if (!token) {
        setAuthError("Invalid email or password.");
        return;
      }

      try {
        // Save the token using the utility function, which likely stores it in secure storage for future authenticated requests. If this fails, show an alert and do not proceed with navigation.
        await saveToken(token);
      } catch {
        // If there's an error saving the token, alert the user. This is a critical failure since we won't be able to authenticate future requests without the token.
        Alert.alert("Error", "Failed to store authentication token.");
        return;
      }

      // Successful login
      router.replace("/home");

    } catch (error: any) {
      // If there's a network error or some other issue with the fetch request, catch it and show an alert to the user. The error message may be provided by the error object, but if not, show a generic message.
      Alert.alert("Network Error", error.message ?? "Something went wrong.");
    }
  }

  // -- Shared form card (used in both wide and narrow layouts) --
  const formCard = (
    <View style={[styles.formCardWrapper, !isWide && styles.formCardWrapperNarrow]}>
      <View style={[styles.card, isCompact && styles.cardCompact]}>
        {/* House icon badge */}
        <View style={styles.iconBadge}>
          <MaterialCommunityIcons name="home" size={28} color="#FFFFFF" />
        </View>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>
          Sign in to manage your household{"\n"}and stay on top of tasks.
        </Text>

        {/* Email field */}
        <Text style={styles.inputLabel}>Email</Text>
        <View style={[styles.inputRow, isEmailFocused && styles.inputRowFocused]}>
          <MaterialCommunityIcons name="email-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            placeholder="Enter your email"
            placeholderTextColor="#9CA3AF"
            style={[styles.inputField, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onFocus={() => setIsEmailFocused(true)}
            onBlur={() => setIsEmailFocused(false)}
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
        </View>

        {/* Password field */}
        <Text style={styles.inputLabel}>Password</Text>
        <View style={[styles.inputRow, isPasswordFocused && styles.inputRowFocused]}>
          <MaterialCommunityIcons name="lock-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            ref={passwordRef}
            placeholder="Enter your password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!showPassword}
            style={[styles.inputField, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]}
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onFocus={() => setIsPasswordFocused(true)}
            onBlur={() => setIsPasswordFocused(false)}
            onSubmitEditing={() => {
              void handleLogin();
            }}
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setAuthError(null);
            }}
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeButton}>
            <MaterialCommunityIcons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color="#9CA3AF"
            />
          </Pressable>
        </View>

        {/* Auth error display */}
        {authError ? (
          <View style={styles.authErrorBox} accessibilityRole="alert">
            <Text style={styles.authErrorText}>{authError}</Text>
          </View>
        ) : null}

        {/* Sign In button */}
        <Pressable
          onPress={handleLogin}
          // @ts-ignore – web-only hover props
          onMouseEnter={Platform.OS === "web" ? () => setHoverSignIn(true) : undefined}
          // @ts-ignore
          onMouseLeave={Platform.OS === "web" ? () => setHoverSignIn(false) : undefined}
          style={{ marginTop: 8, width: "100%" }}
        >
          <LinearGradient
            colors={hoverSignIn ? [...BUTTON_GRADIENT_HOVER] : [...BUTTON_GRADIENT]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.signInButton}
          >
            <MaterialCommunityIcons name="lock-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.signInButtonText}>Sign In</Text>
          </LinearGradient>
        </Pressable>

        {/* Create account link */}
        <Pressable onPress={() => router.push("/register")} style={styles.createAccountRow}>
          <Text style={styles.createAccountText}>
            Don't have an account?{" "}
            <Text style={styles.createAccountLink}>Create account</Text>
          </Text>
        </Pressable>

        {/* Safety assurance */}
        <View style={styles.safeRow}>
          <MaterialCommunityIcons name="shield-check" size={16} color="#9CA3AF" />
          <Text style={styles.safeText}>Your data is safe with us.</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      {/* Navbar */}
      <View style={[styles.navbar, isCompact && styles.navbarCompact]}>
        <View style={styles.navLeft}>
          <View style={styles.logoBox}>
            <MaterialCommunityIcons name="home" size={isCompact ? 18 : 22} color="#FFFFFF" />
          </View>
          <Text style={[styles.navBrand, isCompact && styles.navBrandCompact]}>HomeSeeHome</Text>
        </View>
      </View>

      {/* Main content area */}
      {isWide ? (
        // Wide: full background image with overlaid content
        <View style={styles.fullBgContainer}>
          <Image
            source={require("../assets/images/login_background.png")}
            // @ts-ignore – objectFit/objectPosition are web-only CSS props
            style={[styles.bgImage, Platform.OS === "web" && { objectFit: "contain", objectPosition: "center bottom" }]}
          />
          {/* Gradient overlay to blend the top of the image into the background */}
          <LinearGradient
            colors={["#4A6FC7", "#4A6FC7", "transparent"]}
            locations={[0, 0.15, 0.55]}
            style={styles.bgGradientOverlay}
          />
          {/* Content overlay — text left, form right */}
          <View style={styles.overlayRow}>
            <View style={styles.leftContent}>
              <Text style={styles.heroTitle}>A clean home{"\n"}starts together.</Text>
              <Text style={styles.heroSubtitle}>
                Stay organized, assign tasks,{"\n"}and build better habits —{"\n"}all in one place.
              </Text>

              <View style={styles.featureList}>
                <View style={styles.featureRow}>
                  <View style={styles.featureIcon}>
                    <MaterialCommunityIcons name="account-group" size={20} color="#FFFFFF" />
                  </View>
                  <View>
                    <Text style={styles.featureBold}>Manage your household</Text>
                    <Text style={styles.featureDesc}>Keep everyone on the same page.</Text>
                  </View>
                </View>

                <View style={styles.featureRow}>
                  <View style={styles.featureIcon}>
                    <MaterialCommunityIcons name="checkbox-marked-outline" size={20} color="#FFFFFF" />
                  </View>
                  <View>
                    <Text style={styles.featureBold}>Stay on top of tasks</Text>
                    <Text style={styles.featureDesc}>Create, assign, and track progress.</Text>
                  </View>
                </View>

                <View style={styles.featureRow}>
                  <View style={styles.featureIcon}>
                    <MaterialCommunityIcons name="shield-check" size={20} color="#FFFFFF" />
                  </View>
                  <View>
                    <Text style={styles.featureBold}>Build better habits</Text>
                    <Text style={styles.featureDesc}>Celebrate a clean, happy home.</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.rightContent}>
              {formCard}
            </View>
          </View>
        </View>
      ) : (
        // Narrow: form over subtle background
        <View style={styles.narrowBody}>
          {formCard}
        </View>
      )}
    </View>
  );
}

// Styling for the screen
const styles = StyleSheet.create({
  // Root container
  screen: {
    flex: 1,
    backgroundColor: "#F0F2F5",
  },

  // -- Navbar --
  navbar: {
    height: 68,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    backgroundColor: navy,
  },
  navbarCompact: {
    height: 56,
    paddingHorizontal: 16,
  },
  navLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  navBrand: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  navBrandCompact: {
    fontSize: 17,
  },

  // -- Wide full-background layout --
  fullBgContainer: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#4A6FC7",
  },
  bgImage: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  bgGradientOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 0,
  },
  overlayRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    zIndex: 1,
  },
  leftContent: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 90,
    paddingLeft: "13%",
    paddingRight: 40,
  },
  rightContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingRight: "5%",
  },

  heroTitle: {
    fontSize: 54,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 64,
    marginBottom: 22,
    maxWidth: 520,
  },

  heroSubtitle: {
    fontSize: 19,
    color: "rgba(255,255,255,0.88)",
    lineHeight: 30,
    marginBottom: 34,
    maxWidth: 400,
  },

  featureList: {
    gap: 24,
    marginTop: 4,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.16)",
    justifyContent: "center",
    alignItems: "center",
  },
  featureBold: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 16,
    color: "rgba(255,255,255,0.82)",
  },


  // -- Narrow layout --
  narrowBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },

  // -- Form card --
  formCardWrapper: {
    width: "100%",
    maxWidth: 440,
    alignItems: "center",
  },
  formCardWrapperNarrow: {
    maxWidth: 420,
  },
  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 36,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    alignItems: "center",
  },
  cardCompact: {
    padding: 24,
    borderRadius: 16,
  },

  // House icon badge at top of card
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: BRAND_BLUE,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },

  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },

  // -- Input fields --
  inputLabel: {
    alignSelf: "flex-start",
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    marginBottom: 18,
    width: "100%",
  },
  inputRowFocused: {
    borderColor: BRAND_BLUE,
    backgroundColor: "#FFFFFF",
    shadowColor: BRAND_BLUE,
    shadowOpacity: 0.14,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    ...(Platform.OS === "web" ? { boxShadow: "0 0 0 4px rgba(59,109,181,0.16)" } : {}),
  },
  inputIcon: {
    marginLeft: 14,
  },
  inputField: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    fontSize: 15,
    color: "#1F2937",
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  // -- Auth error --
  authErrorBox: {
    width: "100%",
    marginBottom: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  authErrorText: {
    color: "#991B1B",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "left",
  },

  // -- Sign In button --
  signInButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: 10,
    width: "100%",
  },
  signInButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  // -- Create account --
  createAccountRow: {
    marginTop: 20,
  },
  createAccountText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  createAccountLink: {
    color: BRAND_BLUE,
    fontWeight: "600",
  },

  // -- Safety note --
  safeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
  },
  safeText: {
    marginLeft: 6,
    fontSize: 13,
    color: "#9CA3AF",
  },
});