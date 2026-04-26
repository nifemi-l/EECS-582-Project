/* PROLOGUE
File name: userguide.tsx
Description: Provide a user guide for assistance in using the application
Programmers: Blake Carlson
Creation date: 4/21/2026
Revision date:
  - N/A
Preconditions: A React application requesting the userguide route (/userguide)
Postconditions: An interactive user guide for users to learn how to use the application
Errors: None
Side effects: None
Invariants: None
Known faults: None.
*/

// Imports
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Image, Platform, useWindowDimensions, TouchableOpacity } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { saveToken } from "../utils/authStorage";
import { heroGradient, listBorder, listSelection, navy, textPrimary, textSecondary } from "../theme/colors";
import { black } from "react-native-paper/lib/typescript/styles/themes/v2/colors";
import { Material } from "webgl-obj-loader";

const API_URL = process.env.EXPO_PUBLIC_API_URL;
/* 
Webpage for the user guide. Will have a title and then a list of features with descriptions and gifs showing how to use them

  Format will be:
      Title
        Embedded overview / explanation video for the whole service
        Then a list of features that have drop down menus
        Within each drop down menu will have an explanation and a gif showing how to use it
*/

export default function UserGuide() {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  const isCompact = windowWidth < 480;
  const logoIconSize = isCompact ? 22 : 28;
return (
      <View style={styles.screen}>
        {/* Navbar */}
        <View style={[styles.navbar, isCompact && styles.navbarCompact]}>
          <View style={styles.navLeft}>
            <View style={[styles.logoBox, isCompact && styles.logoBoxCompact]}>
                                <MaterialCommunityIcons name="home" size={logoIconSize} color="#FFFFFF" />
                              </View>
            <Text style={[styles.navBrand, isCompact && styles.navBrandCompact, { cursor: "pointer" }]} onPress={() => router.push("/home")}>
              HomeSeeHome
            </Text>
            <Text style={[styles.navBrand, isCompact && styles.navBrandCompact]}> | </Text>
          </View>
            <Text style={[styles.navBrand, isCompact && styles.navBrandCompact && styles.navRight, { cursor: "pointer" }]} onPress={() => router.push("/userguide")}>
            User Guide
          </Text>
        </View>

    {/* Add a header at the top for the overview video */}
    <View style={styles.header}>User Guide</View>
    <video
    controls
    playsInline
    style={styles.mainVideoContainer}
    >
    <source
      src={require("../assets/videos/homeseehome_user_guide.mp4")}
      type="video/mp4"
    />
    The video is not supported by your browser or device.
  </video>

  <View style={styles.videoSubtitle}>
    Above is a video walking through the main features of HomeSeeHome and how to use them. We recommend watching it to get an overview of the application and its capabilities.
  </View>


  <View style={styles.header}>Key Features</View>
  <Text>{'\n'}</Text>

  <View style={styles.videoSubtitle}>
    Below is a list of the main features of the application. Click on each feature to expand and see a detailed explanation and demo of how to use it.
  </View>

    <View style={styles.featureGroup}>
      {/* Clickable Header */}
      <TouchableOpacity onPress={() => setExpandedSection(expandedSection === "Account Creation and Login" ? null : "Account Creation and Login")}>
        <Text style={styles.featureTitle}>
          <MaterialCommunityIcons name={expandedSection === "Account Creation and Login" ? "chevron-up" : "chevron-down"} size={isCompact ? 17 : 20} color="#FFFFFF" style={{ marginRight: 8 }} />
          Account Creation and Login
        </Text>
      </TouchableOpacity>

      {/* Hidden until expanded */}
      {expandedSection === "Account Creation and Login" && (
  <View style={styles.contentRow}>
    {/* Left Side */}
    <View style={styles.textContainer}>
      <Text style={styles.subtitle}>
        The homepage of the application is where you can login or create a new account to access your personalized household management dashboard.
        {'\n'}
        {'\n'}
        If you are a new user, click on the "Create Account" button to register. You will need to provide your name, a valid email address, and a secure password. Then press, "Create Account" and if successful, you will be navigated to your new dashboard.
        {'\n'}
        {'\n'}
        If you already have an account, simply enter your registered email and password in the login form and click "Login". If your credentials are correct, you will be taken to your dashboard.
        {'\n'}
        {'\n'}
        Change Room: Click the left and right arrow buttons near the top right to change rooms.
      </Text>
    </View>

    {/* Right Side */}
    <View style={styles.videoContainer}>
      <video
        autoPlay
        muted
        loop
        playsInline
        controls
        style={styles.featureMp4}
      >
        <source
          src={require("../assets/videos/login_acct_creation_demo.mp4")}
          type="video/mp4"
        />
      </video>
      </View>
      </View>
      )}
    </View>

    {/* Header for next feature */}


    <View style={styles.featureGroup}>
      {/* Clickable Header */}
      <TouchableOpacity onPress={() => setExpandedSection(expandedSection === "Dashboard" ? null : "Dashboard")}>
        <Text style={styles.featureTitle}>
          <MaterialCommunityIcons name={expandedSection === "Dashboard" ? "chevron-up" : "chevron-down"} size={isCompact ? 17 : 20} color="#FFFFFF" style={{ marginRight: 8 }} />
          Dashboard
        </Text>
      </TouchableOpacity>

      {/* Hidden until expanded */}
      {expandedSection === "Dashboard" && (
  <View style={styles.contentRow}>
    {/* Left Side */}
    <View style={styles.textContainer}>
      <Text style={styles.subtitle}>
        The dashboard is the central hub of the application. It is where you can create and access your households from. Each household represents a living space, like an apartment or a house.
        {'\n'}
        {'\n'}
        You can create a household by clicking the "Create New Household" button and giving it a name.
        {'\n'}
        {'\n'}
        You can also join an existing household or share yours with others by using the "Join with a Code" button. This allows multiple users to collaborate and manage the same household together.
        {'\n'}
        {'\n'}
        Enter one of your households by clicking on its name under the "Your Households" section.
        {'\n'}
        {'\n'}
        You can manage your households by clicking the 3 dots next to the arrow next to a household's name. 
        From here, you can get a closer look at the household depending on your role. Creators of a household are admins and they can designate other members as household admins.
        {'\n'}
        {'\t'}Admin Settings: Update household name, join code, or delete the household entirely.
        {'\n'}
        {'\t'}Member Settings: View household members, leave the household.
      </Text>
    </View>

    {/* Right Side */}
    <View style={styles.videoContainer}>
      <video
        autoPlay
        muted
        loop
        playsInline
        controls
        style={styles.featureMp4}
      >
        <source
          src={require("../assets/videos/login_acct_creation_demo.mp4")}
          type="video/mp4"
        />
      </video>
      </View>
      </View>
      )}
    </View>
    
    <View style={styles.featureGroup}>
      {/* Clickable Header */}
      <TouchableOpacity onPress={() => setExpandedSection(expandedSection === "3D Room View" ? null : "3D Room View")}>
        <Text style={styles.featureTitle}>
          <MaterialCommunityIcons name={expandedSection === "3D View" ? "chevron-up" : "chevron-down"} size={isCompact ? 17 : 20} color="#FFFFFF" style={{ marginRight: 8 }} />
          3D View
        </Text>
      </TouchableOpacity>

      {/* Hidden until expanded */}
      {expandedSection === "3D Room View" && (
  <View style={styles.contentRow}>
    {/* Left Side */}
    <View style={styles.textContainer}>
      <Text style={styles.subtitle}>
        The 3D View feature allows you to visualize your living
        space in a three-dimensional format. You can rotate, zoom,
        and explore your room from different angles, making it easier
        to plan furniture arrangements and interior design.
        {'\n'}
        {'\n'}
        Pan: Click and drag left and right to rotate the view.
        {'\n'}
        {'\n'}
        Zoom: Click and drag up and down to zoom in and out.
        {'\n'}
        {'\n'}
        Change Room: Click the left and right arrow buttons near the top right to change rooms.
        {'\n'}
        {'\n'}
        Placing Features: Click on an unplaced feature from the bottom of the page and click where it should be on the grid. Its position and direction can be edited later. Click on it again while in "View Mode" to remove it from the view.
        {'\n'}
        {'\n'}
        Toggle Edit and View Modes: Click the button at the top left to switch between the two modes.
        {'\n'}
        {'\t'}View Mode: Drag around the screen to change the camera's perspective.
        {'\n'}
        {'\t'}Edit Mode: Click on a feature to mode it around the room or mark one of its features as complete.
        
      </Text>
    </View>

    {/* Right Side */}
    <View style={styles.videoContainer}>
      <video
        autoPlay
        muted
        loop
        playsInline
        controls
        style={styles.featureMp4}
      >
        <source
          src={require("../assets/videos/3d_view_demo.mp4")}
          type="video/mp4"
        />
      </video>
      </View>
      </View>
      )}
    </View>



    {/* Add additional features here in the same format, with a clickable header and hidden content that expands when the header is clicked. */}
       
    <View style={styles.featureGroup}>
      {/* Clickable Header */}
      <TouchableOpacity onPress={() => setExpandedSection(expandedSection === "List View" ? null : "List View")}>
        <Text style={styles.featureTitle}>
          <MaterialCommunityIcons name={expandedSection === "List View" ? "chevron-up" : "chevron-down"} size={isCompact ? 17 : 20} color="#FFFFFF" style={{ marginRight: 8 }} />
          List View
        </Text>
      </TouchableOpacity>

      {/* Hidden until expanded */}
      {expandedSection === "List View" && (
  <View style={styles.contentRow}>
    {/* Left Side */}
    <View style={styles.textContainer}>
      <Text style={styles.subtitle}>
        The List View provides a comprehensive overview of your household by
        displaying all your rooms and their contents in a hierarchical list format.
        This allows for easy navigation and management of your space and tasks.
        {'\n'}
        {'\n'}
        Structure:
        {'\n'}
        Household {"->"} Rooms {"->"} Features {"->"} Tasks
        {'\n'}
        {'\n'}
        In a household, rooms can be created and deleted at the top of the page. Each room is named, and can then can be expanded so you see its features.
        {'\n'}
        {'\n'}
        Within a room's menu, you can create and delete features. Features are also named and given a representative icon.
        {'\n'}
        {'\n'}
        Then within each feature, you can create and delete tasks. Tasks are also given a name, icon, and a frequency {"(in days)"} for how often it should be done.
        Clicking on the checkmark next to a task will mark it as complete and reset its timer until it needs to be done again.
      </Text>
    </View>

    {/* Right Side */}
    <View style={styles.videoContainer}>
      <video
        autoPlay
        muted
        loop
        playsInline
        controls
        style={styles.featureMp4}
      >
        <source
          src={require("../assets/videos/list_view_demo.mp4")}
          type="video/mp4"
        />
      </video>
      </View>
      </View>
      )}
    </View>


  { /* Final closing view here */}
  <View>
  <Text style={styles.videoSubtitle}>Created by: Nifemi Lawal, Dellie Wright, Blake Carlson, Jack Bauer, Logan Smith</Text>
  </View>

  </View>
  );
}



