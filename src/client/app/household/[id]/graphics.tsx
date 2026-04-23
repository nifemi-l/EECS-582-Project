/* PROLOGUE
File name: graphics.tsx
Description: Provide a home page with a WebGL context for graphical rendering
Programmer: Jack Bauer, Logan Smith
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
  - 4/9/26: Add AuthGuard to protect the screen and redirect unauthenticated users to login
  - 4/13/26: Add room selection UI & rotate position widget in edit menu to match rotation angle
  - 4/13/26: Add consolidation to current room selection UI for mobile devices
  - 4/13/26: Web hover on Edit button and room chevrons (chevron scale via transform)
  - 4/15/26: Add edit window buttons for feature rotation, scaling, and translation. Other tweaks. Also rooms
  - 4/16/26: Add 3D scale, rotation database support
  - 4/18/26: Highlight selected task and health bar
  - 4/20/26: Add inventory bar to manage adding features to the graphical view
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

// Prevents URL changing to bypass login.
import { AuthLoadingScreen, useAuthGuard } from "../../../utils/useAuthGuard";

// Import required components
import React, { useEffect, useState, useSyncExternalStore, useRef, Fragment } from 'react';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { ActivityIndicator, LayoutChangeEvent, Platform, Pressable, View, useWindowDimensions } from "react-native";
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from '@react-navigation/elements';
import { Button, PaperProvider, Card, Menu, TextInput } from 'react-native-paper';
import { useLocalSearchParams } from "expo-router";
import { appPaperLightTheme } from "../../../theme/paperTheme";
import { listBrand } from "../../../theme/colors";
import tinycolor from "tinycolor2";

// Import graphics utilities
import {
  MoveDirection, Tool,
  RenderPass,getPixelFromRaw, getPickedObjectFromPointOnScreen,
  setPixelFrustrum, InventoryProps, EditMenuProps
} from "../../../data/graphicsUtils"

// Import renderer classes
import {
  RenderableFeature, Renderer, FOV_RADIANS, NEAR_CLIP, FAR_CLIP, INVALID_TASK_NAME, UNASSIGNED_ROOM_ID
} from "../../../data/renderUtils"

// Import local api utilities
import { fetchHouseholdFeatures, fetchHouseholdRooms } from "../../../data/api";
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

// The renderer
let rdr = new Renderer();

// Axis-aligned screen angles from the camera right vector in world space
let xAxisAngle = 0;

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
  if (feature !== null && feature.tasks.length > 0) {
    rdr.selectedEditTask = feature.tasks[0];
  } 
  if (!feature) {
    rdr.selectedEditTask = null;
  }
  reactListeners.forEach((cb) => cb(rdr.selectedEditFeature)); // call the callback set by each listener
}

// getter for listeners
function getSelectedEditFeature() {
  return rdr.selectedEditFeature;
}

// setter(s) for x axis aligned angles
function setXAxisAngle() {
  xAxisAngle = rdr.getAngleFromCameraRight(MoveDirection.POS_X);
  reactListeners.forEach((cb) => cb(xAxisAngle));
}

// getter(s) for axis aligned angles
function getXAxisAngle() {
  return xAxisAngle;
}

// setter for the unplaced feature list
function setUnplacedFeatures(features: Feature[]) {
  rdr.unplacedFeatures = features;
  reactListeners.forEach((cb) => cb(rdr.unplacedFeatures));
}

// getter for the unplaced feature list
function getUnplacedFeatures() {
  return rdr.unplacedFeatures;
}

// setter for the feature we're waiting to place
function setSelectedPlaceFeature(feature: Feature | null) {
    rdr.selectedPlaceFeature = feature;
    reactListeners.forEach((cb) => cb(rdr.selectedPlaceFeature));
}

// getter for the feature we're waiting to place
function getSelectedPlaceFeature() {
  return rdr.selectedPlaceFeature;
}

// clear out selected place feature
function clearSelectedPlaceFeature() {
  setSelectedPlaceFeature(null);
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
    setXAxisAngle();
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
    setXAxisAngle();
  })

  // When we let go of the drag, we no longer want to rotate so we set the rotation value to 0
  .onEnd(() => {
    updateVelocityPan(0, 0);
    panYDir = 0;
  });

// ***********************************************************
//                      JSX And UI
// ***********************************************************

// An inventory system for unplaced features that we can draw from to put on the screen
function Inventory(props: InventoryProps) {
  // Get a list of unplaced features
  const unplacedFeatureList: Feature[] = useSyncExternalStore(subListener, getUnplacedFeatures);
  // Selected feature that we are going to place on click. Null most of the time
  const selectedPlaceFeature = useSyncExternalStore(subListener, getSelectedPlaceFeature);

  // Renderer ref
  const rdrRef = useRef(rdr);
  useEffect(() => {
    rdrRef.current = rdr;
  }, [rdr]);

  // Find the number of unplaced features in the current room
  // This works becaue it is re-rendered by its parent component on room change
  const numUnplacedInRoom = unplacedFeatureList.filter((f) => {
    return f.room_id === rdrRef.current.currentViewingRoom  || (f.room_id == null && rdrRef.current.currentViewingRoom === UNASSIGNED_ROOM_ID);
  }).length;

  const numPlacedInRoom = rdrRef.current.features.filter((pf) => {
    return (pf.room_id === rdrRef.current.currentViewingRoom) || (pf.room_id === null && rdrRef.current.currentViewingRoom === UNASSIGNED_ROOM_ID)
  }).length

  // Create a dynamic list of the features that we have created in the list view but do not yet have graphical positions
  return (numUnplacedInRoom > 0 ? (
    <View
      style={{
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "absolute",
        bottom: 40,
        zIndex: 10,
        gap: 5,
        padding: 0,
        margin: 0,
      }}
    >
      {props.tool === Tool.TOOL_EDIT_FEATURE ? (
        <Text style={{color: tinycolor("red").toHexString()}}>This room has unplaced features. Enter View mode to place them</Text>
      ) : (
        <Fragment>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
              gap: 10,
            }}
          >
            {unplacedFeatureList.map((feature, index, featureArray) => {
              return (feature.room_id === rdrRef.current.currentViewingRoom) || (feature.room_id === null && rdrRef.current.currentViewingRoom === UNASSIGNED_ROOM_ID) ? (
              <Pressable
                onPress={() => {selectedPlaceFeature === feature ? clearSelectedPlaceFeature() : setSelectedPlaceFeature(feature)}}
                hitSlop={8}
                key={feature.id}
              >
                <MaterialCommunityIcons name={feature.icon as any} color={feature === selectedPlaceFeature ? tinycolor(listBrand).lighten(20).toHexString() : tinycolor(listBrand).darken(10).toHexString()} size={20}/>
              </Pressable>) : null;
            })}
          </View> 
          <Text style={{color: "#FFFFFF"}}>{selectedPlaceFeature === null ? "Select an unplaced feature's icon and click on the grid to place it" : "Selected: " + selectedPlaceFeature.feature_name}</Text>
        </Fragment>
      )}
    </View>)
    : numPlacedInRoom <= 0 ? (
        <View
          style={{
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            position: "absolute",
            bottom: 40,
            zIndex: 10,
            gap: 5,
            padding: 0,
            margin: 0,
          }}
        >
          {/* Display a message if we have no unplaced features AND no placed features (thus none at all) */}
          <Text style={{color: "#FFFFFF"}}>This room has no features. Add or delete them in the List view</Text>
        </View>
      ) : null);
}

