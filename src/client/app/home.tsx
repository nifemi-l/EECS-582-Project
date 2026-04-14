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
  - 4/13/26: Wide layout — household column height matches measured YHYP column; list scrolls inside right card
Preconditions: User is authenticated before reaching this screen
Postconditions: Renders either an empty state or a list of households the user belongs to
Errors: None
Side effects: None
Invariants: None
Known faults: None. 
*/

// Imports
import React, { useEffect, useMemo, useState } from "react";
import { AuthLoadingScreen, useAuthGuard } from "../utils/useAuthGuard";
import { Alert, Image, LayoutChangeEvent, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getToken, clearToken } from "../utils/authStorage";
import {
  border,
  brand,
  brandMuted,
  heroGradient,
  navy,
  pageBg,
  navLogoutHover,
  navLogoutWebShell,
  navLogoutWebShellCompact,
  navLogoutWebShellHover,
  primaryButtonGradient,
  surfaceSoft,
  textPrimary,
  textSecondary,
} from "../theme/colors";

// Base URL for backend API requests, set through environment variable in app config
const API_URL = process.env.EXPO_PUBLIC_API_URL;

/** Web hover: slightly darker primary CTA gradient (color-only feedback) */
const PRIMARY_BUTTON_GRADIENT_HOVER = ["#2F5494", "#4A7ABF"] as const;
/** Web hover: secondary outline button */
const SECONDARY_BUTTON_BG_HOVER = "#E8EEF8";
const SECONDARY_BUTTON_BORDER_HOVER = "#2E5FA3";
const SECONDARY_BUTTON_LABEL_HOVER = "#254A82";
// The local Household model shape used by HomeScreen state and rendering
const HOUSEHOLD_ORDER_KEY = "household_order";

// This is the shape of the household data as used in the HomeScreen component state and UI rendering
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
    // Split the JWT into its three parts: header, payload, and signature
    const parts = token.split(".");

    // If the token does not have exactly three parts, treat it as invalid
    if (parts.length !== 3) return null;

    // Convert the payload from base64url format to standard base64 format
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");

    // Add '=' padding until the payload length is a multiple of 4
    while (payload.length % 4 !== 0) payload += "="; // Add padding (for multiple of 4)
    
    // Decode the payload string into plain text
    const decoded = Platform.OS === "web" 
      ? atob(payload)
      : global.atob?.(payload) ?? atob(payload);

    // Parse the decoded payload text into a JavaScript object
    const parsed = JSON.parse(decoded);

    // Return the username if it exists in the payload
    return parsed.username || null;

  } catch {
    // Return null if the token cannot be decoded or parsed
    return null;
  }
}

// Load the user's saved household order from AsyncStorage
async function loadHouseholdOrder(): Promise<string[] | null> {
  try {
    // Read the stored household order value using the shared storage key
    const raw = await AsyncStorage.getItem(HOUSEHOLD_ORDER_KEY);

    // Return null if no saved order exists
    if (!raw) return null;

    // Convert the stored JSON string into a JavaScript value
    const parsed = JSON.parse(raw);

    // Return null if the parsed value is not an array
    if (!Array.isArray(parsed)) return null;

    // Filter the parsed array to include only string values (valid household ids)
    return parsed.filter((id) => typeof id === "string");
  } catch (_err) {
    // Return null if reading or parsing the stored value fails
    return null;
  }
}

// Save the user's household order to AsyncStorage
async function saveHouseholdOrder(ids: string[]) {
  try {
    // Convert the household id array into a JSON string and store it using the shared storage key
    await AsyncStorage.setItem(HOUSEHOLD_ORDER_KEY, JSON.stringify(ids));
  } catch (_err) {
    // Ignore errors when saving the household order
  }
}

// Render the home screen after checking whether the user is authenticated
export default function HomeScreen() {
  // Get the current authentication check status and whether the user is authenticated
  const { isCheckingAuth, isAuthenticated } = useAuthGuard();

  // Show the loading screen while authentication is still being checked
  // Also keep showing it if the user is not authenticated and is being redirected
  if (isCheckingAuth || !isAuthenticated) {
    return <AuthLoadingScreen />;
  }
  // Render the authenticated version of the home screen once access is confirmed
  return <AuthenticatedHomeScreen />;
}

