/* PROLOGUE
File name: graphics.tsx
Description: Provide a home page with a WebGL context for graphical rendering
Programmer: Jack Bauer
Creation date: 2/15/26
Revision date: 
  - 2/15/26: Move graphical context and related code from index.tsx to here. Add comments. 
  - 2/23/26: Add a grid on the xz-axis, the ability to pan and tap, and convert taps from screen to world coordinates
  - 3/1/26: Add a floor to the house model, features spawn on click with type options, healthbars shown per chore per feature
  - 3/18/26: Renamed to graphics.tsx to allow for new home page (post log-in)
  - 3/18/26: Changed dependency locations to match restructure.
  - 3/28/26: Add remove feature, walls with visibility changes, edit mode and edit menu, floor resize, zoom
  - 3/29/26: Major refactor (split to graphicsUtils and renderUtils)
  - 4/6/26: Convert to use FeatureType enum & support model loading
Preconditions: A React application asking for the home page
Postconditions: A home page component ready for rendering
Errors: The home page will always be delivered successfully. 
Side effects: None
Invariants: None
Known faults: None
*/

// ***********************************************************
//                      Needed Imports
// ***********************************************************

// Import required components
import React, { useEffect, useState, useSyncExternalStore, useRef } from 'react';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import * as GLM from 'gl-matrix';
import { LayoutChangeEvent, Pressable, View, useWindowDimensions, ActivityIndicator } from "react-native";
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from '@react-navigation/elements';
import { Button, PaperProvider, Card, Menu, TextInput } from 'react-native-paper';
import { useLocalSearchParams } from "expo-router";

// Import graphics utilities
import {
  MoveDirection, Tool,
  FEATURE_ORANGE, FEATURE_BLUE, FEATURE_GREEN, FEATURE_RED,
  cellFromCoords
} from "../../../data/graphicsUtils"

// Import renderer classes
import {
  RenderableFeature, Renderer
} from "../../../data/renderUtils"

// Import local api utilities
import { fetchHouseholdFeatures } from "../../../data/api";
import Feature, { getFeatureTypeFromString } from "../../../data/feature";
import Task from "../../../data/task";

// ***********************************************************
//             Top Level UI / Interface Globals
// ***********************************************************

// See https://docs.swmansion.com/react-native-gesture-handler/docs/gestures/use-pan-gesture for gesture handler details
// Also define global variables to store this data and update each frame
let panVelocityX = 0;
let panLastX = 0 
let panVelocityY = 0;
let panLastY = 0; 
let panYDir = 0;

// store screen dimensios. Window is the entire window, view is the view component that wraps the GL context
let viewWidth = 0;
let viewHeight = 0;
let windowHeight = 0;
let windowWidth = 0;

// Store the current editing tool
let currentTool = Tool.TOOL_FEATURE;

// The renderer
let rdr = new Renderer();

// ***********************************************************
//                      React UI PubSub System
// ***********************************************************

// We'll set up a listener pattern so that we can update the react UI from the GL side
let reactListeners: ((val: any) => void)[] = []; // Store callback functions to use when state changes

// A function to add a callback function to the listeners list so that we can update react when GL state changes
function subListener(cb: ((val: any) => void)) {
  reactListeners.push(cb);

  // return an "unsubscribe" function that will remove the listener from the list
  return () => {
    reactListeners = reactListeners.filter((l) => l !== cb); // set the listener list to a new version filtered to just the ones that DON'T match
  };
}

// setter so that listeners are all notified on update
function setSelectedEditFeature(feature: RenderableFeature | null) {
  rdr.selectedEditFeature = feature;
  reactListeners.forEach((cb) => cb(rdr.selectedEditFeature)); // call the callback set by each listener
}

// getter for listeners
function getSelectedEditFeature() {
  return rdr.selectedEditFeature;
}

// Given coordinates, select the feature in the house lists
function findAndSetSelectedFeature(cellX: number, cellY: number, cellZ: number) {
  // iterate through house features. We do it in the order x, z, y since y should always be constant so far (we only support the xz plane)
  // There should also only ever be one feature that matches
  for (let i = 0; i < rdr.house.renderableFeatures.length; i++) {
    if (rdr.house.renderableFeatures[i].x_pos != cellX || rdr.house.renderableFeatures[i].z_pos != cellZ || rdr.house.renderableFeatures[i].y_pos != cellY) {
      continue;
    } else {
      // if this is already selected, deselect. Otherwise, select it
      if (rdr.selectedEditFeature === rdr.house.renderableFeatures[i]) {
        setSelectedEditFeature(null);
      } else {
        setSelectedEditFeature(rdr.house.renderableFeatures[i]);
      }
    }
  }
}