/** Page wash behind bold navy room bands */
const LIST_PAGE_BAND_BG = "#e8eef5";

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: LIST_PAGE_BAND_BG,
        minWidth: 0,
        width: "100%",
        maxWidth: "100%",
    },
    scroll: {
        flex: 1,
        minWidth: 0,
        maxWidth: "100%",
    },
    webScroll: Platform.select({
        web: {
            overflowY: "scroll",
            scrollbarGutter: "stable",
            width: "100%",
            maxWidth: "100%",
        } as any,
        default: {},
    }),
    scrollContent: {
        padding: 16,
        paddingBottom: 48,
        maxWidth: "100%",
    },
    titleBar: {
        paddingLeft: 20,
        paddingRight: 22,
        paddingTop: 16,
        paddingBottom: 12,
        alignContent: "center",
        fontSize: 28,
        fontWeight: "700",
        color: textPrimary,
    },
    title: {
        fontSize: 28,
        fontWeight: "700",
        color: textPrimary,
    },
    subtitle: {
        fontSize: 18,
        color: "#ffff",
        marginTop: 2,
    },
    featureMp4: {
      width: "100%",
      height: undefined,
      alignContent: "center",
      aspectRatio: 16 / 9,
      borderRadius: 10,
      marginTop: 12,
    },
    
    featureTitle: {
      fontSize: 24,
      fontWeight: "700",
      color: "#ffff",
      paddingLeft: 20
    },

    /** Web: shared faint darken when hovering a single row (section header, task row, add-task row) */
    featureGroup: {
        backgroundColor: "#2d4a7a",
        borderRadius: 14,
        marginTop: 20,
        marginBottom: 20,
        maxWidth: "100%",
        overflow: "hidden",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: listBorder,
        elevation: 1,
        shadowColor: "#fff",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,

    },
    featureHeader: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: "#1d4983",
        borderBottomWidth: 100 ,
        borderBottomColor: "#030408c8",
        minWidth: 0,
    },
    featureName: {
        fontSize: 16,
        fontWeight: "600",
        color: textPrimary,
        marginLeft: 10,
        flexShrink: 1,
    },
    contentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 12,
    paddingVertical: 20,
  },

  textContainer: {
    flex: 2,
    paddingRight: 20,
    paddingLeft: 20,
  },

  videoContainer: {
    flex: 1,
    alignItems: "center",
    // Align it to the middle of the text container vertically
    justifyContent: "center",
    paddingLeft: 20,
    paddingRight: 20,
  },
  mainVideoContainer: {
    width: "60%",
    height: undefined,
    alignSelf: "center",
    aspectRatio: 16 / 9,
    borderRadius: 10,
    marginBottom: 20,
  },

  // Root container
  screen: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  // Navbar style
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
  navBrand: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", letterSpacing: 0.3, flexShrink: 1 },
  navBrandCompact: {
    fontSize: 17,
  },
  navRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  navRightCompact: {
    gap: 12,
  },
  header : {
    fontSize: 38,
    fontWeight: "700",
    color: "#000000",
    alignSelf: "center",
    marginBottom: 12,
    textDecorationLine: "underline",
     textDecorationColor: "#000000",
     textDecorationStyle: "solid",
  },
  videoSubtitle: {
    fontSize: 20,
    color: "#000000",
    alignSelf: "center",
    maxWidth: "80%",
    textAlign: "center",
    marginBottom: 20,
  },
  logoBoxCompact: { width: 32, height: 32, borderRadius: 8, marginRight: 6 },
});