// The main content of the home screen that is shown to authenticated users. 
// It fetches and displays the user's households, allows creating and joining households, and provides navigation into each household's screen tree.
function AuthenticatedHomeScreen() {
  // Store the households currently shown on the screen
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);

  // Track whether the create and join household modals are open
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  // Store the text entered into the create and join household inputs
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");

  // Track whether the household list is still being loaded from the backend
  const [isLoading, setIsLoading] = useState(true);

  // Store the username decoded from the JWT for the welcome message
  const [username, setUsername] = useState<string | null>(null);

  // Wide two-column --> right-hand card height tracks the left
  const [wideYhypColumnHeight, setWideYhypColumnHeight] = useState<number | null>(null);

  // Define the possible messages that can appear in the quote card
  const carouselMessages = [
    'A clean home is a happy home.',
    'Small tasks today, big results tomorrow.',
    'A little effort goes a long way.',
    'Clean space, clear mind.',
    'Consistency beats perfection.',
    'Tidy home, peaceful life.',
    'Progress over perfection.',
    'Every small task counts.',
    'Take it one room at a time.',
    'Done is better than perfect.',
    'Keep it simple, keep it clean.',
    'Good habits build great homes.',
    'Reset your space, reset your mind.',
    'Clean today, relax tomorrow.',
    'Your future self will thank you.',
  ];

  // Pick one random message when the screen first loads
  const [carouselIndex] = useState(() => Math.floor(Math.random() * carouselMessages.length));

  // On first render, load the current user's household membership from /household/mine
  useEffect(() => {
    async function loadHouseholds() {
      // Mark the household list as loading before starting the request
      setIsLoading(true);

      // Get the saved auth token so the request can be authorized
      const token = await getToken() as string;

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

        // Convert the returned household data into the local HouseholdSummary format
        if (Array.isArray(data.households)) {
          const fetched: HouseholdSummary[] = data.households.map((h: any) => ({
            id: String(h.household_id),
            name: h.household_name,
            joinCode: h.join_code || "",
            role: h.role || "member",
            adminName: h.admin_name || "Unknown",
          }));

          // Load the user's saved household order from local storage
          const savedOrder = await loadHouseholdOrder();

          // Reorder the fetched households to match the saved order when possible
          if (savedOrder && savedOrder.length > 0) {
            const byId = new Map(fetched.map((h) => [h.id, h]));
            const ordered: HouseholdSummary[] = [];

            // Add households in the saved order if they still exist
            for (const id of savedOrder) {
              const item = byId.get(String(id));
              if (item) {
                ordered.push(item);
                byId.delete(String(id));
              }
            }

            // Append any remaining households that were not in the saved order
            ordered.push(...Array.from(byId.values()));
            setHouseholds(ordered);
          } else {
            // Use the fetched order if no saved order exists
            setHouseholds(fetched);
          }
        } else {
          // Clear the list if the backend did not return a valid households array
          setHouseholds([]);
        }
      } catch (error: any) {
        // Clear the list and show an error if the request fails
        Alert.alert("Network Error", error?.message || "Unable to fetch households.");
        setHouseholds([]);
      } finally {
        // Always stop the loading state when the request finishes
        setIsLoading(false);
      }
    }
    // Start loading the user's households
    loadHouseholds();
  }, []);

  // Memoized value: true if the household list is empty, used to show empty state UI
  const isEmpty = useMemo(() => households.length === 0, [households]);

  // Responsive layout: get the current screen width and determine if the layout should be wide
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth > 860;
  const isNavCompact = windowWidth < 480;
  const isContentCompact = windowWidth < 720;

  const sectionHomeIconSize = isContentCompact ? 19 : 22;
  const householdGroupIconSize = isContentCompact ? 24 : 28;
  const householdChevronSize = isContentCompact ? 22 : 26;
  const householdDotsSize = isContentCompact ? 20 : 22;
  const emptyStateIconSize = isContentCompact ? 52 : 64;
  const secondaryLinkIconSize = isContentCompact ? 19 : 22;

  // Welcome banner: headline + quote line --> scaled slightly for readability
  const heroTitleFontSize = Math.max(18, Math.min(26, windowWidth * 0.062));
  const heroCarouselFontSize = isNavCompact
    ? Math.max(14, Math.min(17, windowWidth * 0.039))
    : 17;
  const heroCarouselLineHeight = Math.round(heroCarouselFontSize * (isNavCompact ? 1.45 : 1.4));
  const heroBannerPaddingBottom = isNavCompact ? 56 : 60;
  const heroCarouselLastLinePad = isNavCompact ? 14 : 16;

  useEffect(() => {
    if (!isWide) {
      setWideYhypColumnHeight(null);
    }
  }, [isWide]);

  function onWideLeftColumnLayout(event: LayoutChangeEvent) {
    if (!isWide) return;
    const next = Math.round(event.nativeEvent.layout.height);
    if (next < 8) return;
    setWideYhypColumnHeight((prev) => (prev === next ? prev : next));
  }

  // Logs the user out by clearing the auth token and redirecting to login
  async function handleLogout() {
    await clearToken();
    router.replace("/login");
  }

  /**
   * Moves the selected household to the top of the list and navigates to its graphics screen.
   * This also persists the new order in local storage for future sessions.
   * @param id The id of the household to open
   */
  async function openHousehold(id: string) {
    setHouseholds((prev) => {
      
      // Find the index of the selected household in the current list
      const index = prev.findIndex((h) => h.id === id);
      
      // If already first or not found, do nothing
      if (index <= 0) return prev;
      
      // Move the selected household to the front
      const selected = prev[index];
      const updated = [selected, ...prev.slice(0, index), ...prev.slice(index + 1)];
      saveHouseholdOrder(updated.map((h) => h.id));
      return updated;
    });
    // Navigate to the selected household's graphics screen
    router.push({ pathname: "/household/[id]/graphics", params: { id } });
  }

  /**
   * Creates a new household by sending a request to the backend.
   * On success, adds the new household to the top of the list and shows a success message.
   */
  async function handleCreateHousehold() {
    // Remove extra spaces from the entered household name
    const trimmed = newHouseholdName.trim();
    
    // Block if no name entered
    if (!trimmed) {
      Alert.alert("Missing name", "Please enter a household name.");
      return;
    }
    
    // Get the saved auth token so the request can be authorized
    const token = await getToken() as string;

    try {
      // Send the create household request to the backend
      const response = await fetch(`${API_URL}/household/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmed }),
      });
      
      // Parse the JSON body returned by the backend
      const data = await response.json();
      
      // Show an error message and stop if the request failed
      if (!response.ok) {
        Alert.alert("Create failed", data.error || "Could not create household.");
        return;
      }
      
      // Convert the returned household data into the local HouseholdSummary format
      const household = data.household;
      const created: HouseholdSummary = {
        id: String(household.household_id),
        name: household.household_name,
        joinCode: household.join_code || "",
        role: "admin",
        adminName: household.admin_name || "Unknown",
      };
      
      // Add the new household to the top of the list
      setHouseholds((prev) => [created, ...prev]);
      
      // Clear the input and close the create household modal
      setNewHouseholdName("");
      setCreateOpen(false);
      
      // Show a success message with the new household's invite code
      Alert.alert("Household created", `${created.name} was created. Invite code: ${created.joinCode}`);
    } catch (error: any) {
      // Show an error message if the request fails before a response is returned
      Alert.alert("Network Error", error?.message || "Unable to create household.");
    }
  }

  /**
   * Joins an existing household using an invite code.
   * On success, adds the joined household to the list and shows a confirmation.
   */
  async function handleJoinHousehold() {
    // Remove extra spaces and convert to uppercase
    const trimmed = joinCodeInput.trim().toUpperCase();
    
    // Block if no code entered
    if (!trimmed) {
      Alert.alert("Missing code", "Please enter a household code.");
      return;
    }
    
    // Get the saved auth token so the request can be authorized
    const token = await getToken() as string;
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
      
      // Parse the JSON response body
      const data = await response.json();
      
      // Show an error message and stop if the join request failed
      if (!response.ok) {
        Alert.alert("Join failed", data.error || "Invalid join code.");
        return;
      }
      
      // Convert the returned household data into the local HouseholdSummary format
      const household = data.household;
      const joined: HouseholdSummary = {
        id: String(household.household_id),
        name: household.household_name,
        joinCode: household.join_code || trimmed,
        role: "member",
        adminName: household.admin_name || "Unknown",
      };
      
      // Add the joined household to the list only if it is not already present
      const alreadyExists = households.some((h) => h.id === joined.id);
      if (!alreadyExists) {
        setHouseholds((prev) => [joined, ...prev]);
      }
      
      // Clear the input and close the join household modal
      setJoinCodeInput("");
      setJoinOpen(false);
      
      // Confirm the household was joined successfully
      Alert.alert("Joined household", `You joined ${joined.name}.`);
    } catch (error: any) {
      // Show an error message if the request fails before a response is returned
      Alert.alert("Network Error", error?.message || "Unable to join household.");
    }
  }

  /**
   * Handles the leave household action for members.
   * Admins are blocked and shown an info modal; members get a confirmation modal.
   * @param householdId The id of the household to leave
   */
  function handleLeaveHousehold(householdId: string) {
    // Find the selected household in the current list
    const household = households.find((h) => h.id === householdId);

    // If the household is not found (should not happen), do nothing
    if (!household) return;

    // Prevent admins from leaving and show the informational modal instead
    if (household.role === "admin") {
      setMenuOpenId(null);
      setCannotLeaveId(householdId);
      return;
    }

    // Close the options menu and open the leave confirmation modal for members
    setMenuOpenId(null);
    setLeaveConfirmId(householdId);
  }

  /**
   * Called when the user confirms leaving a household (from the modal).
   * Removes the household from the list on success and shows a confirmation.
   */
  async function confirmLeaveHousehold() {
    // If no household is currently pending leave confirmation, do nothing (should not happen)
    if (!leaveConfirmId) return;

    // Find the selected household so its name can be shown in the success message
    const household = households.find((h) => h.id === leaveConfirmId);

    // Get the saved auth token so the request can be authorized
    const token = await getToken() as string;

    try {
      // Send the leave household request to the backend
      const response = await fetch(`${API_URL}/household/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ household_id: Number(leaveConfirmId) }),
      });

      // Parse the JSON response body
      const data = await response.json();

      // Show an error message and stop if the leave request failed
      if (!response.ok) {
        Alert.alert("Error", data.error || "Unable to leave household.");
        return;
      }

      // Remove the household from the local list after the leave succeeds
      setHouseholds((prev) => prev.filter((h) => h.id !== leaveConfirmId));

      // Close the leave confirmation modal
      setLeaveConfirmId(null);

      // Show a success message with the household name
      Alert.alert("Left household", `You have left "${household?.name ?? "the household"}".`);
    } catch (error: any) {
      // Show an error message if the request fails before a response is returned
      Alert.alert("Network Error", error?.message || "Unable to leave household.");
    }
  }

  /**
   * [Relavent to the below lines]
   * These state variables control the interactive UI for household actions.
   * They keep track of which household or member the user is currently
   * interacting with, which modals or menus are open, and whether certain
   * actions are loading or waiting for confirmation. Without this state,
   * the screen would not know which household to highlight, which popup
   * to display, which member list to load, or which settings action is
   * currently being performed.
   */

  // UI state: which household card is hovered (for web hover effect)
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Web-only hover for navbar logout and illustration CTAs (color only)
  const [hoverLogout, setHoverLogout] = useState(false);
  const [hoverCreateHousehold, setHoverCreateHousehold] = useState(false);
  const [hoverJoinCode, setHoverJoinCode] = useState(false);
  // UI state: which household card's menu is open
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  // UI state: which household is pending leave confirmation
  const [leaveConfirmId, setLeaveConfirmId] = useState<string | null>(null);
  // UI state: which admin household triggered the "cannot leave" info modal
  const [cannotLeaveId, setCannotLeaveId] = useState<string | null>(null);
  // UI state: which household's member list is being viewed
  const [viewMembersId, setViewMembersId] = useState<string | null>(null);
  // Data: list of members for the currently viewed household
  const [membersData, setMembersData] = useState<{ account_id: number; account_name: string; role: string; joined_at: string | null }[]>([]);
  // UI state: whether the members list is loading
  const [membersLoading, setMembersLoading] = useState(false);
  // UI state: which member row has its dots menu open
  const [memberDotsOpenId, setMemberDotsOpenId] = useState<number | null>(null);
  // UI state: member awaiting remove confirmation
  const [removeConfirmMember, setRemoveConfirmMember] = useState<{ account_id: number; account_name: string } | null>(null);
  // UI state: member awaiting make-admin confirmation
  const [makeAdminConfirmMember, setMakeAdminConfirmMember] = useState<{ account_id: number; account_name: string } | null>(null);
  // UI state: household settings modal
  const [settingsId, setSettingsId] = useState<string | null>(null);
  // UI state: household name in the settings modal
  const [settingsName, setSettingsName] = useState("");
  // UI state: whether the settings name is being saved
  const [settingsNameSaving, setSettingsNameSaving] = useState(false);
  // UI state: when the join code was last updated
  const [settingsCodeUpdatedAt, setSettingsCodeUpdatedAt] = useState<string | null>(null);
  // UI state: whether the join code was just copied
  const [settingsCodeCopied, setSettingsCodeCopied] = useState(false);
  // UI state: whether the join code is being regenerated
  const [settingsCodeRegenerating, setSettingsCodeRegenerating] = useState(false);
  // UI state: whether the delete confirmation modal is open
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // UI state: whether the household is being deleted
  const [deletingHousehold, setDeletingHousehold] = useState(false);

  function handleOpenSettings(householdId: string) {
    // Open the settings modal for the selected household and reset its temporary UI state
    const h = households.find((hh) => hh.id === householdId);

    // Find the selected household in the current list
    if (!h) return;

    setMenuOpenId(null); // Close the household options menu before opening settings
    setSettingsName(h.name); // Load the current household name into the settings input

    // Reset temporary settings state for a fresh modal session
    setSettingsCodeUpdatedAt(null); 
    setSettingsCodeCopied(false);
    setDeleteConfirmOpen(false);

    setSettingsId(householdId); // Open the settings modal for the selected household
  }

  // Save the updated household name through the backend and refresh it in local state
  async function handleSaveHouseholdName() {
    // Stop if no household settings are open or if the entered name is blank
    if (!settingsId || !settingsName.trim()) return;

    // Mark the household name as currently being saved
    setSettingsNameSaving(true);

    try {
      // Get the saved auth token so the request can be authorized
      const token = await getToken() as string;

      // Send the updated household name to the backend
      const response = await fetch(`${API_URL}/household/${settingsId}/update_name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: settingsName.trim() }),
      });

      // Parse the JSON response body
      const data = await response.json();

      // Show an error message and stop if the request failed
      if (!response.ok) { 
        Alert.alert("Error", data.error || "Could not update name."); 
        return;
      }

      // Update the household name in local state after the save succeeds
      setHouseholds((prev) => 
        prev.map((h) => 
          h.id === settingsId ? { ...h, name: data.household.household_name } : h
        )
      );
    } catch (e: any) {
      // Show an error message if the request fails before a response is returned
      Alert.alert("Network Error", e?.message || "Unable to save name.");
    } finally {
      // Always stop the saving state when the request finishes
      setSettingsNameSaving(false);
    }
  }

  // Generate a new join code for the selected household and update it in local state
  async function handleRegenerateCode() {
    // // Stop if no household settings are currently open
    if (!settingsId) return;

    // Mark the join code as currently being regenerated
    setSettingsCodeRegenerating(true);

    try {
      // Get the saved auth token so the request can be authorized
      const token = await getToken() as string;

      // Send the regenerate join code request to the backend
      const response = await fetch(`${API_URL}/household/${settingsId}/regenerate_code`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      // Parse the JSON response body
      const data = await response.json();

      // Show an error message and stop if the request failed
      if (!response.ok) { Alert.alert("Error", data.error || "Could not regenerate code."); return; }

      // Read the new join code and update timestamp returned by the backend
      const newCode = data.household.join_code;
      const updatedAt = data.household.updated_at;

      // Update the household's join code in local state
      setHouseholds((prev) => 
        prev.map((h) => 
          h.id === settingsId ? { ...h, joinCode: newCode } : h
        )
      );

      // Store when the join code was last updated
      setSettingsCodeUpdatedAt(updatedAt);
    } catch (e: any) {
      // Show an error message if the request fails before a response is returned
      Alert.alert("Network Error", e?.message || "Unable to regenerate code.");
    } finally {
      // Always stop the regenerating state when the request finishes
      setSettingsCodeRegenerating(false);
    }
  }

  // Delete the selected household through the backend and remove it from local state
  async function handleDeleteHousehold() {
    // Stop if no household settings are currently open
    if (!settingsId) return;

    // Mark the household as currently being deleted
    setDeletingHousehold(true);

    try {
      // Get the saved auth token so the request can be authorized
      const token = await getToken() as string;

      // Send the delete household request to the backend
      const response = await fetch(`${API_URL}/household/${settingsId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      // Parse the JSON response body
      const data = await response.json();

      // Show an error message and stop if the request failed
      if (!response.ok) { 
        Alert.alert("Error", data.error || "Could not delete household."); 
        return; 
      }

      // Remove the deleted household from the local list
      setHouseholds((prev) => prev.filter((h) => h.id !== settingsId));

      // Close the delete confirmation modal
      setDeleteConfirmOpen(false);

      // Close the household settings modal
      setSettingsId(null);
    } catch (e: any) {
      // Show an error message if the request fails before a response is returned
      Alert.alert("Network Error", e?.message || "Unable to delete household.");
    } finally {
      // Always stop the deleting state when the request finishes
      setDeletingHousehold(false);
    }
  }

  // Open the members view for the selected household and load its member list
  async function handleViewMembers(householdId: string) {
    setMenuOpenId(null); // Close the household options menu before opening the members view
    setViewMembersId(householdId); // Open the members view for the selected household
    setMembersData([]); // Clear any previously loaded member data
    setMemberDotsOpenId(null); // Close any open member row dots menu
    setMembersLoading(true); // Mark the members list as currently loading

    try {
      // Get the saved auth token so the request can be authorized
      const token = await getToken() as string;

      // Request the selected household's member list from the backend
      const response = await fetch(`${API_URL}/household/${householdId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Parse the JSON response body
      const data = await response.json();

      // Store the returned member list if the request succeeded
      if (response.ok) setMembersData(data.members ?? []);
    } catch (_e) {
      // Ignore request errors and leave the member list empty
    } finally {
      // Always stop the loading state when the request finishes
      setMembersLoading(false);
    }
  }

  // Remove the selected member from the currently viewed household
  async function handleRemoveMember() {
    // Stop if no member is waiting for removal confirmation or no household is open
    if (!removeConfirmMember || !viewMembersId) return;

    // Get the saved auth token so the request can be authorized
    const token = await getToken() as string;

    try {
      // Send the remove member request to the backend
      const response = await fetch(`${API_URL}/household/${viewMembersId}/remove_member`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ account_id: removeConfirmMember.account_id }),
      });

      // Parse the JSON response body
      const data = await response.json();

      // Show an error message and stop if the request failed
      if (!response.ok) { 
        Alert.alert("Error", data.error || "Could not remove member."); 
        return; 
      }

      // Remove the deleted member from the local members list
      setMembersData((prev) => 
        prev.filter((m) => 
          m.account_id !== removeConfirmMember.account_id
        )
      );

      // Close the remove member confirmation modal
      setRemoveConfirmMember(null);
    } catch (e: any) {
      // Show an error message if the request fails before a response is returned
      Alert.alert("Network Error", e?.message || "Unable to remove member.");
    }
  }

  // Transfer admin ownership to the selected member in the currently viewed household
  async function handleMakeAdmin() {
    // Stop if no member is waiting for make-admin confirmation or no household is open
    if (!makeAdminConfirmMember || !viewMembersId) return;

    // Get the saved auth token so the request can be authorized
    const token = await getToken() as string;

    try {
      // Send the transfer admin request to the backend
      const response = await fetch(`${API_URL}/household/${viewMembersId}/transfer_admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ account_id: makeAdminConfirmMember.account_id }),
      });

      // Parse the JSON response body
      const data = await response.json();

      // Show an error message and stop if the request failed
      if (!response.ok) { 
        Alert.alert("Error", data.error || "Could not transfer admin."); 
        return; 
      }

      // Update the local member list so the new admin and old admin roles are swapped
      setMembersData((prev) =>
        prev.map((m) => {
          if (m.account_id === makeAdminConfirmMember.account_id) return { ...m, role: "admin" };
          if (m.role === "admin") return { ...m, role: "member" };
          return m;
        })
      );

      // Update the household list so the household's displayed role and admin name stay in sync
      setHouseholds((prev) =>
        prev.map((h) =>
          h.id === viewMembersId
            ? { ...h, role: "member" as const, adminName: makeAdminConfirmMember.account_name }
            : h
        )
      );

      // Close the make-admin confirmation modal
      setMakeAdminConfirmMember(null);
    } catch (e: any) {
      // Show an error message if the request fails before a response is returned
      Alert.alert("Network Error", e?.message || "Unable to transfer admin.");
    }
  }

  // First letter of the username for the avatar circle
  const avatarLetter = username ? username.charAt(0).toUpperCase() : "?";

  const logoIconSize = isNavCompact ? 22 : 28;
  const navHomeIconSize = isNavCompact ? 17 : 20;

  return (
    <View style={styles.screen}>
      {/* --- Top Navbar --- */}
      <View style={[styles.navbar, isNavCompact && styles.navbarCompact]}>
        <View style={styles.navLeft}>
          <View style={[styles.logoBox, isNavCompact && styles.logoBoxCompact]}>
            <MaterialCommunityIcons name="home" size={logoIconSize} color="#FFFFFF" />
          </View>
          <View style={styles.navBrandWrap}>
            <Text
              style={[styles.navBrand, isNavCompact && styles.navBrandCompact]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              HomeSeeHome
            </Text>
          </View>
        </View>
        <View style={[styles.navRight, isNavCompact && styles.navRightCompact]}>
          <View
            style={[styles.navLink, isNavCompact && styles.navLinkCompact]}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <MaterialCommunityIcons name="home" size={navHomeIconSize} color="#FFFFFF" />
            <Text style={[styles.navLinkText, isNavCompact && styles.navLinkTextCompact]}>Home</Text>
          </View>
          <Pressable
            style={[
              styles.navLogout,
              isNavCompact && styles.navLogoutCompact,
              Platform.OS === "web" && styles.navLogoutWebShell,
              Platform.OS === "web" && isNavCompact && styles.navLogoutWebShellCompact,
              Platform.OS === "web" && hoverLogout && styles.navLogoutWebShellHover,
            ]}
            onPress={handleLogout}
            // @ts-ignore web-only pointer hover
            onMouseEnter={() => Platform.OS === "web" && setHoverLogout(true)}
            // @ts-ignore web-only pointer hover
            onMouseLeave={() => Platform.OS === "web" && setHoverLogout(false)}
          >
            <View style={[styles.avatarCircle, isNavCompact && styles.avatarCircleCompact]}>
              <Text style={[styles.avatarText, isNavCompact && styles.avatarTextCompact]}>{avatarLetter}</Text>
            </View>
            <Text
              style={[
                styles.navLinkText,
                isNavCompact && styles.navLinkTextCompact,
                Platform.OS === "web" && hoverLogout && { color: navLogoutHover.label },
              ]}
            >
              Logout
            </Text>
          </Pressable>
        </View>
      </View>

      {/* --- Hero Banner with curved bottom --- */}
      <View>
        <LinearGradient
          colors={[...heroGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.heroBanner,
            isNavCompact && styles.heroBannerCompact,
            { paddingBottom: heroBannerPaddingBottom },
          ]}
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
          <Text
            style={[
              styles.heroTitle,
              { fontSize: heroTitleFontSize },
              isNavCompact && styles.heroTitleCompact,
            ]}
          >
            Welcome back, {username ?? "User"}! {"\uD83D\uDC4B"}
          </Text>
          <Text
            style={[
              styles.heroCarouselLine,
              {
                fontSize: heroCarouselFontSize,
                lineHeight: heroCarouselLineHeight,
                paddingBottom: heroCarouselLastLinePad,
              },
            ]}
          >
            {"\u201C"}
            {carouselMessages[carouselIndex]}
            {"\u201D"}
          </Text>
        </LinearGradient>
        <View style={styles.heroCurve} />
      </View>

      <ScrollView
        style={styles.mainBodyScroll}
        contentContainerStyle={[
          styles.scrollContent,
          isContentCompact && styles.scrollContentCompact,
          { flexGrow: 1 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View
          style={[
            styles.mainContent,
            isWide && styles.mainContentWide,
            isWide && isContentCompact && styles.mainContentWideCompact,
          ]}
        >
          <View
            style={[styles.leftColumn, isWide && styles.leftColumnWide]}
            onLayout={onWideLeftColumnLayout}
          >
            <View style={[styles.illustrationCard, isContentCompact && styles.illustrationCardCompact]}>
              <Image
                source={require("../assets/images/home_icon.png")}
                style={[styles.illustrationImage, isContentCompact && styles.illustrationImageCompact]}
                resizeMode="contain"
              />
              <Text style={[styles.illustrationTitle, isContentCompact && styles.illustrationTitleCompact]}>Your Homes, Your Progress</Text>
              <Text style={[styles.illustrationDesc, isContentCompact && styles.illustrationDescCompact]}>Manage your households, keep things clean, and build healthier habits together.</Text>
              <Pressable
                style={styles.primaryButton}
                onPress={() => setCreateOpen(true)}
                // @ts-ignore web-only pointer hover
                onMouseEnter={() => Platform.OS === "web" && setHoverCreateHousehold(true)}
                // @ts-ignore web-only pointer hover
                onMouseLeave={() => Platform.OS === "web" && setHoverCreateHousehold(false)}
              >
                <LinearGradient
                  colors={Platform.OS === "web" && hoverCreateHousehold ? [...PRIMARY_BUTTON_GRADIENT_HOVER] : [...primaryButtonGradient]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.primaryButtonFill, isContentCompact && styles.primaryButtonFillCompact]}
                >
                  <Text style={[styles.primaryButtonText, isContentCompact && styles.primaryButtonTextCompact]}>+ Create New Household</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                style={[
                  styles.secondaryButton,
                  isContentCompact && styles.secondaryButtonCompact,
                  Platform.OS === "web" &&
                    hoverJoinCode && {
                      backgroundColor: SECONDARY_BUTTON_BG_HOVER,
                      borderColor: SECONDARY_BUTTON_BORDER_HOVER,
                    },
                ]}
                onPress={() => setJoinOpen(true)}
                // @ts-ignore web-only pointer hover
                onMouseEnter={() => Platform.OS === "web" && setHoverJoinCode(true)}
                // @ts-ignore web-only pointer hover
                onMouseLeave={() => Platform.OS === "web" && setHoverJoinCode(false)}
              >
                <MaterialCommunityIcons
                  name="link-variant"
                  size={secondaryLinkIconSize}
                  color={Platform.OS === "web" && hoverJoinCode ? SECONDARY_BUTTON_LABEL_HOVER : brand}
                />
                <Text
                  style={[
                    styles.secondaryButtonText,
                    isContentCompact && styles.secondaryButtonTextCompact,
                    Platform.OS === "web" && hoverJoinCode && { color: SECONDARY_BUTTON_LABEL_HOVER },
                  ]}
                >
                  Join with a Code
                </Text>
              </Pressable>
            </View>
          </View>
          <View
            style={[
              styles.rightColumn,
              isWide && styles.rightColumnWide,
              isWide && {
                height: wideYhypColumnHeight ?? 0,
                overflow: "hidden",
              },
            ]}
          >
            <View
              style={[
                styles.rightColumnCard,
                isContentCompact && styles.rightColumnCardCompact,
                isWide && styles.rightColumnCardWide,
              ]}
            >
              <View style={styles.listHeader}>
                <View style={[styles.listHeaderLeft, isContentCompact && styles.listHeaderLeftCompact]}>
                  <View style={[styles.sectionIconCircle, isContentCompact && styles.sectionIconCircleCompact]}>
                    <MaterialCommunityIcons name="home" size={sectionHomeIconSize} color={brand} />
                  </View>
                  <Text style={[styles.sectionTitle, isContentCompact && styles.sectionTitleCompact]}>Your Households</Text>
                  {!isLoading && (
                    <View style={[styles.countBadge, isContentCompact && styles.countBadgeCompact]}>
                      <Text style={[styles.countBadgeText, isContentCompact && styles.countBadgeTextCompact]}>{households.length}</Text>
                    </View>
                  )}
                </View>
              </View>
              {!isLoading && !isEmpty && (
                <Text style={[styles.listSubtitle, isContentCompact && styles.listSubtitleCompact]}>Select a household to view and manage it</Text>
              )}
              {isLoading ? (
                <View style={isWide ? styles.wideListBody : undefined}>
                  <Text style={[styles.loadingText, isContentCompact && styles.loadingTextCompact]}>Loading your households...</Text>
                </View>
              ) : isEmpty ? (
                <View style={[styles.emptyState, isContentCompact && styles.emptyStateCompact, isWide && styles.wideListBody]}>
                  <MaterialCommunityIcons name="home-plus-outline" size={emptyStateIconSize} color="#BCC5D1" />
                  <Text style={[styles.emptyTitle, isContentCompact && styles.emptyTitleCompact]}>No households yet</Text>
                  <Text style={[styles.emptySubtitle, isContentCompact && styles.emptySubtitleCompact]}>Create a household or join one with a code to get started.</Text>
                </View>
              ) : (
                (() => {
                  const householdCards = households.map((household) => {
                    const isHovered = hoveredId === household.id;
                    const isMenuOpen = menuOpenId === household.id;
                    return (
                      <View key={household.id} style={{ position: "relative" }}>
                        <Pressable
                          style={[
                            styles.householdCard,
                            isContentCompact && styles.householdCardCompact,
                            isHovered && styles.householdCardHovered,
                          ]}
                          onPress={() => {
                            if (isMenuOpen) { setMenuOpenId(null); return; }
                            openHousehold(household.id);
                          }}
                          // @ts-ignore - web only hover events
                          onMouseEnter={() => setHoveredId(household.id)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          <View style={[styles.householdCardLeft, isContentCompact && styles.householdCardLeftCompact]}>
                            <View style={[styles.householdIconCircle, isContentCompact && styles.householdIconCircleCompact]}>
                              <MaterialCommunityIcons name="home-group" size={householdGroupIconSize} color={brandMuted} />
                            </View>
                            <View style={styles.householdInfo}>
                              <Text
                                style={[styles.householdName, isContentCompact && styles.householdNameCompact]}
                                numberOfLines={isContentCompact ? 1 : 2}
                                ellipsizeMode="tail"
                              >
                                {household.name}
                              </Text>
                              <Text style={[styles.householdMeta, isContentCompact && styles.householdMetaCompact]} numberOfLines={isContentCompact ? 2 : 3} ellipsizeMode="tail">
                                Admin: {household.adminName} {"\u2022"} Code: {household.joinCode}
                              </Text>
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
                                <MaterialCommunityIcons name="dots-vertical" size={householdDotsSize} color="#8FA0B3" />
                              </Pressable>
                            )}
                            <MaterialCommunityIcons name="chevron-right" size={householdChevronSize} color="#8FA0B3" />
                          </View>
                        </Pressable>
                      </View>
                    );
                  });
                  return isWide ? (
                    <View style={styles.householdListOuterWide}>
                      <ScrollView
                        style={styles.householdListScrollWide}
                        contentContainerStyle={styles.householdListScrollContentWide}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator
                      >
                        {householdCards}
                      </ScrollView>
                    </View>
                  ) : (
                    <View style={styles.householdListStack}>{householdCards}</View>
                  );
                })()
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Household options centered popup modal */}
      {(() => {
        const menuHousehold = households.find((h) => h.id === menuOpenId);
        return (
          <Modal animationType="fade" transparent visible={!!menuOpenId} onRequestClose={() => setMenuOpenId(null)}>
            <Pressable style={styles.modalBackdrop} onPress={() => setMenuOpenId(null)}>
              <Pressable style={styles.householdPopup} onPress={(e) => e.stopPropagation?.()}>
                {/* Header */}
                <Pressable style={styles.householdPopupClose} onPress={() => setMenuOpenId(null)}>
                  <MaterialCommunityIcons name="close" size={20} color={textSecondary} />
                </Pressable>
                <View style={styles.householdPopupHeader}>
                  <View style={styles.householdPopupIconCircle}>
                    <MaterialCommunityIcons name="home-group" size={30} color={brandMuted} />
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
                      <View style={styles.householdPopupItemIcon}><MaterialCommunityIcons name="cog-outline" size={20} color={textPrimary} /></View>
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
                  <View style={styles.householdPopupItemIcon}><MaterialCommunityIcons name="eye-outline" size={20} color={textPrimary} /></View>
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
                    <MaterialCommunityIcons name="arrow-left" size={22} color={textPrimary} />
                  </Pressable>
                  {/* Header */}
                  <View style={styles.settingsModalHeader}>
                    <View style={styles.settingsModalIconCircle}>
                      <MaterialCommunityIcons name="cog-outline" size={28} color={brandMuted} />
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
                          <MaterialCommunityIcons name="home-outline" size={20} color={brandMuted} />
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
                          <MaterialCommunityIcons name="pencil-outline" size={15} color={brand} />
                          <Text style={styles.settingsSaveBtnText}>{settingsNameSaving ? "Saving..." : "Save Changes"}</Text>
                        </Pressable>
                      </View>
                    </View>
                    {/* Join Code section */}
                    <View style={styles.settingsSection}>
                      <View style={styles.settingsSectionHeader}>
                        <View style={styles.settingsSectionIconCircle}>
                          <MaterialCommunityIcons name="key-outline" size={20} color={brandMuted} />
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
                          <MaterialCommunityIcons name="refresh" size={16} color={brand} />
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
                            <MaterialCommunityIcons name={settingsCodeCopied ? "check" : "content-copy"} size={18} color={settingsCodeCopied ? "#16A34A" : brandMuted} />
                          </Pressable>
                        </View>
                      </View>
                      {codeUpdated && (
                        <Text style={styles.settingsCodeUpdated}>Last changed: {codeUpdated}</Text>
                      )}
                      <View style={styles.settingsCodeNote}>
                        <MaterialCommunityIcons name="information-outline" size={14} color={brandMuted} />
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
                    Are you sure you want to permanently delete <Text style={{ fontWeight: "700", color: textPrimary }}>{settingsHousehold.name}</Text>? All data will be lost. This cannot be undone.
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
                  You cannot leave{cannotLeaveHousehold ? ` "${cannotLeaveHousehold.name}"` : " this household"} while you are the admin. Use <Text style={{ fontWeight: "700", color: brand }}>View Members</Text> to transfer admin status to another member first.
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
        const AVATAR_COLORS = [brandMuted, "#E07B5B", "#5BA87B", "#4A7BBF", "#B5855B", "#5B9EB5"];
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
                  <MaterialCommunityIcons name="arrow-left" size={22} color={textPrimary} />
                </Pressable>
                {/* Header */}
                <View style={styles.membersModalHeader}>
                  <View style={styles.membersModalIconCircle}>
                    <MaterialCommunityIcons name="account-group" size={28} color={brandMuted} />
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
                                    <MaterialCommunityIcons name={isMemberAdmin ? "shield-check" : "account-outline"} size={11} color={isMemberAdmin ? brand : brandMuted} />
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
              Are you sure you want to remove <Text style={{ fontWeight: "700", color: textPrimary }}>{removeConfirmMember?.account_name}</Text> from this household? This cannot be undone — they will need a new invite code to rejoin.
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
              <View style={[styles.cannotLeaveIconCircle, { backgroundColor: surfaceSoft }]}>
                <MaterialCommunityIcons name="crown" size={26} color={brand} />
              </View>
            </View>
            <Text style={styles.modalTitle}>Transfer Admin?</Text>
            <Text style={styles.modalSubtitle}>
              Are you sure you want to make <Text style={{ fontWeight: "700", color: textPrimary }}>{makeAdminConfirmMember?.account_name}</Text> the admin? You will become a regular member and lose admin controls. This cannot be undone.
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
  screen: { flex: 1, backgroundColor: pageBg },
  navbar: { height: 68, backgroundColor: navy, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  navbarCompact: { height: 56, paddingHorizontal: 12 },
  navLeft: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: heroGradient[0],
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    flexShrink: 0,
    shadowColor: "#1A2B4D",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  logoBoxCompact: { width: 32, height: 32, borderRadius: 8, marginRight: 6 },
  navBrandWrap: { flex: 1, minWidth: 0 },
  navBrand: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", letterSpacing: 0.3, flexShrink: 1 },
  navBrandCompact: { fontSize: 14 },
  navRight: { flexDirection: "row", alignItems: "center", gap: 20, flexShrink: 0 },
  navRightCompact: { gap: 8 },
  navLink: { flexDirection: "row", alignItems: "center", gap: 5 },
  navLinkCompact: { gap: 4 },
  navLinkText: { color: "#FFFFFF", fontSize: 15, fontWeight: "500" },
  navLinkTextCompact: { fontSize: 13 },
  navLogout: { flexDirection: "row", alignItems: "center", gap: 8 },
  navLogoutCompact: { gap: 6 },
  /** Web: fixed box so hover only swaps background — no layout shift (tokens in theme/colors) */
  navLogoutWebShell: { ...navLogoutWebShell },
  navLogoutWebShellCompact: { ...navLogoutWebShellCompact },
  navLogoutWebShellHover: { ...navLogoutWebShellHover },
  avatarCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#5B8AD4", alignItems: "center", justifyContent: "center" },
  avatarCircleCompact: { width: 28, height: 28, borderRadius: 14 },
  avatarText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  avatarTextCompact: { fontSize: 13 },
  heroBanner: { paddingTop: 18, paddingHorizontal: 24, alignItems: "center", position: "relative", overflow: "hidden" },
  heroBannerCompact: { paddingTop: 14, paddingHorizontal: 16 },
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
  heroCurve: { height: 50, backgroundColor: pageBg, borderTopLeftRadius: 600, borderTopRightRadius: 600, marginTop: -50 },
  heroTitle: { fontWeight: "700", color: "#FFFFFF", textAlign: "center", marginBottom: 6, zIndex: 2 },
  heroTitleCompact: { marginBottom: 8 },
  heroCarouselLine: {
    marginTop: 0,
    fontStyle: "italic",
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.92)",
    textAlign: "center",
    zIndex: 2,
    maxWidth: 560,
    alignSelf: "center",
  },
  mainBodyScroll: { flex: 1, minHeight: 0 },
  scrollContent: { paddingTop: 8, paddingBottom: 30, paddingHorizontal: 20 },
  scrollContentCompact: { paddingTop: 6, paddingBottom: 28, paddingHorizontal: 14 },
  mainContent: { width: "100%", maxWidth: 1100, alignSelf: "center" },
  mainContentWide: { flexDirection: "row", alignItems: "flex-start", gap: 28 },
  mainContentWideCompact: { gap: 20 },
  leftColumn: { marginBottom: 24 },
  leftColumnWide: { width: "36%", marginBottom: 0 },
  illustrationCard: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 24, alignItems: "center", borderWidth: 1, borderColor: border, shadowColor: "#AAB6C5", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 3 },
  illustrationCardCompact: { borderRadius: 16, padding: 18 },
  illustrationImage: { width: "100%", height: 200, marginBottom: 16 },
  illustrationImageCompact: { height: 160, marginBottom: 12 },
  illustrationTitle: { fontSize: 20, fontWeight: "700", color: textPrimary, textAlign: "center", marginBottom: 8 },
  illustrationTitleCompact: { fontSize: 18, marginBottom: 6 },
  illustrationDesc: { fontSize: 14, lineHeight: 21, color: "#6B7B8D", textAlign: "center", marginBottom: 20 },
  illustrationDescCompact: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  primaryButton: { width: "100%", borderRadius: 14, overflow: "hidden", marginBottom: 12, shadowColor: brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4 },
  primaryButtonFill: { height: 52, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  primaryButtonFillCompact: { height: 46, borderRadius: 12 },
  primaryButtonText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", letterSpacing: 0.2 },
  primaryButtonTextCompact: { fontSize: 15 },
  secondaryButton: { width: "100%", height: 52, borderRadius: 14, borderWidth: 2, borderColor: brand, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 0 },
  secondaryButtonCompact: { height: 46, borderRadius: 12, gap: 6 },
  secondaryButtonText: { fontSize: 16, fontWeight: "700", color: brand },
  secondaryButtonTextCompact: { fontSize: 15 },
  rightColumn: { flex: 1 },
  rightColumnWide: { flex: 1, minWidth: 0 },
  rightColumnCard: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 24, borderWidth: 1, borderColor: border, shadowColor: "#AAB6C5", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 3 },
  rightColumnCardWide: { flex: 1, minHeight: 0, width: "100%", alignSelf: "stretch", flexDirection: "column" },
  rightColumnCardCompact: { borderRadius: 16, padding: 18 },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  listHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  listHeaderLeftCompact: { gap: 8 },
  sectionIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: surfaceSoft, alignItems: "center", justifyContent: "center" },
  sectionIconCircleCompact: { width: 32, height: 32, borderRadius: 16 },
  sectionTitle: { fontSize: 22, fontWeight: "700", color: textPrimary },
  sectionTitleCompact: { fontSize: 19 },
  countBadge: {
    backgroundColor: brand,
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
  countBadgeCompact: {
    borderRadius: 7,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
  },
  countBadgeTextCompact: {
    fontSize: 13,
    lineHeight: 22,
  },
  listSubtitle: { fontSize: 14, color: textSecondary, marginBottom: 18, marginLeft: 38 },
  listSubtitleCompact: { fontSize: 13, marginBottom: 14, marginLeft: 32 },
  householdListScroll: { flexGrow: 0 },
  householdListOuterWide: { flex: 1, minHeight: 0, minWidth: 0 },
  householdListScrollWide: { flex: 1 },
  householdListScrollContentWide: { flexGrow: 1, paddingBottom: 4 },
  householdListStack: { width: "100%", paddingBottom: 4 },
  wideListBody: { flex: 1, minHeight: 0, justifyContent: "center" },
  loadingText: { textAlign: "center", fontSize: 16, color: textSecondary, paddingVertical: 40 },
  loadingTextCompact: { fontSize: 15, paddingVertical: 32 },
  emptyState: { alignItems: "center", paddingVertical: 36 },
  emptyStateCompact: { paddingVertical: 28 },
  emptyTitle: { textAlign: "center", fontSize: 20, fontWeight: "600", color: "#596474", marginTop: 12, marginBottom: 8 },
  emptyTitleCompact: { fontSize: 18, marginTop: 10, marginBottom: 6 },
  emptySubtitle: { textAlign: "center", fontSize: 15, lineHeight: 22, color: "#7C8797", paddingHorizontal: 12 },
  emptySubtitleCompact: { fontSize: 14, lineHeight: 20 },
  householdCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#AAB6C5", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 2 },
  householdCardCompact: { padding: 12, marginBottom: 10, borderRadius: 14 },
  householdCardHovered: { backgroundColor: surfaceSoft, borderColor: "#BDD0EE" },
  householdCardLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  householdCardLeftCompact: { gap: 10 },
  householdCardRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  dotsButton: { padding: 4, borderRadius: 8 },
  dropdownDivider: { height: 1, backgroundColor: border, marginVertical: 6 },
  householdPopup: { width: "100%", maxWidth: 420, backgroundColor: "#FFFFFF", borderRadius: 22, paddingTop: 20, paddingBottom: 8, paddingHorizontal: 0, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 10, alignSelf: "center", overflow: "hidden" },
  householdPopupClose: { position: "absolute", top: 14, right: 14, zIndex: 10, padding: 6 },
  householdPopupHeader: { alignItems: "center", paddingBottom: 16, paddingHorizontal: 24 },
  householdPopupIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: surfaceSoft, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  householdPopupName: { fontSize: 20, fontWeight: "700", color: textPrimary, textAlign: "center", marginBottom: 8 },
  householdPopupRoleBadge: { backgroundColor: surfaceSoft, borderRadius: 20, paddingVertical: 4, paddingHorizontal: 14 },
  householdPopupRoleText: { fontSize: 13, color: brand, fontWeight: "600" },
  householdPopupRoleBadgeAdmin: { flexDirection: "row", alignItems: "center", backgroundColor: brand, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 14 },
  householdPopupRoleTextAdmin: { fontSize: 13, color: "#FFFFFF", fontWeight: "600" },
  householdPopupSectionLabel: { fontSize: 11, fontWeight: "700", color: "#8FA0B3", letterSpacing: 0.8, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 6 },
  householdPopupItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 24, paddingVertical: 13 },
  householdPopupItemLeave: { backgroundColor: "#FFF5F5" },
  householdPopupItemIcon: { width: 32, alignItems: "center" },
  householdPopupItemText: { flex: 1 },
  householdPopupItemTitle: { fontSize: 15, fontWeight: "600", color: textPrimary, marginBottom: 1 },
  householdPopupItemSub: { fontSize: 12, color: "#8FA0B3" },
  householdPopupCancel: { marginHorizontal: 24, marginTop: 8, marginBottom: 12, height: 46, borderRadius: 12, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center" },
  householdPopupCancelText: { fontSize: 15, fontWeight: "600", color: "#596474" },
  householdIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: surfaceSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  householdIconCircleCompact: { width: 48, height: 48, borderRadius: 24 },
  householdLogo: { width: 90, height: 90, tintColor: "#4A7BBF" },
  householdInfo: { flex: 1, minWidth: 0 },
  householdName: { fontSize: 17, fontWeight: "700", color: textPrimary, marginBottom: 3 },
  householdNameCompact: { fontSize: 16 },
  householdMeta: { fontSize: 13, color: textSecondary },
  householdMetaCompact: { fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(27, 39, 56, 0.35)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  modalCard: { width: "100%", maxWidth: 480, backgroundColor: "#FFFFFF", borderRadius: 22, padding: 22, shadowColor: "#000000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 8, alignSelf: "center" },
  modalTitle: { fontSize: 24, fontWeight: "700", color: textPrimary, marginBottom: 8 },
  modalSubtitle: { fontSize: 16, lineHeight: 24, color: textSecondary, marginBottom: 18 },
  input: { height: 54, borderRadius: 14, borderWidth: 1.5, borderColor: "#D7DFEA", paddingHorizontal: 16, fontSize: 16, color: "#334155", backgroundColor: "#FAFBFD" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 20 },
  leaveConfirmButton: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: "#D9534F" },
  leaveConfirmButtonText: { color: "#FFFFFF", fontWeight: "700" },
  leaveModalIconRow: { alignItems: "center", marginBottom: 12 },
  leaveModalIconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#FFF0F0", alignItems: "center", justifyContent: "center" },
  cannotLeaveIconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#FFFBEB", alignItems: "center", justifyContent: "center" },
  modalCancelButton: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: "#EEF2F7" },
  modalCancelText: { color: "#64748B", fontWeight: "600" },
  modalConfirmButton: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: brand },
  modalConfirmText: { color: "#FFFFFF", fontWeight: "700" },
  membersModalCard: { width: "100%", maxWidth: 500, backgroundColor: "#FFFFFF", borderRadius: 22, paddingTop: 20, paddingBottom: 16, shadowColor: "#000000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 8, alignSelf: "center", maxHeight: "80%" },
  membersModalHeader: { alignItems: "center", paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8 },
  membersModalIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: surfaceSoft, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  membersModalTitle: { fontSize: 22, fontWeight: "700", color: textPrimary, marginBottom: 2 },
  membersModalSub: { fontSize: 14, color: textSecondary, marginBottom: 4 },
  membersModalDesc: { fontSize: 14, color: textSecondary, textAlign: "center" },
  membersBackButton: { position: "absolute", top: 14, left: 14, zIndex: 10, padding: 6 },
  memberCountHeader: { fontSize: 16, fontWeight: "700", color: textPrimary, paddingHorizontal: 20, paddingVertical: 12 },
  membersLoadingText: { textAlign: "center", color: textSecondary, paddingVertical: 24, fontSize: 15 },
  membersScroll: { paddingHorizontal: 12 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  memberAvatarText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  memberRow2: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, marginBottom: 4, borderWidth: 1, borderColor: "transparent" },
  memberRowAdmin2: { backgroundColor: surfaceSoft, borderColor: "#D0E2F7" },
  memberInfo2: { flex: 1 },
  memberName2: { fontSize: 15, fontWeight: "600", color: textPrimary },
  memberJoined: { fontSize: 12, color: "#8FA0B3", marginTop: 1 },
  memberInlineBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F0F4FA", borderRadius: 10, paddingVertical: 2, paddingHorizontal: 8 },
  memberInlineBadgeAdmin: { backgroundColor: surfaceSoft },
  memberInlineBadgeText: { fontSize: 11, color: brandMuted, fontWeight: "600" },
  memberInlineBadgeTextAdmin: { color: brand },
  currentAdminBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F0FDF4", borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: "#BBF7D0" },
  currentAdminText: { fontSize: 12, color: "#16A34A", fontWeight: "600" },
  memberAdminActions: { flexDirection: "row", gap: 6 },
  memberMakeAdminBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: surfaceSoft, borderWidth: 1, borderColor: "#C5D8F0" },
  memberMakeAdminBtnText: { fontSize: 12, fontWeight: "600", color: brand },
  memberRemoveBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#FFF5F5", borderWidth: 1, borderColor: "#F5BCBC" },
  memberRemoveBtnText: { fontSize: 12, fontWeight: "600", color: "#D9534F" },
  membersFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 14, paddingHorizontal: 8 },
  membersFooterText: { fontSize: 12, color: "#8FA0B3" },
  memberActionSheet: { borderTopWidth: 1, borderTopColor: border, backgroundColor: "#FFFFFF", borderBottomLeftRadius: 22, borderBottomRightRadius: 22, paddingTop: 4, paddingBottom: 8 },
  memberActionSheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#D0D9E6", alignSelf: "center", marginTop: 10, marginBottom: 8 },
  memberActionSheetName: { fontSize: 13, fontWeight: "600", color: "#8FA0B3", paddingHorizontal: 20, paddingVertical: 6 },
  memberActionSheetItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  memberActionSheetItemText: { fontSize: 15, fontWeight: "600", color: textPrimary },
  memberActionSheetCancel: { marginHorizontal: 16, marginTop: 6, marginBottom: 4, height: 44, borderRadius: 12, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center" },
  memberActionSheetCancelText: { fontSize: 15, fontWeight: "600", color: "#596474" },
  // Household Settings modal
  settingsModalCard: { width: "100%", maxWidth: 560, backgroundColor: "#FFFFFF", borderRadius: 22, paddingTop: 20, paddingBottom: 0, shadowColor: "#000000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 8, alignSelf: "center", maxHeight: "88%" },
  settingsModalHeader: { alignItems: "center", paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8 },
  settingsModalIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: surfaceSoft, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  settingsModalTitle: { fontSize: 22, fontWeight: "700", color: textPrimary, marginBottom: 2 },
  settingsModalSub: { fontSize: 14, fontWeight: "600", color: textPrimary, marginBottom: 2 },
  settingsModalDesc: { fontSize: 13, color: textSecondary, textAlign: "center" },
  settingsScroll: { paddingHorizontal: 20, paddingBottom: 20 },
  settingsSection: { borderWidth: 1, borderColor: border, borderRadius: 16, padding: 16, marginBottom: 14, backgroundColor: "#FAFBFD" },
  settingsSectionDanger: { borderColor: "#F5BCBC", backgroundColor: "#FFF8F8" },
  settingsSectionHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  settingsSectionIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: surfaceSoft, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  settingsSectionTitle: { fontSize: 15, fontWeight: "700", color: textPrimary, marginBottom: 3 },
  settingsSectionSub: { fontSize: 13, color: textSecondary, lineHeight: 18 },
  settingsNameRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  settingsNameInput: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: "#D7DFEA", paddingHorizontal: 14, fontSize: 15, color: "#334155", backgroundColor: "#FFFFFF" },
  settingsSaveBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: "#C5D8F0", backgroundColor: "#FFFFFF" },
  settingsSaveBtnDisabled: { opacity: 0.5 },
  settingsSaveBtnText: { fontSize: 13, fontWeight: "600", color: brand },
  settingsCodeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  settingsRegenBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: "#C5D8F0", backgroundColor: "#FFFFFF" },
  settingsRegenBtnText: { fontSize: 13, fontWeight: "600", color: brand },
  settingsCodeBox: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: "#C5D8F0", backgroundColor: "#FFFFFF" },
  settingsCodeText: { fontSize: 16, fontWeight: "700", color: brand, letterSpacing: 1.5 },
  settingsCodeUpdated: { fontSize: 12, color: "#8FA0B3", marginBottom: 8 },
  settingsCodeNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: surfaceSoft, borderRadius: 10, padding: 10 },
  settingsCodeNoteText: { flex: 1, fontSize: 12, color: "#4A6FA5", lineHeight: 18 },
  settingsDangerContent: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  settingsDangerIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFF0F0", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  settingsDangerTitle: { fontSize: 15, fontWeight: "700", color: "#D9534F", marginBottom: 3 },
  settingsDangerSub: { fontSize: 13, color: textSecondary, lineHeight: 18 },
  settingsDeleteBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: "#F5BCBC", backgroundColor: "#FFF0F0" },
  settingsDeleteBtnText: { fontSize: 13, fontWeight: "600", color: "#D9534F" },
});