// A window that will appear to edit feature info
function EditWindow(props: EditMenuProps) {
  // if in edit mode or not
  const isEditing = props.tool === Tool.TOOL_EDIT_FEATURE;
  const [hoverEditButton, setHoverEditButton] = useState(false);
  // get the currently selected edit feature
  const selectedFeature = useSyncExternalStore(subListener, getSelectedEditFeature); // will be updated by GL, triggers a re-render on change
  // Set the chore selected for our feature
  const [selectedChore, setSelectedChore] = useState(0);
  // Store: Are we changing the interval yet?
  const [showIntervalMenu, setShowIntervalMenu] = useState(false);
  // The frequency update value we want to store for updates
  const [newFrequency, setNewFrequency] = useState("");
  // The angle between the camera and the x axis
  const xAxisAngle = useSyncExternalStore(subListener, getXAxisAngle); // will be updated externally to react, triggers a re-render on change

  // Ensure sync between the renderer's selected task and the UI's selected task
  useEffect(() => {
    if (selectedChore === 0) {
      if (selectedFeature !== null && selectedFeature?.tasks.length > 0) {
        rdr.selectedEditTask = selectedFeature.tasks[selectedChore];
      } else {
        rdr.selectedEditTask = null;
      }
    } else {
      if (selectedFeature !== null) {
        rdr.selectedEditTask = selectedFeature.tasks[selectedChore];
      } else {
        rdr.selectedEditTask = null;
      }
    }
  }, [selectedChore])

  // When selectedFeature changes, we want to update selectedChore as rdr.selectedEditTask may have changed
  useEffect(() => {
    // Just reset to a clean state
    setSelectedChore(0);
  }, [selectedFeature])

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
          zIndex: 11,
          gap: 10,
        }}
      >
        {/* Edit button — web: slight scale on hover (transform only, no layout shift) */}
        <View
          style={{
            alignSelf: "flex-start",
            transform: [{ scale: Platform.OS === "web" && hoverEditButton ? 1.025 : 1 }],
          }}
        >
          <Button
            mode="contained"
            style={{
              backgroundColor:
                Platform.OS === "web" && hoverEditButton
                  ? (isEditing ? "#FFE4E4" : "#E8EEF6")
                  : "#FFFFFF",
            }}
            onPress={() => {
              // We cannot assume isEditing changes sequentially here
              props.updateToolCallback(isEditing ? Tool.TOOL_FEATURE : Tool.TOOL_EDIT_FEATURE);
              rdr.selectedEditFeature = null; // should handle updating selectedFeature through callbacks
              setSelectedChore(0);
            }}
            // @ts-ignore web-only pointer hover
            onMouseEnter={() => Platform.OS === "web" && setHoverEditButton(true)}
            // @ts-ignore web-only pointer hover
            onMouseLeave={() => Platform.OS === "web" && setHoverEditButton(false)}
          >
            <MaterialCommunityIcons
              name="wrench"
              color={
                isEditing
                  ? Platform.OS === "web" && hoverEditButton
                    ? "#FF4444"
                    : "rgb(255, 0, 0)"
                  : Platform.OS === "web" && hoverEditButton
                    ? "#2A6BC8"
                    : listBrand
              }
            />
            <Text
              style={{
                color: isEditing
                  ? Platform.OS === "web" && hoverEditButton
                    ? "#CC0000"
                    : "#B50505"
                  : Platform.OS === "web" && hoverEditButton
                    ? "#2A6BC8"
                    : listBrand,
              }}
            >
              {"  "}
              {isEditing ? "View" : "Edit"}
            </Text>
          </Button>
        </View>

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
            <Card.Title title={selectedFeature.feature_name}/>
            <Card.Actions>
              <Button mode="contained" buttonColor={listBrand} textColor="#FFFFFF" onPress={() => {rdr.house.translateSelectedFeature(0.25, MoveDirection.POS_X)}}>
                <View style={{transform: [{rotate: `${xAxisAngle}rad`}]}}>
                  <MaterialCommunityIcons name="arrow-up" size={18} color="#FFFFFF"/>
                </View>
              </Button>
              <Button mode="contained" buttonColor={listBrand} textColor="#FFFFFF" onPress={() => {rdr.house.translateSelectedFeature(0.25, MoveDirection.NEG_X)}}>
                <View style={{transform: [{rotate: `${xAxisAngle + Math.PI}rad`}]}}>
                  <MaterialCommunityIcons name="arrow-up" size={18} color="#FFFFFF"/>
                </View>
              </Button>
              <Button mode="contained" buttonColor={listBrand} textColor="#FFFFFF" onPress={() => {rdr.house.translateSelectedFeature(0.25, MoveDirection.POS_Z)}}>
                <View style={{transform: [{rotate: `${xAxisAngle + Math.PI / 2}rad`}]}}>
                  <MaterialCommunityIcons name="arrow-up" size={18} color="#FFFFFF"/>
                </View>
              </Button>
              <Button mode="contained" buttonColor={listBrand} textColor="#FFFFFF" onPress={() => {rdr.house.translateSelectedFeature(0.25, MoveDirection.NEG_Z)}}>
                <View style={{transform: [{rotate: `${xAxisAngle + 3 * Math.PI / 2}rad`}]}}>
                  <MaterialCommunityIcons name="arrow-up" size={18} color="#FFFFFF"/>
                </View>
              </Button>
            </Card.Actions>
            <Card.Actions>
              <Button mode="contained" buttonColor={listBrand} textColor="#FFFFFF" onPress={() => {rdr.house.rotateSelectedFeatureY(-15)}}>
                <MaterialCommunityIcons name="axis-z-rotate-clockwise" size={18} color="#FFFFFF"/>
              </Button>
              <Button mode="contained" buttonColor={listBrand} textColor="#FFFFFF" onPress={() => {rdr.house.rotateSelectedFeatureY(15)}}>
                <MaterialCommunityIcons name="axis-z-rotate-counterclockwise" size={18} color="#FFFFFF"/>
              </Button>
              <Button mode="contained" buttonColor={listBrand} textColor="#FFFFFF" onPress={() => {rdr.house.scaleSelectedFeature(0.25)}}>
                <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF"/>
              </Button>
              <Button mode="contained" buttonColor={listBrand} textColor="#FFFFFF" onPress={() => {rdr.house.scaleSelectedFeature(-0.25)}}>
                <MaterialCommunityIcons name="minus" size={18} color="#FFFFFF"/>
              </Button>
            </Card.Actions>
            {/* Display chore cycle button if needed */}
            {selectedFeature.tasks.length > 1 && selectedChore < selectedFeature.tasks.length ? (
              <Card.Actions style={{justifyContent:"center"}}>
                <Button onPress={() => {
                  const taskIndex = (selectedChore + 1) % selectedFeature.tasks.length;
                  setSelectedChore(taskIndex);
                }}>Cycle chore: {
                  selectedFeature.tasks[selectedChore].task_name === INVALID_TASK_NAME ? 
                    "Unnamed " + selectedChore :
                    selectedFeature.tasks[selectedChore].task_name
                }</Button>
              </Card.Actions>
            ) : null}
            {/* Display chore related functionality if needed */}
            {selectedFeature.tasks.length > 0 ? (
              <Card.Actions>
                  {/* The menu for updating intervals */}
                  <Menu
                    visible={isEditing && selectedFeature !== null && showIntervalMenu}
                    onDismiss={() => {setShowIntervalMenu(false); setNewFrequency("0")}}
                    anchor={<Button onPress={() => {setShowIntervalMenu(true)}}>Set interval</Button>}
                  >
                    <TextInput label="The interval in whole days..." mode="outlined" value={newFrequency} keyboardType='numeric'
                      onChangeText={(t) => {
                        // Convert our input to a number, check if it is not a number, then apply changes if we have valid input
                        // They must be a number, an integer (we round), and >= 1
                        const fixed = Number(t);
                        if (!Number.isNaN(fixed) && fixed >= 1) {
                          selectedFeature.tasks[selectedChore].changeFrequency(Math.round(fixed))} // we round to the nearest integer
                          setNewFrequency(t);
                        }
                      }>
                    </TextInput>
                  </Menu>
                  <Button onPress={() => {selectedFeature.tasks[selectedChore].finishTask();}}>Mark complete!</Button>
                </Card.Actions>
            ) : null}
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
  const { isCheckingAuth, isAuthenticated } = useAuthGuard();

  if (isCheckingAuth || !isAuthenticated) {
    return <AuthLoadingScreen />;
  }

  return <AuthenticatedGraphicsScreen />;
}

