/* PROLOGUE
File name: home.tsx
Description: Post-login home screen where users can create or join households
Programmers: Logan Smith, Nifemi Lawal
Creation date: 3/18/26
Revision date:
  - 3/29/26: Replace hardcoded localhost URL with EXPO_PUBLIC_API_URL env variable
Preconditions: User is authenticated before reaching this screen
Postconditions: Renders either an empty state or a list of households the user belongs to
Errors: None
Side effects: None
Invariants: None
Known faults: None. 
*/

import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getToken } from "../utils/authStorage";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// The local Household model shape used by HomeScreen state and rendering
const HOUSEHOLD_ORDER_KEY = "household_order";

type HouseholdSummary = {
  id: string; // internal household id used for routing
  name: string; // display name shown to the user
  joinCode: string; // shareable code used to join the household
  role: "admin" | "member"; // simple placeholder role for demo purposes
};

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

      try {
        // Request the current user's households from the backend
        const response = await fetch(`${API_URL}/household/mine`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "Access-Control-Allow-Origin": "https://api.seehome.app"
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
            role: h.created_by_account_id ? "admin" : "member", // fallback
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
  
  // Get the current screen width so the header can scale for larger layouts
  const windowWidth = useWindowDimensions().width;

  // Enlarge the header text on wider screens
  const headerFontSize = windowWidth > 640 ? 37 : 32;

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
  return (
    <View style={styles.screen}>
      {/* Blue gradient header used to match the household selection design */}
      <LinearGradient
        colors={["#6D92C7", "#8FAEDF"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.header}

      > {/* Main page title */}
        <Text style={[styles.headerTitle, { fontSize: headerFontSize }]}>Your Households</Text>

        {/* Decorative household icon shown in the header */}
        <View style={styles.headerIconWrap}>
          <MaterialCommunityIcons name="home-group" size={34} color="#FFFFFF" />
        </View>
      </LinearGradient>

      {/* Main content area switches between loading, empty, and populated states */}
      <View
        style={[
          styles.contentContainer,
          isEmpty && styles.contentContainerEmpty,
        ]}
      >
        {isLoading ? (
          <Text style={styles.emptyTitle}>Loading your households...</Text>
        ) : isEmpty ? (
          <>
            {/* Empty-state illustration block shown when the user has no households yet */}
            <View style={styles.illustrationWrap}>
              <View style={styles.illustrationCloud} />
              <MaterialCommunityIcons
                name="home-city-outline"
                size={210}
                color="#BCC5D1"
                style={styles.houseIcon}
              />
              <View style={styles.floatingIconLeftTop}>
                <MaterialCommunityIcons
                  name="spray-bottle"
                  size={34}
                  color="#BCC5D1"
                />
              </View>
              <View style={styles.floatingIconRightTop}>
                <MaterialCommunityIcons
                  name="thermometer"
                  size={34}
                  color="#BCC5D1"
                />
              </View>
              <View style={styles.floatingIconLeftBottom}>
                <MaterialCommunityIcons
                  name="lightbulb"
                  size={34}
                  color="#BCC5D1"
                />
              </View>
              <View style={styles.floatingIconRightBottom}>
                <MaterialCommunityIcons
                  name="wrench"
                  size={34}
                  color="#BCC5D1"
                />
              </View>
            </View>

            {/* Primary empty-state copy */}
            <Text style={styles.emptyTitle}>You’re not part of a household yet.</Text>
            <Text style={styles.emptySubtitle}>
              Create a household or join one with a code.
            </Text>

            {/* Main call-to-action buttons for creating or joining a household */}
            <Pressable style={styles.primaryButton} onPress={() => setCreateOpen(true)}>
              <LinearGradient
                colors={["#6D92C7", "#8FAEDF"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.primaryButtonFill}
              >
                <Text style={styles.primaryButtonText}>Create Household</Text>
              </LinearGradient>
            </Pressable>

            <Pressable style={styles.secondaryButton} onPress={() => setJoinOpen(true)}>
              <MaterialCommunityIcons
                name="form-textbox-password"
                size={34}
                color="#5D7FAF"
              />
              <Text style={styles.secondaryButtonText}>Join with Code</Text>
            </Pressable>
          </>
        ) : (
          <>
            {/* Once the user belongs to households, show household cards instead of the empty state */}
            <View style={styles.listHeaderRow}>
              <Text style={styles.sectionTitle}>House List</Text>
              <View style={styles.listActions}>
                <Pressable
                  style={styles.smallOutlineButton}
                  onPress={() => setJoinOpen(true)}
                >
                  <Text style={styles.smallOutlineButtonText}>Join Code</Text>
                </Pressable>

                <Pressable
                  style={styles.smallPrimaryButton}
                  onPress={() => setCreateOpen(true)}
                >
                  <Text style={styles.smallPrimaryButtonText}>Create</Text>
                </Pressable>
              </View>
            </View>

            {households.map((household) => (
              <Pressable
                key={household.id}
                style={styles.householdCard}
                onPress={() => openHousehold(household.id)}
              >
                <View style={styles.householdCardLeft}>
                  <View style={styles.householdIconCircle}>
                    <MaterialCommunityIcons
                      name="home-group"
                      size={28}
                      color="#5D7FAF"
                    />
                  </View>
                
                  {/* Household name and metadata */}
                  <View>
                    <Text style={styles.householdName}>{household.name}</Text>
                    <Text style={styles.householdMeta}>
                      {household.role === "admin" ? "Admin" : "Member"} • Code:{" "}
                      {household.joinCode}
                    </Text>
                  </View>
                </View>

                <MaterialCommunityIcons
                  name="chevron-right"
                  size={28}
                  color="#8FA0B3"
                />
              </Pressable>
            ))}
          </>
        )}
      </View>

      {/* Modal used to create a new household */}
      <Modal
        animationType="fade"
        transparent
        visible={createOpen}
        onRequestClose={() => setCreateOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Household</Text>
            <Text style={styles.modalSubtitle}>
              Give your household a name to get started.
            </Text>

            {/* Input for the new household name */}
            <TextInput
              value={newHouseholdName}
              onChangeText={setNewHouseholdName}
              placeholder="Household name"
              placeholderTextColor="#8FA0B3"
              style={styles.input}
            />

            {/* Modal action buttons */}
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setCreateOpen(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={styles.modalConfirmButton}
                onPress={handleCreateHousehold}
              >
                <Text style={styles.modalConfirmText}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal used to join an existing household by invite code */}
      <Modal
        animationType="fade"
        transparent
        visible={joinOpen}
        onRequestClose={() => setJoinOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Join with Code</Text>
            <Text style={styles.modalSubtitle}>
              Enter the invite code shared by a household admin.
            </Text>

            {/* Input for the household invite code */}
            <TextInput
              value={joinCodeInput}
              onChangeText={setJoinCodeInput}
              placeholder="Enter code"
              placeholderTextColor="#8FA0B3"
              autoCapitalize="characters"
              style={styles.input}
            />

            {/* Modal action buttons */}
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setJoinOpen(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={styles.modalConfirmButton}
                onPress={handleJoinHousehold}
              >
                <Text style={styles.modalConfirmText}>Join</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Screen styles for the household home page
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F6F7F9",
  },

  header: {
    height: 108,
    paddingTop: 22,
    paddingHorizontal: 22,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 37,
    fontWeight: "400",
    color: "#FFFFFF",
    letterSpacing: 0.3,
    marginTop: 6,
    marginLeft: 34,
  },

  headerIconWrap: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },

  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 30,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    minWidth: 280,
    marginTop: 44,
  },

  contentContainerEmpty: {
    flexGrow: 1,
  },

  illustrationWrap: {
    height: 260,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
    marginBottom: 22,
    position: "relative",
    maxWidth: 520,
    width: "100%",
    paddingHorizontal: 20,
    alignSelf: "center",
  },

  illustrationCloud: {
    position: "absolute",
    width: 380,
    height: 220,
    borderRadius: 999,
    backgroundColor: "#EEF1F5",
    opacity: 0.95,
  },

  houseIcon: {
    opacity: 0.95,
    transform: [{ scale: 0.86 }],
  },

  floatingIconLeftTop: {
    position: "absolute",
    top: 16,
    left: 24,
  },

  floatingIconRightTop: {
    position: "absolute",
    top: 16,
    right: 24,
  },

  floatingIconLeftBottom: {
    position: "absolute",
    bottom: 16,
    left: 24,
  },

  floatingIconRightBottom: {
    position: "absolute",
    bottom: 16,
    right: 24,
  },

  emptyTitle: {
    textAlign: "center",
    fontSize: 28,
    fontWeight: "600",
    color: "#596474",
    marginBottom: 14,
  },

  emptySubtitle: {
    textAlign: "center",
    fontSize: 18,
    lineHeight: 27,
    color: "#7C8797",
    marginBottom: 42,
    paddingHorizontal: 12,
  },

  primaryButton: {
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 28,
    shadowColor: "#6D92C7",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 4,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
  },

  primaryButtonFill: {
    height: 70,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },

  primaryButtonText: {
    fontSize: 30,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },

  secondaryButton: {
    minHeight: 70,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: "#6D92C7",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
  },

  secondaryButtonText: {
    fontSize: 30,
    fontWeight: "600",
    color: "#5D7FAF",
    letterSpacing: 0.2,
  },

  listHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  sectionTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#566172",
  },

  listActions: {
    flexDirection: "row",
    gap: 10,
  },

  smallOutlineButton: {
    borderWidth: 1.5,
    borderColor: "#6D92C7",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },

  smallOutlineButtonText: {
    color: "#5D7FAF",
    fontWeight: "600",
  },

  smallPrimaryButton: {
    backgroundColor: "#6D92C7",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },

  smallPrimaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },

  householdCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E6EAF0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#AAB6C5",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },

  householdCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },

  householdIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#EEF3FA",
    alignItems: "center",
    justifyContent: "center",
  },

  householdName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#4E5968",
    marginBottom: 4,
  },

  householdMeta: {
    fontSize: 14,
    color: "#7D8796",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(27, 39, 56, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  modalCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 22,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
    alignSelf: "center",
  },

  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#506070",
    marginBottom: 8,
  },

  modalSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: "#7B8796",
    marginBottom: 18,
  },

  input: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#D7DFEA",
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#334155",
    backgroundColor: "#FAFBFD",
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 20,
  },

  modalCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#EEF2F7",
  },

  modalCancelText: {
    color: "#64748B",
    fontWeight: "600",
  },

  modalConfirmButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#6D92C7",
  },

  modalConfirmText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
