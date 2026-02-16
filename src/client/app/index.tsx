/* PROLOGUE
File name: index.tsx
Description: Provide the default landing route for the app by redirecting the user to the login screen
Programmer: Logan Smith
Creation date: 2/6/26
Revision date:
  - 2/14/26: Change index route to redirect to /login so authentication becomes the landing flow.
Preconditions: A React application requesting the default route ("/")
Postconditions: The user is redirected to the login screen route
Errors: If routing fails, the user may remain on the default route without navigation.
Side effects: Navigation to another route occurs immediately
Invariants: None
Known faults: None
*/


import { Redirect } from "expo-router";

export default function Index() {
  return <Redirect href="/login" />;
}
