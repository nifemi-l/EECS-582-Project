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
import { listBorder, listSelection, navy, textPrimary, textSecondary } from "../theme/colors";
import { black } from "react-native-paper/lib/typescript/styles/themes/v2/colors";

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

  return (
    <View>
    <View style={styles.root}>
      <View style={styles.titleBar}>
        <Text style={styles.title}>HomeSeeHome | User Guide</Text>
        <Text style={styles.subtitle}>
          <br></br>
          Learn about HomeSeeHome and how to use its features to visualize your living space.
          <br></br>
          <br></br>
          Below is an overview video that demonstrates the main features of HomeSeeHome.
        </Text>
      </View>
    </View>


    <View style={styles.featureTitle}>3D View</View>
    <View style={styles.featureGroup}>
      {/* Clickable Header */}
      <TouchableOpacity onPress={() => setExpandedSection(expandedSection === "3D Room View" ? null : "3D Room View")}>
        <Text style={styles.featureTitle}>
          Camera Movement {expandedSection === "3D Room View" ? "▲" : "▼"}
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
        <br></br>
        <br></br>
        Pan: Click and drag left and right to rotate the view.
        <br></br>
        <br></br>
        Zoom: Click and drag up and down to zoom in and out.
        <br></br>
        <br></br>
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
        style={styles.featureMp4}
      >
        <source
          src={require("../assets/videos/rotating_3d_view.mp4")}
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
      <TouchableOpacity onPress={() => setExpandedSection(expandedSection === "Another Feature Here" ? null : "Another Feature Here")}>
        <Text style={styles.featureTitle}>
          Another Feature Here {expandedSection === "Another Feature Here" ? "▲" : "▼"}
        </Text>
      </TouchableOpacity>

      {/* Hidden until expanded */}
      {expandedSection === "Another Feature Here" && (
  <View style={styles.contentRow}>
    {/* Left Side */}
    <View style={styles.textContainer}>
      <Text style={styles.subtitle}>
        Another feature description would go here, explaining the functionality and benefits of the feature.
        <br></br>
        <br></br>
        Enjoy the test valorant clip lol
      </Text>
    </View>

    {/* Right Side */}
    <View style={styles.videoContainer}>
      <video
        autoPlay
        muted
        loop
        playsInline
        style={styles.featureMp4}
      >
        <source
          src={require("../assets/videos/placeholder_overview.mp4")}
          type="video/mp4"
        />
      </video>
    </View>
  </View>
)}
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
    },
    title: {
        fontSize: 28,
        fontWeight: "700",
        color: textPrimary,
    },
    subtitle: {
        fontSize: 18,
        color: "#5A6B7E",
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
      color: textPrimary,
      paddingLeft: 20
    },

    /** Web: shared faint darken when hovering a single row (section header, task row, add-task row) */
    featureGroup: {
        backgroundColor: "#fff",
        borderRadius: 14,
        marginBottom: 20,
        maxWidth: "100%",
        overflow: "hidden",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: listBorder,
        elevation: 1,
        shadowColor: "#2d4a7a",
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
  });