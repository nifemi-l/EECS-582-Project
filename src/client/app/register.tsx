/* PROLOGUE
File name: register.tsx
Description: Provide a registration screen UI that collects username, email, and password verification for account creation
Programmers: Logan Smith, Nifemi Lawal
Creation date: 2/14/26
Revision date:
  - 3/29/26: Replace hardcoded localhost URL with EXPO_PUBLIC_API_URL env variable
  - 4/10/26: Add alert invalid login credentials entered by user
  - 4/20/26: Redesign registration screen to match the polished full-background auth layout
Preconditions: A React application requesting the register screen route ("/register")
Postconditions: A registration screen component is ready for rendering; successful registration flow can route back to login or home
Errors: None
Side effects: Navigation occurs when the user completes registration or presses the sign-in link; local component state updates as user types
Invariants: None
Known faults: None
*/

import { View, Text, TextInput, Pressable, StyleSheet, Alert, Image, Platform, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { saveToken } from "../utils/authStorage";
import { navy } from "../theme/colors";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const BRAND_BLUE = "#3B6DB5";
const BUTTON_GRADIENT = ["#3B6DB5", "#5B8AD4"] as const;
const BUTTON_GRADIENT_HOVER = ["#2F5494", "#4A7ABF"] as const;

export default function RegisterScreen() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password1, setPassword1] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [hoverCreateAccount, setHoverCreateAccount] = useState(false);
  const [showPassword1, setShowPassword1] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [isUsernameFocused, setIsUsernameFocused] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPassword1Focused, setIsPassword1Focused] = useState(false);
  const [isPassword2Focused, setIsPassword2Focused] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const password1Ref = useRef<TextInput>(null);
  const password2Ref = useRef<TextInput>(null);
  const { width: windowWidth } = useWindowDimensions();

  const isWide = windowWidth > 860;
  const isCompact = windowWidth < 480;

  async function handleRegister() {
    setErrorMessage("");

    if (password1 !== password2) {
      setErrorMessage("Passwords do not match. Please re-enter your passwords.");
      return;
    }

    const missingFields = [];
    if (!username.trim()) missingFields.push("Name");
    if (!email.trim()) missingFields.push("Email");
    if (!password1) missingFields.push("Password");
    if (!password2) missingFields.push("Confirm Password");
    if (missingFields.length > 0) {
      setErrorMessage(`Please fill out the following: ${missingFields.join(", ")}`);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMessage("The email address you entered is not valid. Please check the Email field.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim().toLowerCase(),
          password: password1,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert("Registration Failed", data.error || "Unknown error");
        setLoading(false);
        return;
      }

      const loginResponse = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password1,
        }),
      });

      const loginData = await loginResponse.json();

      if (!loginResponse.ok || !loginData.token) {
        Alert.alert("Success", "Account created. Please log in.");
        router.replace("/login");
        return;
      }

      await saveToken(loginData.token);
      Alert.alert("Success", "Account created and logged in!");
      router.replace("/home");
    } catch (error: any) {
      Alert.alert("Network Error", error.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const formCard = (
    <View style={[styles.formCardWrapper, !isWide && styles.formCardWrapperNarrow]}>
      <View style={[styles.card, isCompact && styles.cardCompact]}>
        <View style={styles.iconBadge}>
          <MaterialCommunityIcons name="home" size={28} color="#FFFFFF" />
        </View>

        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>
          Create an account to manage your household{"\n"}and stay on top of tasks.
        </Text>

        <Text style={styles.inputLabel}>Name</Text>
        <View style={[styles.inputRow, isUsernameFocused && styles.inputRowFocused]}>
          <MaterialCommunityIcons name="account-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            placeholder="Enter your name"
            placeholderTextColor="#9CA3AF"
            style={[styles.inputField, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]}
            autoCapitalize="words"
            returnKeyType="next"
            onFocus={() => setIsUsernameFocused(true)}
            onBlur={() => setIsUsernameFocused(false)}
            onSubmitEditing={() => emailRef.current?.focus()}
            value={username}
            onChangeText={(text) => {
              setUsername(text);
              setErrorMessage("");
            }}
          />
        </View>

        <Text style={styles.inputLabel}>Email</Text>
        <View style={[styles.inputRow, isEmailFocused && styles.inputRowFocused]}>
          <MaterialCommunityIcons name="email-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            ref={emailRef}
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
            onSubmitEditing={() => password1Ref.current?.focus()}
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setErrorMessage("");
            }}
          />
        </View>

        <Text style={styles.inputLabel}>Password</Text>
        <View style={[styles.inputRow, isPassword1Focused && styles.inputRowFocused]}>
          <MaterialCommunityIcons name="lock-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            ref={password1Ref}
            placeholder="Enter your password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!showPassword1}
            style={[styles.inputField, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onFocus={() => setIsPassword1Focused(true)}
            onBlur={() => setIsPassword1Focused(false)}
            onSubmitEditing={() => password2Ref.current?.focus()}
            value={password1}
            onChangeText={(text) => {
              setPassword1(text);
              setErrorMessage("");
            }}
          />
          <Pressable onPress={() => setShowPassword1((value) => !value)} style={styles.eyeButton}>
            <MaterialCommunityIcons
              name={showPassword1 ? "eye-off-outline" : "eye-outline"}
              size={20}
              color="#9CA3AF"
            />
          </Pressable>
        </View>

        <View style={[styles.inputRow, isPassword2Focused && styles.inputRowFocused]}>
          <MaterialCommunityIcons name="lock-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            ref={password2Ref}
            placeholder="Confirm your password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!showPassword2}
            style={[styles.inputField, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onFocus={() => setIsPassword2Focused(true)}
            onBlur={() => setIsPassword2Focused(false)}
            onSubmitEditing={() => {
              void handleRegister();
            }}
            value={password2}
            onChangeText={(text) => {
              setPassword2(text);
              setErrorMessage("");
            }}
          />
          <Pressable onPress={() => setShowPassword2((value) => !value)} style={styles.eyeButton}>
            <MaterialCommunityIcons
              name={showPassword2 ? "eye-off-outline" : "eye-outline"}
              size={20}
              color="#9CA3AF"
            />
          </Pressable>
        </View>

        {errorMessage ? (
          <View style={styles.authErrorBox} accessibilityRole="alert">
            <Text style={styles.authErrorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleRegister}
          disabled={loading}
          // @ts-ignore – web-only hover props
          onMouseEnter={Platform.OS === "web" ? () => setHoverCreateAccount(true) : undefined}
          // @ts-ignore
          onMouseLeave={Platform.OS === "web" ? () => setHoverCreateAccount(false) : undefined}
          style={[styles.primaryButtonWrap, loading && styles.primaryButtonWrapDisabled]}
        >
          <LinearGradient
            colors={hoverCreateAccount && !loading ? [...BUTTON_GRADIENT_HOVER] : [...BUTTON_GRADIENT]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
          >
            <MaterialCommunityIcons name="magic-staff" size={18} color="#FFFFFF" style={styles.primaryButtonIcon} />
            <Text style={styles.primaryButtonText}>{loading ? "Creating..." : "Create Account"}</Text>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={() => router.replace("/login")} style={styles.secondaryLinkRow}>
          <Text style={styles.secondaryLinkText}>
            Already have an account? <Text style={styles.secondaryLinkAccent}>Sign in</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.navbar, isCompact && styles.navbarCompact]}>
        <View style={styles.navLeft}>
          <View style={styles.logoBox}>
            <MaterialCommunityIcons name="home" size={isCompact ? 18 : 22} color="#FFFFFF" />
          </View>
          <Text style={[styles.navBrand, isCompact && styles.navBrandCompact]}>HomeSeeHome</Text>
        </View>
      </View>

      {isWide ? (
        <View style={styles.fullBgContainer}>
          <Image
            source={require("../assets/images/login_background.png")}
            // @ts-ignore – objectFit/objectPosition are web-only CSS props
            style={[styles.bgImage, Platform.OS === "web" && { objectFit: "contain", objectPosition: "center bottom" }]}
          />
          <LinearGradient
            colors={["#4A6FC7", "#4A6FC7", "transparent"]}
            locations={[0, 0.15, 0.55]}
            style={styles.bgGradientOverlay}
          />

          <View style={styles.overlayRow}>
            <View style={styles.leftContent}>
              <Text style={styles.heroTitle}>A clean home{"\n"}starts together.</Text>
              <Text style={styles.heroSubtitle}>
                Create an account, organize your household{"\n"}and stay on top of tasks.
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
        <View style={styles.narrowBody}>
          {formCard}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F0F2F5",
  },
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
    maxWidth: 480,
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
  narrowBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
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
    padding: 30,
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
    color: "#3D4A72",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#8A93AB",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 22,
  },
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
    marginBottom: 14,
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
  authErrorBox: {
    width: "100%",
    marginTop: 2,
    marginBottom: 10,
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
  primaryButtonWrap: {
    marginTop: 4,
    width: "100%",
  },
  primaryButtonWrapDisabled: {
    opacity: 0.82,
  },
  primaryButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: 10,
    width: "100%",
  },
  primaryButtonDisabled: {
    opacity: 0.9,
  },
  primaryButtonIcon: {
    marginRight: 8,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryLinkRow: {
    marginTop: 16,
  },
  secondaryLinkText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  secondaryLinkAccent: {
    color: "#445988",
    fontWeight: "700",
  },
});