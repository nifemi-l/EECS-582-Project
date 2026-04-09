/* PROLOGUE
File name: home.tsx
Description: Post-login home screen where users can create or join households
Programmers: Logan Smith, Nifemi Lawal
Creation date: 3/18/26
Revision date:
  - 3/29/26: Replace hardcoded localhost URL with EXPO_PUBLIC_API_URL env variable
  - 4/6/26: Major UI redesign - navbar, hero banner, two-column layout, household count badge
Preconditions: User is authenticated before reaching this screen
Postconditions: Renders either an empty state or a list of households the user belongs to
Errors: None
Side effects: None
Invariants: None
Known faults: None. 
*/

import React, { useEffect, useMemo, useState } from "react";
import { AuthLoadingScreen, useAuthGuard } from "../utils/useAuthGuard";
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getToken, clearToken } from "../utils/authStorage";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// The local Household model shape used by HomeScreen state and rendering
const HOUSEHOLD_ORDER_KEY = "household_order";

type HouseholdSummary = {
  id: string; // internal household id used for routing
  name: string; // display name shown to the user
  joinCode: string; // shareable code used to join the household
  role: "admin" | "member"; // simple placeholder role for demo purposes
  adminName: string; // keep track of the admin name for household view
};

// Decode the username from a JWT token payload
function getUsernameFromToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4 !== 0) payload += "=";
    const decoded = Platform.OS === "web"
      ? atob(payload)
      : global.atob?.(payload) ?? atob(payload);
    const parsed = JSON.parse(decoded);
    return parsed.username || null;
  } catch {
    return null;
  }
}

async function loadHouseholdOrder(): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(HOUSEHOLD_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id) => typeof id === "string");
  } catch (_err) {
    return null;
  }
}

async function saveHouseholdOrder(ids: string[]) {
  try {
    await AsyncStorage.setItem(HOUSEHOLD_ORDER_KEY, JSON.stringify(ids));
  } catch (_err) {
    // non-fatal
  }
}

export default function HomeScreen() {
  const { isCheckingAuth, isAuthenticated } = useAuthGuard();

  if (isCheckingAuth || !isAuthenticated) {
    return <AuthLoadingScreen />;
  }

  return <AuthenticatedHomeScreen />;
}