// ***********************************************************
//                  UI / Interface Utilities
// ***********************************************************

// A helper function to update the velocity of the pan. We multiply the delta by a constant speed value
function updateVelocityPan(dx: number, dy: number) {
  panVelocityX = dx * 0.5;
  panVelocityY = dy * 0.5;
}

// Set width and height of view on layout change
function handleLayout(event: LayoutChangeEvent) {
  viewWidth = event.nativeEvent.layout.width;
  viewHeight = event.nativeEvent.layout.height;
}

// Helper to get dimensions
function getViewAndWindowDims() {
  return [viewWidth, viewHeight, windowWidth, windowHeight];
}

// This needs to be a function so that we can dynamically change the tool in gestures
function isUsingEditTool() {
  return currentTool === Tool.TOOL_EDIT_FEATURE;
}

// ***********************************************************
//     Non-stateful Gesture Handling (for state, see Index)
// ***********************************************************
// NOTE: because these are defined outside the Ract state (at the top level of this file) they will always
// retain the state they are created with. One way to address this is to use function to access external 
// variables since the function pointers wont change. 

// Define gesture handler function for panning and rotating the model
const handlePan = Gesture.Pan()
  .runOnJS(true) // Run all gesture handling on the main JS thread. Note: for performance reasons we could change this so it runs on the UI thread in the future
  
  // Reset values on the start of a gesture
  .onStart(() => {
    panLastX = 0;
    panLastY = 0;
    panYDir = 0;
  })

  // Handle gesture updates and calculate the difference between frames, then update the velocity
  .onUpdate((event) => {
    const deltaX = event.translationX - panLastX;
    panLastX = event.translationX;

    const deltaY = event.translationY - panLastY;
    panLastY = event.translationY;

    // store the direction of our y movement
    panYDir = deltaY > 0 ? 1 : -1;

    updateVelocityPan(deltaX, deltaY);
  })

  // When we let go of the drag, we no longer want to rotate so we set the rotation value to 0
  .onEnd(() => {
    updateVelocityPan(0, 0);
    panYDir = 0;
  });

// ***********************************************************
//                      JSX And UI
// ***********************************************************

// The color selection buttons at the bottom of the screen
function ColorButtons() {
  // Store the current color so we can show it in the UI
  const [drawingColor, setDrawingColor] = useState(FEATURE_ORANGE);

  // Ensure sync between gl and react
  if (drawingColor !== rdr.currentDrawingColor) {
    setDrawingColor(rdr.currentDrawingColor);
  }

  /* Buttons for selecting type */
  return (
    <View 
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        position: "absolute",
        bottom: 40,
        padding: 10,
        zIndex: 10,
        gap: 10,
      }}
    >
      {/* Red Button */}
      <Pressable
        onPress={() => {rdr.currentDrawingColor = FEATURE_RED; setDrawingColor(FEATURE_RED)}}
        hitSlop={8}
      >
        <MaterialCommunityIcons name={drawingColor !== FEATURE_RED ? 'circle-outline' : 'circle'} size={20} color="#de3737" />
      </Pressable>
      {/* Green Button */}
      <Pressable
        onPress={() => {rdr.currentDrawingColor = FEATURE_GREEN; setDrawingColor(FEATURE_GREEN)}}
        hitSlop={8}
      >
        <MaterialCommunityIcons name={drawingColor !== FEATURE_GREEN ? 'circle-outline' : 'circle'} size={20} color="#53de37" />
      </Pressable>
      {/* Blue Button */}
      <Pressable
        onPress={() => {rdr.currentDrawingColor = FEATURE_BLUE; setDrawingColor(FEATURE_BLUE)}}
        hitSlop={8}
      >
        <MaterialCommunityIcons name={drawingColor !== FEATURE_BLUE ? 'circle-outline' : 'circle'} size={20} color="#3764de" />
      </Pressable>
      {/* Orange Button */}
      <Pressable
        onPress={() => {rdr.currentDrawingColor = FEATURE_ORANGE; setDrawingColor(FEATURE_ORANGE)}}
        hitSlop={8}
      >
        <MaterialCommunityIcons name={drawingColor !== FEATURE_ORANGE ? 'circle-outline' : 'circle'} size={20} color="#de8537" />
      </Pressable>

      {/* Edit grid size buttons */}
      <Pressable
        onPress={() => {rdr.grid.resize(rdr.grid.width + 2, rdr.grid.height); rdr.house.resizeFloorFeature()}}>
        <MaterialCommunityIcons name='arrow-right' color="#abcd" />
      </Pressable>

      <Pressable
        onPress={() => {rdr.grid.resize(rdr.grid.width, rdr.grid.height + 2); rdr.house.resizeFloorFeature()}}>
        <MaterialCommunityIcons name='arrow-up' color="#abcd" />
      </Pressable>

      <Pressable
        onPress={() => {rdr.grid.resize(rdr.grid.width - 2, rdr.grid.height); rdr.house.resizeFloorFeature()}}>
        <MaterialCommunityIcons name='arrow-left' color="#abcd" />
      </Pressable>

      <Pressable
        onPress={() => {rdr.grid.resize(rdr.grid.width, rdr.grid.height - 2); rdr.house.resizeFloorFeature()}}>
        <MaterialCommunityIcons name='arrow-down' color="#abcd" />
      </Pressable>
    </View>
  );
}

