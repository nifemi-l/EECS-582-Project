/* PROLOGUE
File name: _layout.tsx
Description: Define the basic root layout of the application using the expo router
Programmer: Jack Bauer
Creation date: 2/6/26
Revision date: 
  - 2/9/26: Disable header for new list view
Preconditions: None
Postconditions: None
Errors: None
Side effects: None
Invariants: None
Known faults: None
*/

// Import relevant components
import { Stack } from "expo-router";

// Export the root layout component as defined below.
// Note we turn off showing the stack header
export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