function AuthenticatedGraphicsScreen() {
  ///////////////////////////
  ///  Renderer State.    ///
  ///////////////////////////
  const selectedFeature = useSyncExternalStore(subListener, getSelectedEditFeature); // will be updated by GL, triggers a re-render on change
  const rdrRef = useRef(rdr);
  useEffect(() => {
    rdrRef.current = rdr;
  }, [rdr]);

  // Track which household room we're viewing
  const [currentViewingRoom, setCurrentViewingRoom] = useState(rdrRef.current.currentViewingRoom);
  const [hoverRoomArrowLeft, setHoverRoomArrowLeft] = useState(false);
  const [hoverRoomArrowRight, setHoverRoomArrowRight] = useState(false);

  // The current graphical view mode
  const [currentTool, setCurrentTool] = useState(Tool.TOOL_FEATURE);

  ///////////////////////////
  ///  Mouse Gestures     ///
  ///////////////////////////

  // capture mouse moves
  useEffect(() => {
    // Update the mouse position when it moves
    const handleMouseMove = (event: MouseEvent) => {
      if (!rdrRef.current.glRef) {
        return;
      }

      const pixelCoords = getPixelFromRaw(rdrRef.current.glRef, event.clientX, event.clientY, viewWidth, viewHeight, windowHeight); // convert mouse position to coordinates in the GL drawing buffer
      setPixelFrustrum(rdrRef.current.glRef, rdr.cam.pixelPickFrustrum, FOV_RADIANS, NEAR_CLIP, FAR_CLIP, pixelCoords.pixelX, pixelCoords.pixelY);
    }

    // Register the mouse move listner
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      // Destructor
      window.removeEventListener('mousemove', handleMouseMove);
    }
  }, [])

  ///////////////////////////
  ///  Stateful Gestures  ///
  ///////////////////////////

  // Handle screen taps (on web, clicks)
  const handleTap = Gesture.Tap() // Handle the tap gesture
  .runOnJS(true) // Run on the main JS thread that the renderer runs on, not the UI thread
  .maxDuration(250) // Limit the amount of time of taps so we can recognize more pans
  .onFinalize((event, success) => { // When the tap event is done...
    if (success) { 
      const highlightedObjectID = rdrRef.current.highlightedFeatureID; // Get the highlighted feature ID
      if (currentTool === Tool.TOOL_EDIT_FEATURE) {
        // Update axis angles for the edit window display
        setXAxisAngle();

        // If we're editing, 
        //    1. Check if we're highlighting a feature. If we're not, do nothing
        //    1A. If it's selected, deselect it. (Done)
        //    1B. If it's not, select it. (Done)
        if (!highlightedObjectID) { // 1: Check if we're highlighting an object
          return; // if we're not, do nothing
        } else {
          // If we do have a highlighted object, check if it matches the selectedFeature
          if (!selectedFeature || selectedFeature.id !== highlightedObjectID) {
            // selectedFeature does not matched highlightedObject
            for (const f of rdrRef.current.house.renderableFeatures) {
              // Set the selectedFeature to match the highlighted object
              if (f.id === highlightedObjectID) {
                // We found the matching feature, so set it and we're done
                setSelectedEditFeature(f);
                break;
              }
            }
          } else {
            // selectedFeature matches the highlightedObject, so we deselect
            setSelectedEditFeature(null);
          }
        }
      } else {
        // If we're not editing (placing features),
        //    1. Check if we're highlighting a feature. If so, delete it and we're done.
        //    2. If we're not highlighting a feature, check if our line intersects any of the walls or the floor. 
        //    3. If we found a valid point, place a feature at that point. If not, we're done. 
        if (!highlightedObjectID) {
          // 2: We're not highlighting a feature, check if the line intersects the walls or the floor
          const dims = getViewAndWindowDims();
          const point = rdrRef.current.screenToWorldCoords(event.absoluteX, event.absoluteY, dims[0], dims[1], dims[2], dims[3]);
          // 3: If we've found a valid point, place a feature at that point. Otherwise, do nothing. 
          if (!point) {
            return; // do nothing if we have not found a valid point
          } else {
            // If we did find a valid point, add the feature. 
            rdrRef.current.placeSelectedFeature(point[0], point[1], point[2]);
          }
        } else {
          // 1: We are highlighting a feature, so we just delete it.
          rdrRef.current.removeFeature(highlightedObjectID);
          rdrRef.current.setHighlightedFeature(-1); // -1 effectively sets to null
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
  const [emptyFeatures, setEmptyFeatures] = useState(true);

  // Reload the features of our housewhenever the household ID changes.
  // Also mostly from list.tsx (thanks again Nifemi)
  useEffect(() => {
    // Get household room data
    fetchHouseholdRooms(householdId)
      .then((roomsData) => {
        // From our room data, get the list of room data objects
        const rooms = Array.isArray(roomsData) ? roomsData : [];
        rdrRef.current.setRooms(rooms);
        setCurrentViewingRoom(rdrRef.current.setValidRoom());
      }) 
      .catch((e) => {
        console.error("Failed to fetch rooms for household", householdId, e);
      });

    // Get household feature data
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
                  f.icon || "home-outline",
                  f.room_id != null ? Number(f.room_id) : null,
                  f.scale,
                  f.rotation_y
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

              // Determine if our features list is empty
              if (mapped.length > 0) {
                setEmptyFeatures(false);
              }
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

  // Get dims of entire screen (also used to keep room controls from overlapping the Edit column)
  const { width: layoutWidth, height: layoutHeight } = useWindowDimensions();
  windowWidth = layoutWidth;
  windowHeight = layoutHeight;

  // Reserve left band for Edit pill + padding; room row is confined to [inset, right] so chevrons do not encroach on Edit
  const roomBarLeftInset = Math.min(Math.max(Math.round(layoutWidth * 0.34), 116), 210);
  const roomChevronSize = layoutWidth < 360 ? 28 : layoutWidth < 480 ? 32 : 36;
  const roomLabelFontSize = layoutWidth < 360 ? 11 : layoutWidth < 480 ? 12 : 14;

  /** Room nav chevron default / web-hover (brighter green on hover) */
  const ROOM_ACCENT_COLOR = rdrRef.current.getRoomAccentColorFromId(currentViewingRoom);
  const ROOM_CHEVRON_COLOR = !ROOM_ACCENT_COLOR ? "#29ff46" : ROOM_ACCENT_COLOR;
  const ROOM_CHEVRON_COLOR_HOVER = !ROOM_ACCENT_COLOR ? "#5EFF9A" : tinycolor(ROOM_ACCENT_COLOR).brighten(10).toHexString();

  return (
    featureFetchSuccess && !emptyFeatures ? (
      <Fragment>
        <PaperProvider theme={appPaperLightTheme}>
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

          {/* Room change buttons —> inset from left so narrow screens never overlap Edit; scaled type/icons */}
          <View
            style={{
              position: "absolute",
              left: roomBarLeftInset,
              right: 12,
              top: 8,
              paddingVertical: 6,
              paddingHorizontal: 4,
              zIndex: 9,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 2,
              minWidth: 0,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous room"
              hitSlop={8}
              style={{ padding: 4, minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "center" }}
              onPress={() => {
                setCurrentViewingRoom(rdrRef.current.goPrevRoom());
                rdrRef.current.selectedEditFeature = null;
                rdrRef.current.selectedEditTask = null;
                clearSelectedPlaceFeature();
              }}
              // @ts-ignore web-only pointer hover
              onMouseEnter={() => Platform.OS === "web" && setHoverRoomArrowLeft(true)}
              // @ts-ignore web-only pointer hover
              onMouseLeave={() => Platform.OS === "web" && setHoverRoomArrowLeft(false)}
            >
              <View
                style={{
                  justifyContent: "center",
                  alignItems: "center",
                  transform: [{ scale: Platform.OS === "web" && hoverRoomArrowLeft ? 1.14 : 1 }],
                }}
              >
                <MaterialCommunityIcons
                  name="chevron-left"
                  size={roomChevronSize}
                  color={Platform.OS === "web" && hoverRoomArrowLeft ? ROOM_CHEVRON_COLOR_HOVER : ROOM_CHEVRON_COLOR}
                />
              </View>
            </Pressable>
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                color: "white",
                fontSize: roomLabelFontSize,
                fontWeight: "600",
                flexShrink: 1,
                textAlign: "right",
                minWidth: 0,
                paddingHorizontal: 4,
              }}
            >
              {rdrRef.current.getRoomNameFromId(currentViewingRoom)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next room"
              hitSlop={8}
              style={{ padding: 4, minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "center" }}
              onPress={() => {
                setCurrentViewingRoom(rdrRef.current.goNextRoom());
                rdrRef.current.selectedEditFeature = null;
                rdrRef.current.selectedEditTask = null;
                clearSelectedPlaceFeature();
              }}
              // @ts-ignore web-only pointer hover
              onMouseEnter={() => Platform.OS === "web" && setHoverRoomArrowRight(true)}
              // @ts-ignore web-only pointer hover
              onMouseLeave={() => Platform.OS === "web" && setHoverRoomArrowRight(false)}
            >
              <View
                style={{
                  justifyContent: "center",
                  alignItems: "center",
                  transform: [{ scale: Platform.OS === "web" && hoverRoomArrowRight ? 1.14 : 1 }],
                }}
              >
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={roomChevronSize}
                  color={Platform.OS === "web" && hoverRoomArrowRight ? ROOM_CHEVRON_COLOR_HOVER : ROOM_CHEVRON_COLOR}
                />
              </View>
            </Pressable>
          </View>

          <EditWindow tool={currentTool} updateToolCallback={setCurrentTool}/>
          <Inventory tool={currentTool}/> 
        </View>
      </PaperProvider>
    </Fragment>
    ) : featureFetchSuccess && emptyFeatures ? (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        {/* Display a notification to add features if we don't have any */}
        <Text style={{fontSize: 16, color: "#5B6B7F", fontWeight: "600"}}>
          No data yet. Add and delete household features and chores in the List view.
        </Text>
      </View>
    ) : (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        {/* Display a loading bar while we wait to fetch features */}
        <ActivityIndicator size="large" />
        <Text style={{fontSize: 16, color: "#5B6B7F", fontWeight: "600"}}>
          Fetching household data...
        </Text>
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
  // Initialize the renderer and WebGL context
  await rdr.init(gl);

  // Setup callback functions so that we can update the UI from the renderer later
  rdr.setUnplacedFeatureCallback(setUnplacedFeatures);
  rdr.setClearSelectedPlaceFeatureCallback(clearSelectedPlaceFeature);

  // Start drawing frames. This is a recursive animation function
  drawFrame(rdr.lastFrameTime);
}

// ***********************************************************
//                      Render Loop
// ***********************************************************
// This is the function that will be called every frame to draw a frame on in the WebGL context

// Draw a frame including all wrapper routines
function drawFrame(time: number) {
    // Ensure we're ready to draw
    if (!rdr.checkReadyToDraw() || !rdr.glRef || !rdr.vaoManager) {
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

    // Render the scene once before the acual render so that we can know which object the user is currently highlighting
    rdr.switchRenderpass(RenderPass.PICK_OBJECT);
    renderScene(delta);
    rdr.setHighlightedFeature(getPickedObjectFromPointOnScreen(rdr.glRef));

    // Call the render method to actually draw all objects
    // For the cube draw calls, we need to switch to the correct vertex attribute and buffer configuration. 
    // This also updates our view matrix so we can rotate the world around
    rdr.switchRenderpass(RenderPass.MAIN);
    renderScene(delta);
  
    // End frame and then request a new animation frame with this same method (recursive)
    rdr.glRef.endFrameEXP();
    rdr.frameId = window.requestAnimationFrame(drawFrame);
}

// actually call the render methods
function renderScene(delta: number) {
  // Ensure we have a valid WebGL context
  if (!rdr.glRef) {
    console.log("No WebGL context.");
    return;
  }

  // Prepare draw by clearing the screen and depth buffer
  rdr.glRef.clear(rdr.glRef.COLOR_BUFFER_BIT | rdr.glRef.DEPTH_BUFFER_BIT);

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
}