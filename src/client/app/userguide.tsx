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
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Image, Platform, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { saveToken } from "../utils/authStorage";
import { navy } from "../theme/colors";

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
  const { width } = useWindowDimensions();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>User Guide</Text>
      <Text style={styles.overview}>Welcome to the HomeSeeHome user guide! Below is an overview of the main features and how to use them.</Text>

      <View style={styles.feature}>
        <Text style={styles.featureTitle}>Overview</Text>
        <Text style={styles.featureDescription}>
          HomeSeeHome is a home management application that helps you keep track of your household tasks.
          You can create and manage tasks, set reminders, and collaborate with other household members to ensure everything is well organized and maintained.
        </Text>