// A window that will appear to edit feature info
function EditWindow() {
  // if in edit mode or not
  const [isEditing, setIsEditing] = useState(false);
  // get the currently selected edit feature
  const selectedFeature = useSyncExternalStore(subListener, getSelectedEditFeature); // will be updated by GL, triggers a re-render on change
  // Set the chore selected for our feature
  const [selectedChore, setSelectedChore] = useState(0);
  // Store: Are we changing the interval yet?
  const [showIntervalMenu, setShowIntervalMenu] = useState(false);
  // The frequency update value we want to store for updates
  const [newFrequency, setNewFrequency] = useState("");

  // Reset selectedChore index if needed
  if ((selectedFeature !== null && selectedChore >= selectedFeature.tasks.length)) {
    setSelectedChore(0);
  }

  return (
    <View 
      style={{
          flexDirection: "column",
          alignItems: "baseline",
          justifyContent: "flex-end",
          position: "absolute",
          top: 10,
          left: 20,
          padding: 10,
          zIndex: 10,
          gap: 10,
        }}
      >
        {/* Edit button */}
        <Button 
          mode="contained" 
          style={{backgroundColor: "white"}}
          onPress={() => {
            // We cannot assume isEditing changes sequentially here
            currentTool = isEditing ? Tool.TOOL_FEATURE : Tool.TOOL_EDIT_FEATURE;
            rdr.selectedEditFeature = null; // should handle updating selectedFeature through callbacks
            setIsEditing(!isEditing); 
            setSelectedChore(0);
          }}>
          <MaterialCommunityIcons name='wrench' color={isEditing ? "rgb(255, 0, 0)": "rgb(47, 47, 255)"}/>
          <Text>  {isEditing ? "View" : "Edit" }</Text>
        </Button>

        {/* Context Edit Window 
              In the menu we display:
                - Button to mark complete
                - Feature type
                - Feature time remaining until 0 out of total
                - Option to change total decay
        */}

        {/* Case 1: We are editing and have a feature selected */}
        {/* Case 2: We are editing and no feature is selected */} 
        {/* Case 3: We are not editing anything */}

        {isEditing && selectedFeature !== null ? (
          <Card
            mode='contained'
          >
            <Card.Title title={selectedFeature.feature_name + "[" + selectedFeature.id + "]"}/>
            <Card.Actions>
              <Button onPress={() => {rdr.house.moveSelectedFeatureByOne(MoveDirection.POS_X)}}><MaterialCommunityIcons name='arrow-left'/></Button>
              <Button onPress={() => {rdr.house.moveSelectedFeatureByOne(MoveDirection.NEG_X)}}><MaterialCommunityIcons name='arrow-right'/></Button>
              <Button onPress={() => {rdr.house.moveSelectedFeatureByOne(MoveDirection.POS_Z)}}><MaterialCommunityIcons name='arrow-up'/></Button>
              <Button onPress={() => {rdr.house.moveSelectedFeatureByOne(MoveDirection.NEG_Z)}}><MaterialCommunityIcons name='arrow-down'/></Button>
            </Card.Actions>
            {/* Display chore cycle button if needed */}
            {selectedFeature.tasks.length > 1 ? (
              <Card.Actions style={{justifyContent:"center"}}>
                <Button onPress={() => {setSelectedChore((selectedChore + 1) % selectedFeature.tasks.length)}}>Cycle chore: Selected {selectedChore}</Button>
              </Card.Actions>
            ) : null}
              <Card.Actions>
                {/* The menu for updating intervals */}
                <Menu
                  visible={isEditing && selectedFeature !== null && showIntervalMenu}
                  onDismiss={() => {setShowIntervalMenu(false); setNewFrequency("0")}}
                  anchor={<Button onPress={() => {setShowIntervalMenu(true)}}>Set interval</Button>}
                >
                  <TextInput label="The interval in days..." mode="outlined" value={newFrequency} keyboardType='numeric'
                    onChangeText={(t) => {
                      // Convert our input to a number, check if it is not a number, then apply changes if we have valid input
                      const fixed = Number(t);
                      if (!Number.isNaN(fixed)) {
                        selectedFeature.tasks[selectedChore].changeFrequency(fixed)}
                        setNewFrequency(t);
                      }
                    }>
                  </TextInput>
                </Menu>
                <Button onPress={() => {selectedFeature.tasks[selectedChore].finishTask();}}>Mark complete!</Button>
              </Card.Actions>
          </Card>
        ) : isEditing && !selectedFeature ? (
          <Text style={{color: "red"}}>Select a feature to edit</Text>
        ) : null }
    </View>
  );
}

