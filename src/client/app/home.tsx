/* PROLOGUE
File name: home.tsx
Description: Post-login home screen where users can create or join households
Programmers: Logan Smith, Nifemi Lawal
Creation date: 3/18/26
Revision date:
  - 3/29/26: Replace hardcoded localhost URL with EXPO_PUBLIC_API_URL env variable
  - 4/6/26: Major UI redesign - navbar, hero banner, two-column layout, household count badge
  - 4/9/26: Add AuthGuard to protect the screen and redirect unauthenticated users to login
  - 4/10/26: Added new menu to each household card with options to view members, edit household (admin only), and leave household
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

  // Pick a random message for the quote card on mount
  const carouselMessages = [
    'A clean home is\na happy home.',
    'Placeholder 2',
    'Placeholder 3',
    'Placeholder 4',
    'Placeholder 5',
  ];
  const [carouselIndex] = useState(() => Math.floor(Math.random() * carouselMessages.length));

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
  // Leave a household — admins are blocked; members get a proper confirmation modal
  function handleLeaveHousehold(householdId: string) {
    const household = households.find((h) => h.id === householdId);
    if (!household) return;

    if (household.role === "admin") {
      // Close the options popup and open the dedicated "cannot leave" info modal
      setMenuOpenId(null);
      setCannotLeaveId(householdId);
      return;
    }

    // Close the options popup first, then open the dedicated confirmation modal
    setMenuOpenId(null);
    setLeaveConfirmId(householdId);
  }

  // Confirmed by the user in the leave confirmation modal
  async function confirmLeaveHousehold() {
    if (!leaveConfirmId) return;
    const household = households.find((h) => h.id === leaveConfirmId);
    const token = await getToken();
    if (!token) {
      Alert.alert("Unauthorized", "Please log in again.");
      router.replace("/login");
      return;
    }
    try {
      const response = await fetch(`${API_URL}/household/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ household_id: Number(leaveConfirmId) }),
      });
      const data = await response.json();
      if (!response.ok) {
        Alert.alert("Error", data.error || "Unable to leave household.");
        return;
      }
      setHouseholds((prev) => prev.filter((h) => h.id !== leaveConfirmId));
      setLeaveConfirmId(null);
      Alert.alert("Left household", `You have left "${household?.name ?? "the household"}".`);
    } catch (error: any) {
      Alert.alert("Network Error", error?.message || "Unable to leave household.");
    }
  }

  // Track which household card is hovered and which has its menu popup open
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Tracks which household id is pending a leave confirmation
  const [leaveConfirmId, setLeaveConfirmId] = useState<string | null>(null);

  // Tracks which admin household triggered the "cannot leave" info modal
  const [cannotLeaveId, setCannotLeaveId] = useState<string | null>(null);

  // Tracks which household's member list is being viewed
  const [viewMembersId, setViewMembersId] = useState<string | null>(null);
  const [membersData, setMembersData] = useState<{ account_id: number; account_name: string; role: string; joined_at: string | null }[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Tracks which member row has its dots menu open
  const [memberDotsOpenId, setMemberDotsOpenId] = useState<number | null>(null);

  // Member awaiting remove confirmation
  const [removeConfirmMember, setRemoveConfirmMember] = useState<{ account_id: number; account_name: string } | null>(null);

  // Member awaiting make-admin confirmation
  const [makeAdminConfirmMember, setMakeAdminConfirmMember] = useState<{ account_id: number; account_name: string } | null>(null);

  // Household Settings modal state
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [settingsName, setSettingsName] = useState("");
  const [settingsNameSaving, setSettingsNameSaving] = useState(false);
  const [settingsCodeUpdatedAt, setSettingsCodeUpdatedAt] = useState<string | null>(null);
  const [settingsCodeCopied, setSettingsCodeCopied] = useState(false);
  const [settingsCodeRegenerating, setSettingsCodeRegenerating] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingHousehold, setDeletingHousehold] = useState(false);

  function handleOpenSettings(householdId: string) {
    const h = households.find((hh) => hh.id === householdId);
    if (!h) return;
    setMenuOpenId(null);
    setSettingsName(h.name);
    setSettingsCodeUpdatedAt(null);
    setSettingsCodeCopied(false);
    setDeleteConfirmOpen(false);
    setSettingsId(householdId);
  }

  async function handleSaveHouseholdName() {
    if (!settingsId || !settingsName.trim()) return;
    setSettingsNameSaving(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/household/${settingsId}/update_name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: settingsName.trim() }),
      });
      const data = await response.json();
      if (!response.ok) { Alert.alert("Error", data.error || "Could not update name."); return; }
      setHouseholds((prev) => prev.map((h) => h.id === settingsId ? { ...h, name: data.household.household_name } : h));
    } catch (e: any) {
      Alert.alert("Network Error", e?.message || "Unable to save name.");
    } finally {
      setSettingsNameSaving(false);
    }
  }

  async function handleRegenerateCode() {
    if (!settingsId) return;
    setSettingsCodeRegenerating(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/household/${settingsId}/regenerate_code`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) { Alert.alert("Error", data.error || "Could not regenerate code."); return; }
      const newCode = data.household.join_code;
      const updatedAt = data.household.updated_at;
      setHouseholds((prev) => prev.map((h) => h.id === settingsId ? { ...h, joinCode: newCode } : h));
      setSettingsCodeUpdatedAt(updatedAt);
    } catch (e: any) {
      Alert.alert("Network Error", e?.message || "Unable to regenerate code.");
    } finally {
      setSettingsCodeRegenerating(false);
    }
  }

  async function handleDeleteHousehold() {
    if (!settingsId) return;
    setDeletingHousehold(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/household/${settingsId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) { Alert.alert("Error", data.error || "Could not delete household."); return; }
      setHouseholds((prev) => prev.filter((h) => h.id !== settingsId));
      setDeleteConfirmOpen(false);
      setSettingsId(null);
    } catch (e: any) {
      Alert.alert("Network Error", e?.message || "Unable to delete household.");
    } finally {
      setDeletingHousehold(false);
    }
  }

  async function handleViewMembers(householdId: string) {
    setMenuOpenId(null);
    setViewMembersId(householdId);
    setMembersData([]);
    setMemberDotsOpenId(null);
    setMembersLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/household/${householdId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) setMembersData(data.members ?? []);
    } catch (_e) {
      // non-fatal — list stays empty
    } finally {
      setMembersLoading(false);
    }
  }

  async function handleRemoveMember() {
    if (!removeConfirmMember || !viewMembersId) return;
    const token = await getToken();
    if (!token) { Alert.alert("Unauthorized", "Please log in again."); return; }
    try {
      const response = await fetch(`${API_URL}/household/${viewMembersId}/remove_member`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ account_id: removeConfirmMember.account_id }),
      });
      const data = await response.json();
      if (!response.ok) { Alert.alert("Error", data.error || "Could not remove member."); return; }
      setMembersData((prev) => prev.filter((m) => m.account_id !== removeConfirmMember.account_id));
      setRemoveConfirmMember(null);
    } catch (e: any) {
      Alert.alert("Network Error", e?.message || "Unable to remove member.");
    }
  }

  async function handleMakeAdmin() {
    if (!makeAdminConfirmMember || !viewMembersId) return;
    const token = await getToken();
    if (!token) { Alert.alert("Unauthorized", "Please log in again."); return; }
    try {
      const response = await fetch(`${API_URL}/household/${viewMembersId}/transfer_admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ account_id: makeAdminConfirmMember.account_id }),
      });
      const data = await response.json();
      if (!response.ok) { Alert.alert("Error", data.error || "Could not transfer admin."); return; }
      // Update local member list roles
      setMembersData((prev) =>
        prev.map((m) => {
          if (m.account_id === makeAdminConfirmMember.account_id) return { ...m, role: "admin" };
          if (m.role === "admin") return { ...m, role: "member" };
          return m;
        })
      );
      // Update the household list so the role + adminName reflects the change
      setHouseholds((prev) =>
        prev.map((h) =>
          h.id === viewMembersId
            ? { ...h, role: "member" as const, adminName: makeAdminConfirmMember.account_name }
            : h
        )
      );
      setMakeAdminConfirmMember(null);
    } catch (e: any) {
      Alert.alert("Network Error", e?.message || "Unable to transfer admin.");
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
                <Text style={styles.quoteText}>
                  {"\uD83D\uDC99"} {carouselMessages[carouselIndex]} {"\uD83D\uDC99"}
                </Text>
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
                  {households.map((household) => {
                    const isHovered = hoveredId === household.id;
                    const isMenuOpen = menuOpenId === household.id;
                    return (
                      <View key={household.id} style={{ position: "relative" }}>
                        <Pressable
                          style={[styles.householdCard, isHovered && styles.householdCardHovered]}
                          onPress={() => {
                            if (isMenuOpen) { setMenuOpenId(null); return; }
                            openHousehold(household.id);
                          }}
                          // @ts-ignore - web only hover events
                          onMouseEnter={() => setHoveredId(household.id)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          <View style={styles.householdCardLeft}>
                            <View style={styles.householdIconCircle}>
                              <MaterialCommunityIcons name="home-group" size={28} color="#5D7FAF" />
                            </View>
                            <View style={styles.householdInfo}>
                              <Text style={styles.householdName}>{household.name}</Text>
                              <Text style={styles.householdMeta}>Admin: {household.adminName} {"\u2022"} Code: {household.joinCode}</Text>
                            </View>
                          </View>
                          <View style={styles.householdCardRight}>
                            {isHovered && (
                              <Pressable
                                style={styles.dotsButton}
                                onPress={(e) => {
                                  e.stopPropagation?.();
                                  setMenuOpenId(isMenuOpen ? null : household.id);
                                }}
                              >
                                <MaterialCommunityIcons name="dots-vertical" size={22} color="#8FA0B3" />
                              </Pressable>
                            )}
                            <MaterialCommunityIcons name="chevron-right" size={26} color="#8FA0B3" />
                          </View>
                        </Pressable>

                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Household options centered popup modal */}
      {(() => {
        const menuHousehold = households.find((h) => h.id === menuOpenId);
        return (
          <Modal animationType="fade" transparent visible={!!menuOpenId} onRequestClose={() => setMenuOpenId(null)}>
            <Pressable style={styles.modalBackdrop} onPress={() => setMenuOpenId(null)}>
              <Pressable style={styles.householdPopup} onPress={(e) => e.stopPropagation?.()}>
                {/* Header */}
                <Pressable style={styles.householdPopupClose} onPress={() => setMenuOpenId(null)}>
                  <MaterialCommunityIcons name="close" size={20} color="#7B8A9C" />
                </Pressable>
                <View style={styles.householdPopupHeader}>
                  <View style={styles.householdPopupIconCircle}>
                    <MaterialCommunityIcons name="home-group" size={30} color="#5D7FAF" />
                  </View>
                  <Text style={styles.householdPopupName}>{menuHousehold?.name ?? ""}</Text>
                  {menuHousehold?.role === "admin" ? (
                    <View style={styles.householdPopupRoleBadgeAdmin}>
                      <MaterialCommunityIcons name="shield-check" size={13} color="#FFFFFF" style={{ marginRight: 5 }} />
                      <Text style={styles.householdPopupRoleTextAdmin}>You are an admin</Text>
                    </View>
                  ) : (
                    <View style={styles.householdPopupRoleBadge}>
                      <Text style={styles.householdPopupRoleText}>You are a member</Text>
                    </View>
                  )}
                </View>
                <View style={styles.dropdownDivider} />
                {/* Admin-only controls */}
                {menuHousehold?.role === "admin" && (
                  <>
                    <Text style={styles.householdPopupSectionLabel}>ADMIN CONTROLS</Text>
                    {/* Edit Household removed as requested */}
                    <Pressable style={styles.householdPopupItem} onPress={() => menuHousehold && handleOpenSettings(menuHousehold.id)}>
                      <View style={styles.householdPopupItemIcon}><MaterialCommunityIcons name="cog-outline" size={20} color="#3D4F63" /></View>
                      <View style={styles.householdPopupItemText}>
                        <Text style={styles.householdPopupItemTitle}>Household Settings</Text>
                        <Text style={styles.householdPopupItemSub}>Update preferences and notifications</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#B0BEC5" />
                    </Pressable>
                    {/* Manage Members removed as requested */}
                    <View style={styles.dropdownDivider} />
                  </>
                )}
                {/* Member actions — visible to all roles */}
                <Text style={styles.householdPopupSectionLabel}>MEMBER ACTIONS</Text>
                <Pressable style={styles.householdPopupItem} onPress={() => { menuHousehold && handleViewMembers(menuHousehold.id); }}>
                  <View style={styles.householdPopupItemIcon}><MaterialCommunityIcons name="eye-outline" size={20} color="#3D4F63" /></View>
                  <View style={styles.householdPopupItemText}>
                    <Text style={styles.householdPopupItemTitle}>View Members</Text>
                    <Text style={styles.householdPopupItemSub}>See who's in this household</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#B0BEC5" />
                </Pressable>
                <Pressable style={[styles.householdPopupItem, styles.householdPopupItemLeave]} onPress={() => menuHousehold && handleLeaveHousehold(menuHousehold.id)}>
                  <View style={styles.householdPopupItemIcon}><MaterialCommunityIcons name="logout" size={20} color="#D9534F" /></View>
                  <View style={styles.householdPopupItemText}>
                    <Text style={[styles.householdPopupItemTitle, { color: "#D9534F" }]}>Leave Household</Text>
                    <Text style={styles.householdPopupItemSub}>Remove yourself from this household</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#D9534F" />
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>
        );
      })()}

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

      {/* Household Settings modal */}
      {(() => {
        const settingsHousehold = households.find((h) => h.id === settingsId);
        if (!settingsHousehold) return null;
        const displayCode = settingsHousehold.joinCode;
        const codeUpdated = settingsCodeUpdatedAt
          ? new Date(settingsCodeUpdatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : null;
        return (
          <>
            <Modal animationType="fade" transparent visible={!!settingsId && !deleteConfirmOpen} onRequestClose={() => setSettingsId(null)}>
              <Pressable style={styles.modalBackdrop} onPress={() => setSettingsId(null)}>
                <Pressable style={styles.settingsModalCard} onPress={(e) => e.stopPropagation?.()}>
                  {/* Back button */}
                  <Pressable style={styles.membersBackButton} onPress={() => { setMenuOpenId(settingsId); setSettingsId(null); }}>
                    <MaterialCommunityIcons name="arrow-left" size={22} color="#3D4F63" />
                  </Pressable>
                  {/* Header */}
                  <View style={styles.settingsModalHeader}>
                    <View style={styles.settingsModalIconCircle}>
                      <MaterialCommunityIcons name="cog-outline" size={28} color="#5D7FAF" />
                    </View>
                    <Text style={styles.settingsModalTitle}>Household Settings</Text>
                    <Text style={styles.settingsModalSub}>{settingsHousehold.name}</Text>
                    <Text style={styles.settingsModalDesc}>Manage your household's info, join code, and deletion.</Text>
                  </View>
                  <ScrollView style={styles.settingsScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {/* Household Name section */}
                    <View style={styles.settingsSection}>
                      <View style={styles.settingsSectionHeader}>
                        <View style={styles.settingsSectionIconCircle}>
                          <MaterialCommunityIcons name="home-outline" size={20} color="#5D7FAF" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.settingsSectionTitle}>Household Name</Text>
                          <Text style={styles.settingsSectionSub}>This is the name everyone in your household sees.</Text>
                        </View>
                      </View>
                      <View style={styles.settingsNameRow}>
                        <TextInput
                          style={styles.settingsNameInput}
                          value={settingsName}
                          onChangeText={setSettingsName}
                          placeholder="Household name"
                          placeholderTextColor="#8FA0B3"
                        />
                        <Pressable
                          style={[styles.settingsSaveBtn, (!settingsName.trim() || settingsNameSaving) && styles.settingsSaveBtnDisabled]}
                          onPress={handleSaveHouseholdName}
                          disabled={!settingsName.trim() || settingsNameSaving}
                        >
                          <MaterialCommunityIcons name="pencil-outline" size={15} color="#3B6DB5" />
                          <Text style={styles.settingsSaveBtnText}>{settingsNameSaving ? "Saving..." : "Save Changes"}</Text>
                        </Pressable>
                      </View>
                    </View>
                    {/* Join Code section */}
                    <View style={styles.settingsSection}>
                      <View style={styles.settingsSectionHeader}>
                        <View style={styles.settingsSectionIconCircle}>
                          <MaterialCommunityIcons name="key-outline" size={20} color="#5D7FAF" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.settingsSectionTitle}>Join Code</Text>
                          <Text style={styles.settingsSectionSub}>People can use this code to join your household.</Text>
                        </View>
                      </View>
                      <View style={styles.settingsCodeRow}>
                        <Pressable
                          style={[styles.settingsRegenBtn, settingsCodeRegenerating && styles.settingsSaveBtnDisabled]}
                          onPress={handleRegenerateCode}
                          disabled={settingsCodeRegenerating}
                        >
                          <MaterialCommunityIcons name="refresh" size={16} color="#3B6DB5" />
                          <Text style={styles.settingsRegenBtnText}>{settingsCodeRegenerating ? "Regenerating..." : "Regenerate Code"}</Text>
                        </Pressable>
                        <View style={styles.settingsCodeBox}>
                          <Text style={styles.settingsCodeText}>{displayCode}</Text>
                          <Pressable
                            onPress={() => {
                              if (typeof navigator !== "undefined" && navigator.clipboard) {
                                navigator.clipboard.writeText(displayCode);
                              }
                              setSettingsCodeCopied(true);
                              setTimeout(() => setSettingsCodeCopied(false), 2000);
                            }}
                          >
                            <MaterialCommunityIcons name={settingsCodeCopied ? "check" : "content-copy"} size={18} color={settingsCodeCopied ? "#16A34A" : "#5D7FAF"} />
                          </Pressable>
                        </View>
                      </View>
                      {codeUpdated && (
                        <Text style={styles.settingsCodeUpdated}>Last changed: {codeUpdated}</Text>
                      )}
                      <View style={styles.settingsCodeNote}>
                        <MaterialCommunityIcons name="information-outline" size={14} color="#5D7FAF" />
                        <Text style={styles.settingsCodeNoteText}>After changing the code, anyone with the old code won't be able to join.</Text>
                      </View>
                    </View>
                    {/* Delete Household section */}
                    <View style={[styles.settingsSection, styles.settingsSectionDanger]}>
                      <View style={styles.settingsDangerContent}>
                        <View style={styles.settingsDangerIconCircle}>
                          <MaterialCommunityIcons name="trash-can-outline" size={20} color="#D9534F" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.settingsDangerTitle}>Delete Household</Text>
                          <Text style={styles.settingsDangerSub}>Permanently delete this household and all its data.</Text>
                          <Text style={styles.settingsDangerSub}>This action cannot be undone.</Text>
                        </View>
                        <Pressable style={styles.settingsDeleteBtn} onPress={() => setDeleteConfirmOpen(true)}>
                          <MaterialCommunityIcons name="trash-can-outline" size={16} color="#D9534F" />
                          <Text style={styles.settingsDeleteBtnText}>Delete Household</Text>
                        </Pressable>
                      </View>
                    </View>
                  </ScrollView>
                </Pressable>
              </Pressable>
            </Modal>
            {/* Delete confirmation */}
            <Modal animationType="fade" transparent visible={deleteConfirmOpen} onRequestClose={() => setDeleteConfirmOpen(false)}>
              <View style={styles.modalBackdrop}>
                <View style={styles.modalCard}>
                  <View style={styles.leaveModalIconRow}>
                    <View style={styles.leaveModalIconCircle}>
                      <MaterialCommunityIcons name="trash-can-outline" size={26} color="#D9534F" />
                    </View>
                  </View>
                  <Text style={styles.modalTitle}>Delete Household?</Text>
                  <Text style={styles.modalSubtitle}>
                    Are you sure you want to permanently delete <Text style={{ fontWeight: "700", color: "#3D4F63" }}>{settingsHousehold.name}</Text>? All data will be lost. This cannot be undone.
                  </Text>
                  <View style={styles.modalActions}>
                    <Pressable style={styles.modalCancelButton} onPress={() => setDeleteConfirmOpen(false)}>
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={[styles.leaveConfirmButton, deletingHousehold && { opacity: 0.6 }]} onPress={handleDeleteHousehold} disabled={deletingHousehold}>
                      <Text style={styles.leaveConfirmButtonText}>{deletingHousehold ? "Deleting..." : "Delete"}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>
          </>
        );
      })()}

      {/* Cannot leave — admin must transfer ownership first */}
      {(() => {
        const cannotLeaveHousehold = households.find((h) => h.id === cannotLeaveId);
        return (
          <Modal animationType="fade" transparent visible={!!cannotLeaveId} onRequestClose={() => setCannotLeaveId(null)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <View style={styles.leaveModalIconRow}>
                  <View style={styles.cannotLeaveIconCircle}>
                    <MaterialCommunityIcons name="shield-alert" size={28} color="#F59E0B" />
                  </View>
                </View>
                <Text style={styles.modalTitle}>You're the Admin</Text>
                <Text style={styles.modalSubtitle}>
                  You cannot leave{cannotLeaveHousehold ? ` "${cannotLeaveHousehold.name}"` : " this household"} while you are the admin. Use <Text style={{ fontWeight: "700", color: "#3B6DB5" }}>View Members</Text> to transfer admin status to another member first.
                </Text>
                <View style={styles.modalActions}>
                  <Pressable style={styles.modalConfirmButton} onPress={() => setCannotLeaveId(null)}>
                    <Text style={styles.modalConfirmText}>Got it</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}

      {/* View members modal */}
      {(() => {
        const viewHousehold = households.find((h) => h.id === viewMembersId);
        const isViewerAdmin = viewHousehold?.role === "admin";
        const allMembers = [...membersData].sort((a, b) => {
          if (a.role === "admin" && b.role !== "admin") return -1;
          if (a.role !== "admin" && b.role === "admin") return 1;
          return 0;
        });
        const AVATAR_COLORS = ["#5B7AB5", "#E07B5B", "#5BA87B", "#8B5BB5", "#B5855B", "#5B9EB5"];
        function avatarColor(id: number) { return AVATAR_COLORS[id % AVATAR_COLORS.length]; }
        function fmtDate(iso: string | null) {
          if (!iso) return "";
          const d = new Date(iso);
          return `Joined ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
        }
        function initials(name: string) {
          return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
        }
        return (
          <Modal animationType="fade" transparent visible={!!viewMembersId} onRequestClose={() => { setViewMembersId(null); setMemberDotsOpenId(null); }}>
            <Pressable style={styles.modalBackdrop} onPress={() => { setViewMembersId(null); setMemberDotsOpenId(null); }}>
              <Pressable style={styles.membersModalCard} onPress={(e) => { e.stopPropagation?.(); setMemberDotsOpenId(null); }}>
                {/* Back button */}
                <Pressable style={styles.membersBackButton} onPress={() => { setMenuOpenId(viewMembersId); setViewMembersId(null); setMemberDotsOpenId(null); }}>
                  <MaterialCommunityIcons name="arrow-left" size={22} color="#3D4F63" />
                </Pressable>
                {/* Header */}
                <View style={styles.membersModalHeader}>
                  <View style={styles.membersModalIconCircle}>
                    <MaterialCommunityIcons name="account-group" size={28} color="#5D7FAF" />
                  </View>
                  <Text style={styles.membersModalTitle}>Members</Text>
                  <Text style={styles.membersModalSub}>{viewHousehold?.name ?? ""}</Text>
                  <Text style={styles.membersModalDesc}>These are the people who are part of this household.</Text>
                </View>
                <View style={styles.dropdownDivider} />
                {membersLoading ? (
                  <Text style={styles.membersLoadingText}>Loading members...</Text>
                ) : (
                  <>
                    <Text style={styles.memberCountHeader}>{membersData.length} Member{membersData.length !== 1 ? "s" : ""}</Text>
                    <ScrollView style={styles.membersScroll} nestedScrollEnabled>
                      {allMembers.map((m) => {
                        const isMemberAdmin = m.role === "admin";
                        return (
                          <View key={m.account_id}>
                            <View style={[styles.memberRow2, isMemberAdmin && styles.memberRowAdmin2]}>
                              <View style={[styles.memberAvatar, { backgroundColor: avatarColor(m.account_id) }]}>
                                <Text style={styles.memberAvatarText}>{initials(m.account_name)}</Text>
                              </View>
                              <View style={styles.memberInfo2}>
                                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                                  <Text style={styles.memberName2}>{m.account_name}</Text>
                                  <View style={[styles.memberInlineBadge, isMemberAdmin && styles.memberInlineBadgeAdmin]}>
                                    <MaterialCommunityIcons name={isMemberAdmin ? "shield-check" : "account-outline"} size={11} color={isMemberAdmin ? "#3B6DB5" : "#5B7AB5"} />
                                    <Text style={[styles.memberInlineBadgeText, isMemberAdmin && styles.memberInlineBadgeTextAdmin]}>{isMemberAdmin ? "Admin" : "Member"}</Text>
                                  </View>
                                </View>
                                <Text style={styles.memberJoined}>{fmtDate(m.joined_at)}</Text>
                              </View>
                              {!isMemberAdmin && isViewerAdmin && (
                                <View style={styles.memberAdminActions}>
                                  <Pressable
                                    style={styles.memberMakeAdminBtn}
                                    onPress={(e) => { e.stopPropagation?.(); setMakeAdminConfirmMember({ account_id: m.account_id, account_name: m.account_name }); }}
                                  >
                                    <Text style={styles.memberMakeAdminBtnText}>Make Admin</Text>
                                  </Pressable>
                                  <Pressable
                                    style={styles.memberRemoveBtn}
                                    onPress={(e) => { e.stopPropagation?.(); setRemoveConfirmMember({ account_id: m.account_id, account_name: m.account_name }); }}
                                  >
                                    <Text style={styles.memberRemoveBtnText}>Remove</Text>
                                  </Pressable>
                                </View>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </ScrollView>

                  </>
                )}
              </Pressable>
            </Pressable>
          </Modal>
        );
      })()}

      {/* Remove member confirmation */}
      <Modal animationType="fade" transparent visible={!!removeConfirmMember} onRequestClose={() => setRemoveConfirmMember(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.leaveModalIconRow}>
              <View style={styles.leaveModalIconCircle}>
                <MaterialCommunityIcons name="account-remove" size={26} color="#D9534F" />
              </View>
            </View>
            <Text style={styles.modalTitle}>Remove Member?</Text>
            <Text style={styles.modalSubtitle}>
              Are you sure you want to remove <Text style={{ fontWeight: "700", color: "#3D4F63" }}>{removeConfirmMember?.account_name}</Text> from this household? This cannot be undone — they will need a new invite code to rejoin.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelButton} onPress={() => setRemoveConfirmMember(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.leaveConfirmButton} onPress={handleRemoveMember}>
                <Text style={styles.leaveConfirmButtonText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Transfer admin confirmation */}
      <Modal animationType="fade" transparent visible={!!makeAdminConfirmMember} onRequestClose={() => setMakeAdminConfirmMember(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.leaveModalIconRow}>
              <View style={[styles.cannotLeaveIconCircle, { backgroundColor: "#EBF2FC" }]}>
                <MaterialCommunityIcons name="crown" size={26} color="#3B6DB5" />
              </View>
            </View>
            <Text style={styles.modalTitle}>Transfer Admin?</Text>
            <Text style={styles.modalSubtitle}>
              Are you sure you want to make <Text style={{ fontWeight: "700", color: "#3D4F63" }}>{makeAdminConfirmMember?.account_name}</Text> the admin? You will become a regular member and lose admin controls. This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelButton} onPress={() => setMakeAdminConfirmMember(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmButton} onPress={handleMakeAdmin}>
                <Text style={styles.modalConfirmText}>Transfer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Leave household confirmation modal */}
      {(() => {
        const leaveHousehold = households.find((h) => h.id === leaveConfirmId);
        return (
          <Modal animationType="fade" transparent visible={!!leaveConfirmId} onRequestClose={() => setLeaveConfirmId(null)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <View style={styles.leaveModalIconRow}>
                  <View style={styles.leaveModalIconCircle}>
                    <MaterialCommunityIcons name="logout" size={26} color="#D9534F" />
                  </View>
                </View>
                <Text style={styles.modalTitle}>Leave Household?</Text>
                <Text style={styles.modalSubtitle}>
                  Are you sure you want to leave{leaveHousehold ? ` "${leaveHousehold.name}"` : " this household"}? You will need an invite code to rejoin.
                </Text>
                <View style={styles.modalActions}>
                  <Pressable style={styles.modalCancelButton} onPress={() => setLeaveConfirmId(null)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.leaveConfirmButton} onPress={confirmLeaveHousehold}>
                    <Text style={styles.leaveConfirmButtonText}>Leave</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}
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
  countBadge: {
    backgroundColor: "#3B6DB5",
    borderRadius: 8.4, // 1.2x of 7
    minWidth: 26.4,    // 1.2x of 22
    height: 26.4,      // 1.2x of 22
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    display: "flex",
  },
  countBadgeText: {
    color: "#FFFFFF",
    fontSize: 15.6,    // 1.2x of 13
    fontWeight: "700",
    lineHeight: 26.4,  // match height for vertical centering
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    marginLeft: 0,
  },
  listSubtitle: { fontSize: 14, color: "#7B8A9C", marginBottom: 18, marginLeft: 38 },
  householdListScroll: { maxHeight: 480 },
  loadingText: { textAlign: "center", fontSize: 16, color: "#7B8A9C", paddingVertical: 40 },
  emptyState: { alignItems: "center", paddingVertical: 36 },
  emptyTitle: { textAlign: "center", fontSize: 20, fontWeight: "600", color: "#596474", marginTop: 12, marginBottom: 8 },
  emptySubtitle: { textAlign: "center", fontSize: 15, lineHeight: 22, color: "#7C8797", paddingHorizontal: 12 },
  householdCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#E6EAF0", flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#AAB6C5", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 1 },
  householdCardHovered: { backgroundColor: "#EBF2FC", borderColor: "#BDD0EE" },
  householdCardLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  householdCardRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  dotsButton: { padding: 4, borderRadius: 8 },
  dropdownDivider: { height: 1, backgroundColor: "#E6EAF0", marginVertical: 6 },
  householdPopup: { width: "100%", maxWidth: 420, backgroundColor: "#FFFFFF", borderRadius: 22, paddingTop: 20, paddingBottom: 8, paddingHorizontal: 0, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 10, alignSelf: "center", overflow: "hidden" },
  householdPopupClose: { position: "absolute", top: 14, right: 14, zIndex: 10, padding: 6 },
  householdPopupHeader: { alignItems: "center", paddingBottom: 16, paddingHorizontal: 24 },
  householdPopupIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#EBF2FC", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  householdPopupName: { fontSize: 20, fontWeight: "700", color: "#3D4F63", textAlign: "center", marginBottom: 8 },
  householdPopupRoleBadge: { backgroundColor: "#EBF2FC", borderRadius: 20, paddingVertical: 4, paddingHorizontal: 14 },
  householdPopupRoleText: { fontSize: 13, color: "#3B6DB5", fontWeight: "600" },
  householdPopupRoleBadgeAdmin: { flexDirection: "row", alignItems: "center", backgroundColor: "#3B6DB5", borderRadius: 20, paddingVertical: 5, paddingHorizontal: 14 },
  householdPopupRoleTextAdmin: { fontSize: 13, color: "#FFFFFF", fontWeight: "600" },
  householdPopupSectionLabel: { fontSize: 11, fontWeight: "700", color: "#8FA0B3", letterSpacing: 0.8, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 6 },
  householdPopupItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 24, paddingVertical: 13 },
  householdPopupItemLeave: { backgroundColor: "#FFF5F5" },
  householdPopupItemIcon: { width: 32, alignItems: "center" },
  householdPopupItemText: { flex: 1 },
  householdPopupItemTitle: { fontSize: 15, fontWeight: "600", color: "#3D4F63", marginBottom: 1 },
  householdPopupItemSub: { fontSize: 12, color: "#8FA0B3" },
  householdPopupCancel: { marginHorizontal: 24, marginTop: 8, marginBottom: 12, height: 46, borderRadius: 12, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center" },
  householdPopupCancelText: { fontSize: 15, fontWeight: "600", color: "#596474" },
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
  leaveConfirmButton: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: "#D9534F" },
  leaveConfirmButtonText: { color: "#FFFFFF", fontWeight: "700" },
  leaveModalIconRow: { alignItems: "center", marginBottom: 12 },
  leaveModalIconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#FFF0F0", alignItems: "center", justifyContent: "center" },
  cannotLeaveIconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#FFFBEB", alignItems: "center", justifyContent: "center" },
  modalCancelButton: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: "#EEF2F7" },
  modalCancelText: { color: "#64748B", fontWeight: "600" },
  modalConfirmButton: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: "#3B6DB5" },
  modalConfirmText: { color: "#FFFFFF", fontWeight: "700" },
  membersModalCard: { width: "100%", maxWidth: 500, backgroundColor: "#FFFFFF", borderRadius: 22, paddingTop: 20, paddingBottom: 16, shadowColor: "#000000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 8, alignSelf: "center", maxHeight: "80%" },
  membersModalHeader: { alignItems: "center", paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8 },
  membersModalIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#EBF2FC", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  membersModalTitle: { fontSize: 22, fontWeight: "700", color: "#3D4F63", marginBottom: 2 },
  membersModalSub: { fontSize: 14, color: "#7B8A9C", marginBottom: 4 },
  membersModalDesc: { fontSize: 14, color: "#7B8A9C", textAlign: "center" },
  membersBackButton: { position: "absolute", top: 14, left: 14, zIndex: 10, padding: 6 },
  memberCountHeader: { fontSize: 16, fontWeight: "700", color: "#3D4F63", paddingHorizontal: 20, paddingVertical: 12 },
  membersLoadingText: { textAlign: "center", color: "#7B8A9C", paddingVertical: 24, fontSize: 15 },
  membersScroll: { paddingHorizontal: 12 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  memberAvatarText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  memberRow2: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, marginBottom: 4, borderWidth: 1, borderColor: "transparent" },
  memberRowAdmin2: { backgroundColor: "#EBF2FC", borderColor: "#D0E2F7" },
  memberInfo2: { flex: 1 },
  memberName2: { fontSize: 15, fontWeight: "600", color: "#3D4F63" },
  memberJoined: { fontSize: 12, color: "#8FA0B3", marginTop: 1 },
  memberInlineBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F0F4FA", borderRadius: 10, paddingVertical: 2, paddingHorizontal: 8 },
  memberInlineBadgeAdmin: { backgroundColor: "#EBF2FC" },
  memberInlineBadgeText: { fontSize: 11, color: "#5B7AB5", fontWeight: "600" },
  memberInlineBadgeTextAdmin: { color: "#3B6DB5" },
  currentAdminBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F0FDF4", borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: "#BBF7D0" },
  currentAdminText: { fontSize: 12, color: "#16A34A", fontWeight: "600" },
  memberAdminActions: { flexDirection: "row", gap: 6 },
  memberMakeAdminBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#EBF2FC", borderWidth: 1, borderColor: "#C5D8F0" },
  memberMakeAdminBtnText: { fontSize: 12, fontWeight: "600", color: "#3B6DB5" },
  memberRemoveBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#FFF5F5", borderWidth: 1, borderColor: "#F5BCBC" },
  memberRemoveBtnText: { fontSize: 12, fontWeight: "600", color: "#D9534F" },
  membersFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 14, paddingHorizontal: 8 },
  membersFooterText: { fontSize: 12, color: "#8FA0B3" },
  memberActionSheet: { borderTopWidth: 1, borderTopColor: "#E6EAF0", backgroundColor: "#FFFFFF", borderBottomLeftRadius: 22, borderBottomRightRadius: 22, paddingTop: 4, paddingBottom: 8 },
  memberActionSheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#D0D9E6", alignSelf: "center", marginTop: 10, marginBottom: 8 },
  memberActionSheetName: { fontSize: 13, fontWeight: "600", color: "#8FA0B3", paddingHorizontal: 20, paddingVertical: 6 },
  memberActionSheetItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  memberActionSheetItemText: { fontSize: 15, fontWeight: "600", color: "#3D4F63" },
  memberActionSheetCancel: { marginHorizontal: 16, marginTop: 6, marginBottom: 4, height: 44, borderRadius: 12, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center" },
  memberActionSheetCancelText: { fontSize: 15, fontWeight: "600", color: "#596474" },
  // Household Settings modal
  settingsModalCard: { width: "100%", maxWidth: 560, backgroundColor: "#FFFFFF", borderRadius: 22, paddingTop: 20, paddingBottom: 0, shadowColor: "#000000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 8, alignSelf: "center", maxHeight: "88%" },
  settingsModalHeader: { alignItems: "center", paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8 },
  settingsModalIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#EBF2FC", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  settingsModalTitle: { fontSize: 22, fontWeight: "700", color: "#3D4F63", marginBottom: 2 },
  settingsModalSub: { fontSize: 14, fontWeight: "600", color: "#3D4F63", marginBottom: 2 },
  settingsModalDesc: { fontSize: 13, color: "#7B8A9C", textAlign: "center" },
  settingsScroll: { paddingHorizontal: 20, paddingBottom: 20 },
  settingsSection: { borderWidth: 1, borderColor: "#E6EAF0", borderRadius: 16, padding: 16, marginBottom: 14, backgroundColor: "#FAFBFD" },
  settingsSectionDanger: { borderColor: "#F5BCBC", backgroundColor: "#FFF8F8" },
  settingsSectionHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  settingsSectionIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#EBF2FC", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  settingsSectionTitle: { fontSize: 15, fontWeight: "700", color: "#3D4F63", marginBottom: 3 },
  settingsSectionSub: { fontSize: 13, color: "#7B8A9C", lineHeight: 18 },
  settingsNameRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  settingsNameInput: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: "#D7DFEA", paddingHorizontal: 14, fontSize: 15, color: "#334155", backgroundColor: "#FFFFFF" },
  settingsSaveBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: "#C5D8F0", backgroundColor: "#FFFFFF" },
  settingsSaveBtnDisabled: { opacity: 0.5 },
  settingsSaveBtnText: { fontSize: 13, fontWeight: "600", color: "#3B6DB5" },
  settingsCodeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  settingsRegenBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: "#C5D8F0", backgroundColor: "#FFFFFF" },
  settingsRegenBtnText: { fontSize: 13, fontWeight: "600", color: "#3B6DB5" },
  settingsCodeBox: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: "#C5D8F0", backgroundColor: "#FFFFFF" },
  settingsCodeText: { fontSize: 16, fontWeight: "700", color: "#3B6DB5", letterSpacing: 1.5 },
  settingsCodeUpdated: { fontSize: 12, color: "#8FA0B3", marginBottom: 8 },
  settingsCodeNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#EBF2FC", borderRadius: 10, padding: 10 },
  settingsCodeNoteText: { flex: 1, fontSize: 12, color: "#4A6FA5", lineHeight: 18 },
  settingsDangerContent: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  settingsDangerIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFF0F0", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  settingsDangerTitle: { fontSize: 15, fontWeight: "700", color: "#D9534F", marginBottom: 3 },
  settingsDangerSub: { fontSize: 13, color: "#7B8A9C", lineHeight: 18 },
  settingsDeleteBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: "#F5BCBC", backgroundColor: "#FFF0F0" },
  settingsDeleteBtnText: { fontSize: 13, fontWeight: "600", color: "#D9534F" },
});
