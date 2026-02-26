/* PROLOGUE
File name: _layout.tsx
Description: Define the basic root layout of the application using the expo router.
             Hoists GestureHandlerRootView, SafeAreaView, and ViewToggle so they persist
             across route changes. Avoids async re-measurement and layout jumps.
Programmer: Jack Bauer, Nifemi Lawal
Creation date: 2/6/26
Revision date: 
  - 2/9/26: Disable header for new list view
  - 2/25/26: Replace Stack with Slot; hoist shared wrappers to layout level (NL)
Preconditions: None
Postconditions: None
Errors: None
Side effects: None
Invariants: None
Known faults: None
*/

// Slot renders the matched route with no stack overhead
import { Slot, usePathname } from "expo-router";
// Single gesture root for the whole app so it isn't re-initialized on every route change
import { GestureHandlerRootView } from "react-native-gesture-handler";
// Kept at layout level so safe-area insets are measured once and never cause a layout jump on navigation
import { SafeAreaView } from "react-native-safe-area-context";
// Shared toggle bar between the 3D and list views
import ViewToggle from "./components/ViewToggle";

export default function RootLayout() {
  // Determine the current route so we know whether to show the toggle and which segment is active
  const pathname = usePathname();
  const isApp = pathname === "/home" || pathname === "/list"; // true on the main app screens, false on login/register
  const active = pathname === "/list" ? "list" : "3d"; // which toggle segment to highlight

  return (
    // Persistent wrappers: mounted once, shared across all routes
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#f0f2f5" }} edges={["top"]}>
        {/* Only render the view toggle on the main app screens */}
        {isApp && <ViewToggle active={active} />}
        {/* Slot swaps in the matched route's component below the toggle */}
        <Slot />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}