// Outline the layout of the main page. The GLView component will provide our WebGL context for graphics, the ViewToggle
// will allow a switch between the 3D rendered graphical view and the list view of the house model, and the View structures 
// the page. Also uses a container to grab user gestures (e.g. rotating on the screen or panning or screen taps (clicks))
export default function Index() {
  const rdrRef = useRef(rdr);
  useEffect(() => {
    rdrRef.current = rdr;
  }, [rdr]);

  ///////////////////////////
  ///  Stateful Gestures  ///
  ///////////////////////////

  // Handle screen taps (on web, clicks)
  const handleTap = Gesture.Tap() // Handle the tap gesture
  .runOnJS(true) // Run on the main JS thread that the renderer runs on, not the UI thread
  .maxDuration(250) // Limit the amount of time of taps so we can recognize more pans
  .onFinalize((event, success) => { // When the tap event is done...
    if (success) { 
      // Convert our tap's position on the screen to world coordinates on the xz plane
      const dims = getViewAndWindowDims();
      const worldPos: GLM.vec3 | null = rdrRef.current.screenToWorldCoords(event.absoluteX, event.absoluteY, dims[0], dims[1], dims[2], dims[3]);
      if (!worldPos) {
        console.error("Unable to convert tap to world coordinates.");
      } else {
        // We have successfully found a world position from our tap, so figure out what cell we're in
        const tappedCell = cellFromCoords(worldPos[0], worldPos[2]);
        // Add to House or select depending on tool
        if (isUsingEditTool()) {
          findAndSetSelectedFeature(tappedCell[0], 0, tappedCell[1]);
        } else {
          rdrRef.current.addBlock(tappedCell[0], 0, tappedCell[1]);
        }
      }
    }
  });

  // Use a composed gesture to allow for both pan and tap gestures. It is exclusive in that we can't use them both
  const composedGesture = Gesture.Exclusive(handlePan, handleTap);

  ///////////////////////////
  ///  Index and similar  ///
  ///////////////////////////

  // From list.tsx (thanks Nifemi)
  const { id } = useLocalSearchParams<{ id: string }>(); // get parameter from route
  const householdId = Number(id) || 1;
  const [featureFetchSuccess, setFeatureFetchSuccess] = useState(false);

  // Reload the features of our housewhenever the household ID changes.
  // Also mostly from list.tsx (thanks again Nifemi)
  useEffect(() => {
    fetchHouseholdFeatures(householdId)
      .then((data: any[]) => {
              // Convert the raw JSON objects into Feature/Task class instances
              // so the health bar math and other methods still work
              const mapped = data.map((f: any) => {
                const feat = new Feature(
                  f.feature_name,
                  f.household_id,
                  getFeatureTypeFromString(f.feature_type),
                  f.x_pos, f.y_pos, f.z_pos,
                  f.feature_id,
                  f.icon || "home-outline"
                );
                feat.tasks = (f.tasks || []).map((t: any) => {
                  const task = new Task(
                    t.task_name,
                    t.feature_id,
                    t.frequency_days,
                    t.icon || "clipboard-text-outline",
                    t.visibility || "household",
                    t.created_by_account_id,
                    t.task_id
                  );
                  // Parse the ISO date string back into a Date object for health calculations
                  task.last_completed = t.last_completed ? new Date(t.last_completed) : null;
                  return task;
                });
                return feat;
              });
              rdrRef.current.setFeatures(householdId, mapped);
              setFeatureFetchSuccess(true);
            })
      .catch((e) => {
        console.error("Failed to fetch features for household", householdId, e);
      });
  }, [householdId]);

  // On component unmount, cancel our rendering loop
  useEffect(() => {
    return () => {
      if (rdrRef.current.frameId !== null) {
        cancelAnimationFrame(rdrRef.current.frameId);
        rdrRef.current.frameId = null;
      }
    }
  }, []);

  // Get dims of entire screen
  windowWidth = useWindowDimensions().width; 
  windowHeight = useWindowDimensions().height;
  return (
    featureFetchSuccess ? (
      <PaperProvider>
      <View
        onLayout={handleLayout}
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <GestureDetector gesture={composedGesture}>
          <GLView style={{
            width: "100%",
            height: "100%"
          }} 
          onContextCreate={onContextCreate}
          />
        </GestureDetector>

        <EditWindow />
        <ColorButtons />
      </View>
    </PaperProvider>
    ) : (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        {/* Display a loading bar while we wait to fetch features */}
        <ActivityIndicator size="large" />
      </View>
    )
  );
}

