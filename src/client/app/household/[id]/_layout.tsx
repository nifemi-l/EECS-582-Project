/* PROLOGUE
File name: _layout.tsx
Description: Define the shared household layout for the household-scoped routes.
             Hoists the ViewToggle into /household/[id] so it persists while switching
             between the graphics and list views for the same household.
             Keeps navigation and shared UI scoped to the active household id.
Programmers: Logan Smith
Creation date: 3/18/26
Revision date:
  - 4/12/26: Shared household toolbar (ViewToggle) for list and 3D routes
Preconditions: A valid household ID is present in the route parameters
Postconditions: Renders the shared household view toggle and the matched child route
Errors: None
Side effects: None
Invariants: None
Known faults: None
*/


import { Slot, useLocalSearchParams, usePathname, router } from "expo-router";
import { StyleSheet, View } from "react-native";
import ViewToggle from "../../../components/ViewToggle";
import { AuthLoadingScreen, useAuthGuard } from "../../../utils/useAuthGuard";

export default function HouseholdLayout() {
  const { isCheckingAuth, isAuthenticated } = useAuthGuard();

  if (isCheckingAuth || !isAuthenticated) {
    return <AuthLoadingScreen />;
  }

  return <AuthenticatedHouseholdLayout />;
}

function AuthenticatedHouseholdLayout() {
  // Read the household id from the dynamic route so toggle navigation stays in the same household
  const { id } = useLocalSearchParams<{ id: string }>();
  const householdId = Number(id);
  // Determine the current household sub-route so we know which segment is active
  const pathname = usePathname();
  const isList = pathname === `/household/${id}/list`; // true on the list screen, false on graphics
  const active = isList ? "list" : "3d"; // which toggle segment to highlight

  function handleToggle(next: "3d" | "list") {
    // Keep navigation scoped to the active household when switching between views
    if (!id) return;

    if (next === "list") {
      router.replace({
        pathname: "/household/[id]/list",
        params: { id },
      });
    } else {
      router.replace({
        pathname: "/household/[id]/graphics",
        params: { id },
      });
    }
  }

  return (
    <View style={styles.container}>
      <ViewToggle active={active} onChange={handleToggle} householdId={householdId} />
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