function AuthenticatedHomeScreen() {

  // Local in-memory list of households bound to the view; this is filled by API calls
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);

  // Modal state for create and join workflows, toggled by button press
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  // Controlled text entry fields for the create/join dialogs
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");

  // Tracks whether household list is currently being loaded from backend
  const [isLoading, setIsLoading] = useState(true);

  // Username decoded from the JWT token for the welcome message
  const [username, setUsername] = useState<string | null>(null);

  // On first render, load the current user's household membership from /household/mine
  useEffect(() => {
    async function loadHouseholds() {
      setIsLoading(true);

      // Get the saved auth token so the request can be authorized
      const token = await getToken();

      // If no token exists, treat the user as having no accessible households
      if (!token) {
        setHouseholds([]);
        setIsLoading(false);
        return;
      }

      // Extract the username from the JWT for the welcome banner
      const name = getUsernameFromToken(token);
      if (name) setUsername(name);

      try {
        // Request the current user's households from the backend
        const response = await fetch(`${API_URL}/household/mine`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
        });

        // Parse the JSON body returned by the backend
        const data = await response.json();

        // If backend indicates an error, clear list and display alert tone and keep ui stable
        if (!response.ok) {
          Alert.alert("Households load failed", data.error || "Could not load your households.");
          setHouseholds([]);
          setIsLoading(false);
          return;
        }

        // Map the returned household data into the local HouseholdSummary shape
        if (Array.isArray(data.households)) {
          const fetched: HouseholdSummary[] = data.households.map((h: any) => ({
            id: String(h.household_id),
            name: h.household_name,
            joinCode: h.join_code || "",
            role: h.role || "member",
            adminName: h.admin_name || "Unknown",
          }));

          const savedOrder = await loadHouseholdOrder();
          if (savedOrder && savedOrder.length > 0) {
            const byId = new Map(fetched.map((h) => [h.id, h]));
            const ordered: HouseholdSummary[] = [];
            for (const id of savedOrder) {
              const item = byId.get(String(id));
              if (item) {
                ordered.push(item);
                byId.delete(String(id));
              }
            }
            ordered.push(...Array.from(byId.values()));
            setHouseholds(ordered);
          } else {
            setHouseholds(fetched);
          }
        } else {
          // Fallback in case the backend response does not include a valid households array
          setHouseholds([]);
        }
      } catch (error: any) {
        // Handle network or fetch-level failures
        Alert.alert("Network Error", error?.message || "Unable to fetch households.");
        setHouseholds([]);
      } finally {
        // Always stop the loading state when the request finishes
        setIsLoading(false);
      }
    }

    loadHouseholds();
  }, []);

  // Derived value used to decide whether to show the empty state or the household list
  const isEmpty = useMemo(() => households.length === 0, [households]);
  
  // Get the current screen width for responsive layout
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth > 860;

  // Logout handler - clears token and redirects to login
  async function handleLogout() {
    await clearToken();
    router.replace("/login");
  }

  // Navigate into a household's screen tree when a household card is pressed (ordered)
  async function openHousehold(id: string) {
    setHouseholds((prev) => {
      const index = prev.findIndex((h) => h.id === id);
      if (index <= 0) {
        return prev; // already first or not found
      }
      const selected = prev[index];
      const updated = [selected, ...prev.slice(0, index), ...prev.slice(index + 1)];
      saveHouseholdOrder(updated.map((h) => h.id));
      return updated;
    });

    router.push({
      pathname: "/household/[id]/graphics",
      params: { id },
    });
  }

  // Create a new household using backend API and update UI list state on success
  async function handleCreateHousehold() {
    const trimmed = newHouseholdName.trim();

    // Stop if the user did not enter a household name
    if (!trimmed) {
      Alert.alert("Missing name", "Please enter a household name.");
      return;
    }

    // Get the saved token so the create request can be authorized
    const token = await getToken();

    // If the token is missing, send the user back to login
    if (!token) {
      Alert.alert("Unauthorized", "Please log in again.");
      router.replace("/login");
      return;
    }

    try {
      // Send the create household request to the backend
      const response = await fetch(`${API_URL}/household/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },

        // Parse the backend response body
        body: JSON.stringify({ name: trimmed }),
      });

      const data = await response.json();

      // If server returns an error, keep UI state unchanged and show the message
      if (!response.ok) {
        Alert.alert("Create failed", data.error || "Could not create household.");
        return;
      }

      // Build the newly created household object in the local UI shape
      const household = data.household;
      const created: HouseholdSummary = {
        id: String(household.household_id),
        name: household.household_name,
        joinCode: household.join_code || "",
        role: "admin",
        adminName: household.admin_name || "Unknown",
      };

      // Add the new household to the top of the local list
      setHouseholds((prev) => [created, ...prev]);

      // Clear the input and close the create modal
      setNewHouseholdName("");
      setCreateOpen(false);

      // Confirm success and show the household's invite code
      Alert.alert("Household created", `${created.name} was created. Invite code: ${created.joinCode}`);
    } catch (error: any) {
      // Handle network or fetch-level failures
      Alert.alert("Network Error", error?.message || "Unable to create household.");
    }
  }

  // Join an existing household by invite code through the backend
  async function handleJoinHousehold() {
    const trimmed = joinCodeInput.trim().toUpperCase();

    // Stop if the user did not enter a join code
    if (!trimmed) {
      Alert.alert("Missing code", "Please enter a household code.");
      return;
    }

    // Get the saved token so the join request can be authorized
    const token = await getToken();

    // If the token is missing, send the user back to login
    if (!token) {
      Alert.alert("Unauthorized", "Please log in again.");
      router.replace("/login");
      return;
    }

    try {
      // Send the join request to the backend with the invite code
      const response = await fetch(`${API_URL}/household/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ join_code: trimmed }),
      });

      // Parse the backend response body
      const data = await response.json();

      // If the backend rejects the code, show the error and stop
      if (!response.ok) {
        Alert.alert("Join failed", data.error || "Invalid join code.");
        return;
      }

      // Build the joined household object in the local UI shape
      const household = data.household;
      const joined: HouseholdSummary = {
        id: String(household.household_id),
        name: household.household_name,
        joinCode: household.join_code || trimmed,
        role: "member",
        adminName: household.admin_name || "Unknown",
      };

      // Avoid duplicate cards if the household already exists in local state
      const alreadyExists = households.some((h) => h.id === joined.id);
      if (!alreadyExists) {
        setHouseholds((prev) => [joined, ...prev]);
      }

      // Clear the input and close the join modal
      setJoinCodeInput("");
      setJoinOpen(false);

      // Confirm the household was joined successfully
      Alert.alert("Joined household", `You joined ${joined.name}.`);
    } catch (error: any) {
      // Handle network or fetch-level failures
      Alert.alert("Network Error", error?.message || "Unable to join household.");
    }
  }
  // First letter of the username for the avatar circle
  const avatarLetter = username ? username.charAt(0).toUpperCase() : "?";

  return (
    <View style={styles.screen}>
      {/* --- Top Navbar --- */}
      <View style={styles.navbar}>
        <View style={styles.navLeft}>
          <View style={styles.logoBox}>
            <MaterialCommunityIcons name="home" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.navBrand}>HomeSeeHome</Text>
        </View>
        <View style={styles.navRight}>
          <Pressable style={styles.navLink} onPress={() => {}}>
            <MaterialCommunityIcons name="home" size={20} color="#FFFFFF" />
            <Text style={styles.navLinkText}>Home</Text>
          </Pressable>
          <Pressable style={styles.navLogout} onPress={handleLogout}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{avatarLetter}</Text>
            </View>
            <Text style={styles.navLinkText}>Logout</Text>
          </Pressable>
        </View>
      </View>

      {/* --- Hero Banner with curved bottom --- */}
      <View>
        <LinearGradient
          colors={["#3B5FA0", "#5B7EC2", "#7B9BDB"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroBanner}
        >
          <View style={styles.starField}>
            <Text style={styles.star1}>{"\u2726"}</Text>
            <Text style={styles.star2}>{"\u2726"}</Text>
            <Text style={styles.star3}>{"\u2727"}</Text>
            <Text style={styles.star4}>{"\u2726"}</Text>
            <Text style={styles.star5}>{"\u2727"}</Text>
            <Text style={styles.star6}>{"\u2726"}</Text>
            <Text style={styles.star7}>{"\u2727"}</Text>
            <Text style={styles.star8}>{"\u2726"}</Text>
            <Text style={styles.star9}>{"\u2727"}</Text>
          </View>
          <View style={[styles.bannerCloud, { top: 18, left: "18%" }]} />
          <View style={[styles.bannerCloud, styles.bannerCloudSm, { top: 32, right: "10%" }]} />
          <View style={[styles.bannerCloud, { bottom: 80, left: "73%" }]} />
          <View style={[styles.bannerCloud, styles.bannerCloudSm, { top: 14, right: "38%" }]} />
          {/* Large background house silhouettes */}
          <View style={{ position: "absolute", left: -20, bottom: -40 }}>
            <MaterialCommunityIcons name="home-outline" size={300} color="rgba(255,255,255,0.18)" />
          </View>
          <View style={{ position: "absolute", left: "25%", bottom: -30 }}>
            <MaterialCommunityIcons name="home-variant-outline" size={260} color="rgba(255,255,255,0.13)" />
          </View>
          <View style={{ position: "absolute", right: -10, bottom: -25 }}>
            <MaterialCommunityIcons name="home-outline" size={240} color="rgba(255,255,255,0.15)" />
          </View>
          <Text style={styles.heroTitle}>
            Welcome back, {username ?? "User"}! {"\uD83D\uDC4B"}
          </Text>
          <Text style={styles.heroSubtitle}>
            Choose a household below to continue your cleaning journey.
          </Text>
        </LinearGradient>
        <View style={styles.heroCurve} />
      </View>

      <View style={styles.scrollContent}>
        <View style={[styles.mainContent, isWide && styles.mainContentWide]}>
          <View style={[styles.leftColumn, isWide && styles.leftColumnWide]}>
            <View style={styles.illustrationCard}>
              <Image
                source={require("../assets/images/home_icon.png")}
                style={styles.illustrationImage}
                resizeMode="contain"
              />
              <Text style={styles.illustrationTitle}>Your Homes, Your Progress</Text>
              <Text style={styles.illustrationDesc}>Manage your households, keep things clean, and build healthier habits together.</Text>
              <Pressable style={styles.primaryButton} onPress={() => setCreateOpen(true)}>
                <LinearGradient colors={["#3B6DB5", "#5B8AD4"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.primaryButtonFill}>
                  <Text style={styles.primaryButtonText}>+ Create New Household</Text>
                </LinearGradient>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => setJoinOpen(true)}>
                <MaterialCommunityIcons name="link-variant" size={22} color="#3B6DB5" />
                <Text style={styles.secondaryButtonText}>Join with a Code</Text>
              </Pressable>
              <View style={styles.quoteCard}>
                <Text style={styles.quoteText}>{"\uD83D\uDC99"} A clean home is{"\n"}   a happy home. {"\uD83D\uDC99"}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.rightColumn, isWide && styles.rightColumnWide]}>
            <View style={styles.rightColumnCard}>
              <View style={styles.listHeader}>
                <View style={styles.listHeaderLeft}>
                  <View style={styles.sectionIconCircle}>
                    <MaterialCommunityIcons name="home" size={22} color="#3B6DB5" />
                  </View>
                  <Text style={styles.sectionTitle}>Your Households</Text>
                  {!isLoading && (<View style={styles.countBadge}><Text style={styles.countBadgeText}>{households.length}</Text></View>)}
                </View>
              </View>
              {!isLoading && !isEmpty && <Text style={styles.listSubtitle}>Select a household to view and manage it</Text>}
              {isLoading ? (
                <Text style={styles.loadingText}>Loading your households...</Text>
              ) : isEmpty ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="home-plus-outline" size={64} color="#BCC5D1" />
                  <Text style={styles.emptyTitle}>No households yet</Text>
                  <Text style={styles.emptySubtitle}>Create a household or join one with a code to get started.</Text>
                </View>
              ) : (
                <ScrollView style={styles.householdListScroll} nestedScrollEnabled>
                  {households.map((household) => (
                    <Pressable key={household.id} style={styles.householdCard} onPress={() => openHousehold(household.id)}>
                      <View style={styles.householdCardLeft}>
                        <View style={styles.householdIconCircle}>
                          <MaterialCommunityIcons name="home-group" size={28} color="#5D7FAF" />
                        </View>
                        <View style={styles.householdInfo}>
                          <Text style={styles.householdName}>{household.name}</Text>
                          <Text style={styles.householdMeta}>Admin: {household.adminName} {"\u2022"} Code: {household.joinCode}</Text>
                        </View>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={26} color="#8FA0B3" />
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      </View>

      <Modal animationType="fade" transparent visible={createOpen} onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Household</Text>
            <Text style={styles.modalSubtitle}>Give your household a name to get started.</Text>
            <TextInput value={newHouseholdName} onChangeText={setNewHouseholdName} placeholder="Household name" placeholderTextColor="#8FA0B3" style={styles.input} />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelButton} onPress={() => setCreateOpen(false)}><Text style={styles.modalCancelText}>Cancel</Text></Pressable>
              <Pressable style={styles.modalConfirmButton} onPress={handleCreateHousehold}><Text style={styles.modalConfirmText}>Create</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={joinOpen} onRequestClose={() => setJoinOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Join with Code</Text>
            <Text style={styles.modalSubtitle}>Enter the invite code shared by a household admin.</Text>
            <TextInput value={joinCodeInput} onChangeText={setJoinCodeInput} placeholder="Enter code" placeholderTextColor="#8FA0B3" autoCapitalize="characters" style={styles.input} />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelButton} onPress={() => setJoinOpen(false)}><Text style={styles.modalCancelText}>Cancel</Text></Pressable>
              <Pressable style={styles.modalConfirmButton} onPress={handleJoinHousehold}><Text style={styles.modalConfirmText}>Join</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F0F2F5" },
  navbar: { height: 68, backgroundColor: "#2D4A7A", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  navLeft: { flexDirection: "row", alignItems: "center" },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#3B5FA0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    shadowColor: "#1A2B4D",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  navBrand: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", letterSpacing: 0.3 },
  navRight: { flexDirection: "row", alignItems: "center", gap: 20 },
  navLink: { flexDirection: "row", alignItems: "center", gap: 5 },
  navLinkText: { color: "#FFFFFF", fontSize: 15, fontWeight: "500" },
  navLogout: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatarCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#5B8AD4", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  heroBanner: { paddingTop: 40, paddingBottom: 70, paddingHorizontal: 24, alignItems: "center", position: "relative", overflow: "hidden" },
  starField: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  star1: { position: "absolute", top: 12, left: "15%", color: "rgba(255,255,255,0.25)", fontSize: 14 },
  star2: { position: "absolute", top: 20, right: "15%", color: "rgba(255,255,255,0.2)", fontSize: 10 },
  star3: { position: "absolute", bottom: 18, left: "25%", color: "rgba(255,255,255,0.18)", fontSize: 12 },
  star4: { position: "absolute", top: 8, left: "55%", color: "rgba(255,255,255,0.22)", fontSize: 8 },
  star5: { position: "absolute", bottom: 10, right: "30%", color: "rgba(255,255,255,0.15)", fontSize: 16 },
  star6: { position: "absolute", top: 30, left: "25%", color: "rgba(255,255,255,0.20)", fontSize: 10 },
  star7: { position: "absolute", top: 6, right: "50%", color: "rgba(255,255,255,0.18)", fontSize: 8 },
  star8: { position: "absolute", bottom: 40, right: "20%", color: "rgba(255,255,255,0.22)", fontSize: 12 },
  star9: { position: "absolute", bottom: 55, left: "60%", color: "rgba(255,255,255,0.16)", fontSize: 9 },
  bannerCloud: { position: "absolute", width: 80, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.12)" },
  bannerCloudSm: { width: 60, height: 24, borderRadius: 12 },
  bannerHousesRow: { position: "absolute", bottom: 12, left: 0, right: 0, flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end", paddingHorizontal: 10 },
  heroCurve: { height: 50, backgroundColor: "#F0F2F5", borderTopLeftRadius: 600, borderTopRightRadius: 600, marginTop: -50 },
  heroTitle: { fontSize: 30, fontWeight: "700", color: "#FFFFFF", textAlign: "center", marginBottom: 8, zIndex: 2 },
  heroSubtitle: { fontSize: 16, color: "rgba(255,255,255,0.85)", textAlign: "center", zIndex: 2 },
  scrollContent: { paddingTop: 8, paddingBottom: 30, paddingHorizontal: 20 },
  mainContent: { width: "100%", maxWidth: 1100, alignSelf: "center" },
  mainContentWide: { flexDirection: "row", gap: 28 },
  leftColumn: { marginBottom: 24 },
  leftColumnWide: { width: "36%", marginBottom: 0 },
  illustrationCard: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 24, alignItems: "center", shadowColor: "#AAB6C5", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 2 },
  illustrationImage: { width: "100%", height: 200, marginBottom: 16 },
  illustrationTitle: { fontSize: 20, fontWeight: "700", color: "#3D4F63", textAlign: "center", marginBottom: 8 },
  illustrationDesc: { fontSize: 14, lineHeight: 21, color: "#6B7B8D", textAlign: "center", marginBottom: 20 },
  primaryButton: { width: "100%", borderRadius: 14, overflow: "hidden", marginBottom: 12, shadowColor: "#3B6DB5", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 3 },
  primaryButtonFill: { height: 52, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  primaryButtonText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", letterSpacing: 0.2 },
  secondaryButton: { width: "100%", height: 52, borderRadius: 14, borderWidth: 2, borderColor: "#3B6DB5", backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 18 },
  secondaryButtonText: { fontSize: 16, fontWeight: "700", color: "#3B6DB5" },
  quoteCard: { width: "100%", backgroundColor: "#EBF2FC", borderRadius: 14, paddingVertical: 18, paddingHorizontal: 20, alignItems: "center" },
  quoteText: { fontSize: 15, fontWeight: "600", color: "#4A6FA5", textAlign: "center", lineHeight: 24 },
  rightColumn: { flex: 1 },
  rightColumnWide: { flex: 1 },
  rightColumnCard: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 24, shadowColor: "#AAB6C5", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 2 },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  listHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#EBF2FC", alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 22, fontWeight: "700", color: "#3D4F63" },
  countBadge: { backgroundColor: "#3B6DB5", borderRadius: 14, minWidth: 28, height: 28, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  countBadgeText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", lineHeight: 28, textAlign: "center", textAlignVertical: "center", includeFontPadding: false, marginLeft: -2 },
  listSubtitle: { fontSize: 14, color: "#7B8A9C", marginBottom: 18, marginLeft: 38 },
  householdListScroll: { maxHeight: 480 },
  loadingText: { textAlign: "center", fontSize: 16, color: "#7B8A9C", paddingVertical: 40 },
  emptyState: { alignItems: "center", paddingVertical: 36 },
  emptyTitle: { textAlign: "center", fontSize: 20, fontWeight: "600", color: "#596474", marginTop: 12, marginBottom: 8 },
  emptySubtitle: { textAlign: "center", fontSize: 15, lineHeight: 22, color: "#7C8797", paddingHorizontal: 12 },
  householdCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#E6EAF0", flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#AAB6C5", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 1 },
  householdCardLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  householdIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#EBF2FC", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  householdLogo: { width: 90, height: 90, tintColor: "#4A7BBF" },
  householdInfo: { flex: 1 },
  householdName: { fontSize: 17, fontWeight: "700", color: "#3D4F63", marginBottom: 3 },
  householdMeta: { fontSize: 13, color: "#7B8A9C" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(27, 39, 56, 0.35)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  modalCard: { width: "100%", maxWidth: 480, backgroundColor: "#FFFFFF", borderRadius: 22, padding: 22, shadowColor: "#000000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 8, alignSelf: "center" },
  modalTitle: { fontSize: 24, fontWeight: "700", color: "#3D4F63", marginBottom: 8 },
  modalSubtitle: { fontSize: 16, lineHeight: 24, color: "#7B8A9C", marginBottom: 18 },
  input: { height: 54, borderRadius: 14, borderWidth: 1.5, borderColor: "#D7DFEA", paddingHorizontal: 16, fontSize: 16, color: "#334155", backgroundColor: "#FAFBFD" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 20 },
  modalCancelButton: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: "#EEF2F7" },
  modalCancelText: { color: "#64748B", fontWeight: "600" },
  modalConfirmButton: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: "#3B6DB5" },
  modalConfirmText: { color: "#FFFFFF", fontWeight: "700" },
});