// ***********************************************************
//                 Renderer Context Creation
// ***********************************************************

// This is the function called to create the WebGL context, setup extensions if needed, read and compile shaders, and do all
// other prep work which is neccessary to initialize our renderer. 
async function onContextCreate(gl: ExpoWebGLRenderingContext) {
  await rdr.init(gl);

  // Start drawing frames. This is a recursive animation function
  drawFrame(rdr.lastFrameTime);
}

// ***********************************************************
//                      Render Loop
// ***********************************************************
// This is the function that will be called every frame to draw a frame on in the WebGL context

function drawFrame(time: number) {
    // Ensure we have a valid WebGL context
    if (!rdr.glRef || !rdr.vaoManager) {
      console.log("No WebGL context.");
      return;
    }

    // Ensure we're ready to draw
    if (!rdr.checkReadyToDraw()) {
      console.error("Draw not ready.");
      return;
    }

    // Update the renderable features if necessary (e.g. they've changed since last frame because we've fetched from the database)
    if (rdr.featuresDirty) {
      rdr.updateFeatures();
    }

    // Check time and update frame time to get a delta for animation
    const delta = (time - rdr.lastFrameTime) / 1000;
    rdr.lastFrameTime = time;

    // Prepare draw by clearing the screen and depth buffer
    rdr.glRef.clear(rdr.glRef.COLOR_BUFFER_BIT | rdr.glRef.DEPTH_BUFFER_BIT);

    // For the cube draw calls, we need to switch to the correct vertex at  tribute and buffer configuration. 
    // This also updates our view matrix so we can rotate the world around
    rdr.glRef.useProgram(rdr.shaderProgram); // use the household shader program
    rdr.vaoManager.bindVAO(rdr.house.vao);

    // Update rotation & zoom
    rdr.updateViewMatrix(panVelocityX, panVelocityY, panYDir, delta);

    // Update wall visibility according to angle
    rdr.setWallVisibility();

    // Draw the features of the house
    rdr.drawFeatures();

    // Draw the grid. 
    rdr.drawGrid();

    // Draw healthbars
    rdr.drawHealthbars();

    // End frame and then request a new animation frame with this same method (recursive)
    rdr.glRef.endFrameEXP();
    rdr.frameId = window.requestAnimationFrame(drawFrame);
}