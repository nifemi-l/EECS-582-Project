/* PROLOGUE
File name: _layout.tsx
Description: Define the basic root layout of the application using the expo router.
             Hoists GestureHandlerRootView, SafeAreaView, and ViewToggle so they persist
             across route changes. Avoids async re-measurement and layout jumps.
Programmers: Jack Bauer, Nifemi Lawal, Logan Smith
Creation date: 2/6/26
Revision date: 
  - 2/9/26: Disable header for new list view
  - 2/25/26: Replace Stack with Slot; hoist shared wrappers to layout level
  - 3/18/26: Split up this layout file with secondary layout file in /household/[id]
  - 4/13/26: Web viewport + root scroll CSS; remove legacy expo-reset so mobile zoom does not brick scroll

Preconditions: None
Postconditions: None
Errors: None
Side effects: None
Invariants: None
Known faults: None
*/

// Slot renders the matched route with no stack overhead
import { Slot } from "expo-router";
// Single gesture root for the whole app so it isn't re-initialized on every route change
import { GestureHandlerRootView } from "react-native-gesture-handler";
// Kept at layout level so safe-area insets are measured once and never cause a layout jump on navigation
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect } from "react";
import { Platform } from "react-native";

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === "web") {
      document.title = "HomeSeeHome";

      // Mobile web: lock initial scale to device width and avoid iOS font-based "zoom".
      // Override expo-router default body overflow:hidden so pinch-zoom / visual viewport
      const viewport = document.querySelector('meta[name="viewport"]');
      const viewportContent = "width=device-width, initial-scale=1, viewport-fit=cover";
      if (viewport) {
        viewport.setAttribute("content", viewportContent);
      } else {
        const meta = document.createElement("meta");
        meta.setAttribute("name", "viewport");
        meta.setAttribute("content", viewportContent);
        document.head.prepend(meta);
      }

      const scrollFixId = "expo-root-scroll-stable";
      if (!document.getElementById(scrollFixId)) {
        const scrollFix = document.createElement("style");
        scrollFix.id = scrollFixId;
        scrollFix.textContent = `
html {
  height: 100%;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
body {
  margin: 0;
  overflow-x: hidden;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch;
}
html, body, #root {
  height: 100%;
}
#root {
  display: flex;
  flex-direction: column;
}
        `.trim();
        document.head.appendChild(scrollFix);
      }

      const legacyReset = document.getElementById("expo-reset");
      if (legacyReset) {
        legacyReset.remove();
      }

      // Make scrollbars larger and easier to grab on web (mostly Raspberry Pi)
      const styleId = "global-large-scrollbar-style";
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.innerHTML = `
          * {
            scrollbar-width: auto;
          }

          *::-webkit-scrollbar {
            width: 18px;
          }

          *::-webkit-scrollbar-thumb {
            background-color: rgba(0, 0, 0, 0.45);
            border-radius: 999px;
            border: 4px solid transparent;
            background-clip: padding-box;
          }

          *::-webkit-scrollbar-track {
            background-color: transparent;
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  return (
    // Persistent wrappers: mounted once, shared across all routes
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#f0f2f5" }} edges={["top"]}>
        <Slot />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}