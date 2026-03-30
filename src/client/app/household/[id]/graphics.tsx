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
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import * as GLM from 'gl-matrix';
import { LayoutChangeEvent, Pressable, View, useWindowDimensions } from "react-native";
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from '@react-navigation/elements';
import { Button, PaperProvider, Card, Menu, TextInput } from 'react-native-paper';

// Import graphics utilities
import {
  MoveDirection, Tool, isUsingEditTool,
  FEATURE_ORANGE, FEATURE_BLUE, FEATURE_GREEN, FEATURE_RED,
  cellFromCoords, findAndSetSelectedFeature,
  readShaderData
} from "../../../data/graphicsUtils"

// Import renderer utilities
import {
  Camera, RenderableFeature, RenderableHousehold, 
  Grid, screenToWorldCoords, addBlock,
  bindVAO, createVAO
} from "../../../data/rendererUtils"


// ***********************************************************
//                      Constants
// ***********************************************************

// Define the near and far clips for the projection matrix
const NEAR_CLIP = 0.1;
const FAR_CLIP = 100.0;

// Define min and max world scaling
const MIN_WORLD_SCALE = 0.1;
const MAX_WORLD_SCALE = 6.0;

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
  selectedEditFeature = feature;
  reactListeners.forEach((cb) => cb(selectedEditFeature)); // call the callback set by each listener
}

// getter for listeners
function getSelectedEditFeature() {
  return selectedEditFeature;
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

// ***********************************************************
//                      Gesture Handling
// ***********************************************************

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

// Handle screen taps (on web, clicks)
const handleTap = Gesture.Tap() // Handle the tap gesture
  .runOnJS(true) // Run on the main JS thread that the renderer runs on, not the UI thread
  .maxDuration(250) // Limit the amount of time of taps so we can recognize more pans
  .onFinalize((event, success) => { // When the tap event is done...
    if (success) { 
      // Convert our tap's position on the screen to world coordinates on the xz plane
      const worldPos: GLM.vec3 | null = screenToWorldCoords(event.absoluteX, event.absoluteY);
      if (!worldPos) {
        console.error("Unable to convert tap to world coordinates.");
      } else {
        // We have successfully found a world position from our tap, so figure out what cell we're in
        const tappedCell = cellFromCoords(worldPos[0], worldPos[2]);
        // Add to House or select depending on tool
        if (isUsingEditTool(currentTool)) {
          findAndSetSelectedFeature(tappedCell[0], 0, tappedCell[1]);
        } else {
          addBlock(tappedCell[0], 0, tappedCell[1]);
        }
      }
    }
  })


// Use a composed gesture to allow for both pan and tap gestures. It is exclusive in that we can't use them both
const composedGesture = Gesture.Exclusive(handlePan, handleTap);

// ***********************************************************
//                      JSX And UI
// ***********************************************************

// The color selection buttons at the bottom of the screen
function ColorButtons() {
  // Store the current color so we can show it in the UI
  const [drawingColor, setDrawingColor] = useState(FEATURE_ORANGE);

  // Ensure sync between gl and react
  if (drawingColor !== currentDrawingColor) {
    setDrawingColor(currentDrawingColor);
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
        onPress={() => {currentDrawingColor = FEATURE_RED; setDrawingColor(FEATURE_RED)}}
        hitSlop={8}
      >
        <MaterialCommunityIcons name={drawingColor !== FEATURE_RED ? 'circle-outline' : 'circle'} size={20} color="#de3737" />
      </Pressable>
      {/* Green Button */}
      <Pressable
        onPress={() => {currentDrawingColor = FEATURE_GREEN; setDrawingColor(FEATURE_GREEN)}}
        hitSlop={8}
      >
        <MaterialCommunityIcons name={drawingColor !== FEATURE_GREEN ? 'circle-outline' : 'circle'} size={20} color="#53de37" />
      </Pressable>
      {/* Blue Button */}
      <Pressable
        onPress={() => {currentDrawingColor = FEATURE_BLUE; setDrawingColor(FEATURE_BLUE)}}
        hitSlop={8}
      >
        <MaterialCommunityIcons name={drawingColor !== FEATURE_BLUE ? 'circle-outline' : 'circle'} size={20} color="#3764de" />
      </Pressable>
      {/* Orange Button */}
      <Pressable
        onPress={() => {currentDrawingColor = FEATURE_ORANGE; setDrawingColor(FEATURE_ORANGE)}}
        hitSlop={8}
      >
        <MaterialCommunityIcons name={drawingColor !== FEATURE_ORANGE ? 'circle-outline' : 'circle'} size={20} color="#de8537" />
      </Pressable>

      {/* Edit grid size buttons */}
      <Pressable
        onPress={() => {grid.resize(grid.width + 2, grid.height); house.resizeFloorFeature()}}>
        <MaterialCommunityIcons name='arrow-right' color="#abcd" />
      </Pressable>

      <Pressable
        onPress={() => {grid.resize(grid.width, grid.height + 2); house.resizeFloorFeature()}}>
        <MaterialCommunityIcons name='arrow-up' color="#abcd" />
      </Pressable>

      <Pressable
        onPress={() => {grid.resize(grid.width - 2, grid.height); house.resizeFloorFeature()}}>
        <MaterialCommunityIcons name='arrow-left' color="#abcd" />
      </Pressable>

      <Pressable
        onPress={() => {grid.resize(grid.width, grid.height - 2); house.resizeFloorFeature()}}>
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
            selectedEditFeature = null; // should handle updating selectedFeature through callbacks
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
            <Card.Title title={selectedFeature.feature_name}/>
            <Card.Actions>
              <Button onPress={() => {house.moveSelectedFeatureByOne(MoveDirection.POS_X)}}><MaterialCommunityIcons name='arrow-left'/></Button>
              <Button onPress={() => {house.moveSelectedFeatureByOne(MoveDirection.NEG_X)}}><MaterialCommunityIcons name='arrow-right'/></Button>
              <Button onPress={() => {house.moveSelectedFeatureByOne(MoveDirection.POS_Z)}}><MaterialCommunityIcons name='arrow-up'/></Button>
              <Button onPress={() => {house.moveSelectedFeatureByOne(MoveDirection.NEG_Z)}}><MaterialCommunityIcons name='arrow-down'/></Button>
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
  // On component unmount, cancel our rendering loop
  useEffect(() => {
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    }
  }, []);

  // Get dims of entire screen
  windowWidth = useWindowDimensions().width; 
  windowHeight = useWindowDimensions().height;
  return (
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
  );
}

// ***********************************************************
//                      Renderer
// ***********************************************************

let glRef: ExpoWebGLRenderingContext | null = null; // A global way to access the single WebGL context created on launch
let shaderProgram: WebGLProgram | null = null; // The currently used GPU shader program
let bbShaderProgram: WebGLProgram | null = null; // The shader program for billboards
let lastFrameTime = 0; // The time since the last frame
let oesExt: OES_vertex_array_object | null = null; // A global way to access the OES extension for WebGL 1.0 support
let frameId: number | null = null; // the id of the current frame being drawn
let cam = new Camera(); // Our global camera value
let currentDrawingColor = FEATURE_ORANGE;
let house = new RenderableHousehold("default_1"); // Create a global household object
let selectedEditFeature: RenderableFeature | null = null; // The current feature being edited in the edit window
let grid = new Grid(); // Store a global grid object

// ***********************************************************
//                      Renderer Init
// ***********************************************************

// This is the function called to create the WebGL context, setup extensions if needed, read and compile shaders, and do all
// other prep work which is neccessary to initialize our renderer. 
async function onContextCreate(gl: ExpoWebGLRenderingContext) {
  // Read the text of the shader files. We later pass shader data as a string, so we need the actual shader files in a 
  // string representation for later use. We still split them into their own files though because it's easier to manage.
  const [vertData, fragData, bbVertData, bbFragData] = await readShaderData();

  // Get the OES Vertex Array Object extension
  // This is needed because these VAOs provide very useful functionality (we don't have to define vertex array attributes
  // every frame). However, since we need to support WebGL 1.0 (for older Raspberry Pis), we need to pull this in as an extension
  // as this functionality is only native in WebGL 2.0. To make things more annoying, often this functionality is NOT available in WebGL 2.0 
  // contexts. So, it's stupid, but we have to support both. This getExtension(...) call will either return an object or null.
  oesExt = gl.getExtension('OES_vertex_array_object'); 

  // Reset everything so it works when navigating back to this page. Descriptions are above.
  glRef = gl;
  lastFrameTime = 0;
  shaderProgram = null; // I don't think this causes a memory leak as Expo should clean up resources on unmount
  bbShaderProgram = null;
  house = new RenderableHousehold("default_2");
  cam = new Camera();
  grid = new Grid();

  // Rebuild the grid if we're missing it
  if (!grid) {
    console.error("No grid!");
  }

  // See expo documentation here: https://docs.expo.dev/versions/latest/sdk/gl-view/#usage
  // See also: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Adding_2D_content_to_a_WebGL_context 
  // Also see: https://learnopengl.com 

  // Setup initial parameters
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); // The size of the rendered context on the screen
  gl.clearColor(0.0, 0.0, 0.0, 1); // The background color 
  gl.enable(gl.DEPTH_TEST); // Allow objects with further depth to be obscured by other objects
  gl.depthFunc(gl.LEQUAL); // Specify which method to use to compare depth (less than or equal)

  // Create vertex shader (shape & position). On error, clear resources, output an error, and quit
  const vert: WebGLShader | null = gl.createShader(gl.VERTEX_SHADER);
  if (vert === null) {
    console.error("Error creating vertex shader.");
    gl.deleteShader(vert);
    return;
  } 
  gl.shaderSource(vert, vertData); // Set the shader source code accordingly
  gl.compileShader(vert); // Compile that shader written in GLSL

  // Create fragment shader (color). On error, clear resources, output an error, and quit
  const frag: WebGLShader | null = gl.createShader(gl.FRAGMENT_SHADER);
  if (frag === null) {
    console.error("Error creating fragment shader.");
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return;
  } 
  gl.shaderSource(frag, fragData); // Set shader source code to the text read earlier
  gl.compileShader(frag); // Compile the GLSL shader

  // Create billboard vertex shader (healthbars). On error, clear resources, output an error, and quit
  const bbVert: WebGLShader | null = gl.createShader(gl.VERTEX_SHADER);
  if (bbVert === null) {
    console.error("Error creating billboard vertex shader.");
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    gl.deleteShader(bbVert);
    return;
  } 
  gl.shaderSource(bbVert, bbVertData); // Set shader source code to the text read earlier
  gl.compileShader(bbVert); // Compile the GLSL shader

  // Create billboard fragment shader (healthbars). On error, clear resources, output an error, and quit
  const bbFrag: WebGLShader | null = gl.createShader(gl.FRAGMENT_SHADER);
  if (bbFrag === null) {
    console.error("Error creating billboard fragment shader.");
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    gl.deleteShader(bbVert);
    gl.deleteShader(bbFrag);
    return;
  } 
  gl.shaderSource(bbFrag, bbFragData); // Set shader source code to the text read earlier
  gl.compileShader(bbFrag); // Compile the GLSL shader

  // Ensure shaders are compiled correctly. Output an error if they aren't with relevant shader info, clear resources, and return. 
  if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
    console.error("Shaders failed to compile - ", gl.getShaderInfoLog(vert), " - AND - ", gl.getShaderInfoLog(frag), " - AND - ", gl.getShaderInfoLog(bbVert), " - AND - ", gl.getShaderInfoLog(bbFrag));
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    gl.deleteShader(bbVert);
    gl.deleteShader(bbFrag);
    return;
  }

  // Link shaders together into a program. A shader program tells the GPU which order of shaders to run to fill the graphics pipeline. 
  // At a minimum, we need a vertex and fragment shader. Vertex shaders handle and transform vertex data, fragment shaders handle 
  // the individual "fragments" created after rasterization where lines are transformed into actual pixels. We could switch to a different 
  // program or modify this one if we wanted to use different shaders. 
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  shaderProgram = program;

  // Now, we create a shader program for the healthbars (bb is short for billboard)
  const bbProgram = gl.createProgram();
  gl.attachShader(bbProgram, bbVert);
  gl.attachShader(bbProgram, bbFrag);
  gl.linkProgram(bbProgram);
  bbShaderProgram = bbProgram;

  // Clean up resources
  gl.detachShader(program, vert);
  gl.detachShader(program, frag);
  gl.detachShader(bbProgram, bbVert);
  gl.detachShader(bbProgram, bbFrag);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  gl.deleteShader(bbVert);
  gl.deleteShader(bbFrag);

  // Get attribute and uniform location information for the shader program. Essentially, this is get references to location information
  // so we can upload data to the GPU for shaders to use. Here, we deal with both attributes and uniforms. Uniforms are variables that are the same
  // for all instances of the shader being run (as shaders are run in parallel) although they may change frame to frame. Attributes are pieces
  // of data that are usually given in vertex data. For example, above with our cubes we provide both position and normal data. Position would
  // be one attribute, normals would be another. 
  const attribLocs = {
    // We need to figure out where these attributes are being stored on the GPU.
    vertLoc: gl.getAttribLocation(shaderProgram, "aVertPos"),
    normalLoc: gl.getAttribLocation(shaderProgram, "aNormal")
  }
  const matrixUniformLocs = {
    // We use three matrices to transform a model's unique position in the world into a 
    // projected value on the screen. 
    modelMatrix: gl.getUniformLocation(shaderProgram, "uModel"),
    viewMatrix: gl.getUniformLocation(shaderProgram, "uView"),
    projectionMatrix: gl.getUniformLocation(shaderProgram, "uProjection")
  }
  const lightUniformLocs = {
    // These are used in lighting calculations. We'll use a slightly modified phong lighting model 
    // where we cut out the specular for performance (although we may add it back in later. We'll keep
    // support for it even though it's unused). This is meant to emulate a "material" as you often see in 
    // different game engines. 
    viewPosition: gl.getUniformLocation(shaderProgram, "uViewPos"),
    material: {
      ambient: gl.getUniformLocation(shaderProgram, "uMaterial.ambient"),
      diffuse: gl.getUniformLocation(shaderProgram, "uMaterial.diffuse"), 
      specular: gl.getUniformLocation(shaderProgram, "uMaterial.specular"),
      shininess: gl.getUniformLocation(shaderProgram, "uMaterial.shininess")
    },
    light: {
      position: gl.getUniformLocation(shaderProgram, "uLight.position"),
      ambient: gl.getUniformLocation(shaderProgram, "uLight.ambient"),
      diffuse: gl.getUniformLocation(shaderProgram, "uLight.diffuse"),
      specular: gl.getUniformLocation(shaderProgram, "uLight.specular"),
    }
  }

  // Save the location information for the model matrix (that details transform information for each cube)
  house.modelLoc = matrixUniformLocs.modelMatrix; // We'll change this pretty frequently since we'll likely update it each frame.
  house.ambientLoc = lightUniformLocs.material.ambient;
  house.diffuseLoc = lightUniformLocs.material.diffuse;
  house.specularLoc = lightUniformLocs.material.specular;
  house.shininessLoc = lightUniformLocs.material.shininess;

  // Save camera locations
  cam.viewLoc = matrixUniformLocs.viewMatrix;
  cam.projectionLoc = matrixUniformLocs.projectionMatrix;

  // Now for the billboard program
  const bbLocs = {
    pos: gl.getAttribLocation(bbShaderProgram, "aVertPos"),
    model: gl.getUniformLocation(bbShaderProgram, "uModel"),
    view: gl.getUniformLocation(bbShaderProgram, "uView"),
    inverseView: gl.getUniformLocation(bbShaderProgram, "uInverseView"),
    projection: gl.getUniformLocation(bbShaderProgram, "uProjection"),
    heightOffset: gl.getUniformLocation(bbShaderProgram, "uHeightOffset"),
    healthPercent: gl.getUniformLocation(bbShaderProgram, "uHealthPercent"),
  }
  // Now save billboard values
  house.bbModelLoc = bbLocs.model;
  cam.bbViewLoc = bbLocs.view;
  cam.bbProjectionLoc = bbLocs.projection;
  cam.bbInverseViewLoc = bbLocs.inverseView;
  house.bbHeightOffsetLoc = bbLocs.heightOffset;
  house.bbHealthPercentLoc = bbLocs.healthPercent;

  // Setup our vertex buffer and attribute informations. This is how we know what information is stored where. 
  // Attributes are explained above. Basically, we send our vertex data to the GPU by storing it in a buffer. We also have to tell
  // the GPU how to interpret this data, as each vertex might contain different sets of data. For our cube, we store, for each vertex, 
  // 3 floats of position data and 3 floats of normal data. So, we set this attribute information and ultimately store it all in a Vertex Array
  // Object or VAO. This VAO allows us to easily load in our settings for the cube and switch out for a different configuration when we want to 
  // render the grid. 
  house.buffer = gl.createBuffer();
  house.vao = createVAO();
  bindVAO(house.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, house.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, house.blockVertices, gl.STATIC_DRAW);
  gl.vertexAttribPointer(attribLocs.vertLoc, 3, gl.FLOAT, false, 6 * 4, 0); // 4 bytes per float * 6 floats stored per vertex = 24 bytes per vertex
  gl.enableVertexAttribArray(attribLocs.vertLoc);
  gl.vertexAttribPointer(attribLocs.normalLoc, 3, gl.FLOAT, false, 6 * 4, 4 * 3); // 4 bytes per float * 3 floats before we get to our first set of normal data
  gl.enableVertexAttribArray(attribLocs.normalLoc);  
  bindVAO(null);

  // Do the same for billboards
  house.bbBuffer = gl.createBuffer();
  house.bbVao = createVAO();
  bindVAO(house.bbVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, house.bbBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, house.bbVertices, gl.STATIC_DRAW);
  gl.vertexAttribPointer(bbLocs.pos, 3, gl.FLOAT, false, 3 * 4, 0);
  gl.enableVertexAttribArray(bbLocs.pos);
  bindVAO(null);

  // Do the same as above, but for the grid vertices. Note that we disable the normal attribute and default it to (0, 1, 0) always since we don't 
  // store normal data with our vertices. We'll wrap this up in another VAO for ease of use. Skip this is we have no grid vertices
  if (grid !== null && grid.gridVertices !== null) {
    const gridBuffer = gl.createBuffer();
    const gridVao = createVAO();
    bindVAO(gridVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, grid.gridVertices, gl.STATIC_DRAW); 
    gl.vertexAttribPointer(attribLocs.vertLoc, 3, gl.FLOAT, false, 3 * 4, 0);
    gl.enableVertexAttribArray(attribLocs.vertLoc);
    gl.disableVertexAttribArray(attribLocs.normalLoc);
    gl.vertexAttrib3f(attribLocs.normalLoc, 0, 1, 0);

    // Set these afterwards for safety in case there's anything funky going on with the grid object
    grid.vao = gridVao;
    grid.buffer = gridBuffer;
    bindVAO(null);
  } else {
    console.log("Skipping grid configuration.");
  }

  // Select our shader program to use. We must always have an active shader program.
  gl.useProgram(shaderProgram);

  // Set up our perspective matrix
  GLM.mat4.perspective(cam.projectionMatrix, (45 * Math.PI / 180), gl.drawingBufferWidth / gl.drawingBufferHeight, NEAR_CLIP, FAR_CLIP);
  gl.uniformMatrix4fv(matrixUniformLocs.projectionMatrix, false, cam.projectionMatrix as Float32Array);

  // Move the camera up, back, and turn it a little to the origin
  GLM.mat4.rotateX(cam.viewMatrix, cam.viewMatrix, 40 * Math.PI / 180);
  GLM.mat4.translate(cam.viewMatrix, cam.viewMatrix, [0.0, -8.0, -11.0]);
  gl.uniformMatrix4fv(matrixUniformLocs.viewMatrix, false, cam.viewMatrix as Float32Array);

  // Setup lighting data. We'll just use placeholder values for now. Ambient simulates the basic lighting that just "exists", 
  // diffuse simulates lighting the bounces around and hits items and originates at a point, and specular I think of as just the 
  // shiny reflection of very pointed light. It's the "bright spots" that appear when light is reflected strongly in one direction 
  // towards you. Diffuse is scattered light, specular is not. Shiniess is just a material value. See https://learnopengl.com/Lighting/Basic-Lighting. 
  // We have no need to set the materials here though since they are determined on a per-object basis
  gl.uniform3fv(lightUniformLocs.viewPosition, [0, 0, 0]);
  gl.uniform3fv(lightUniformLocs.light.position, [0.0, 6.0, 3.0]);
  gl.uniform3fv(lightUniformLocs.light.ambient, [0.4, 0.4, 0.4]);
  gl.uniform3fv(lightUniformLocs.light.diffuse, [0.9, 0.9, 0.9]);
  gl.uniform3fv(lightUniformLocs.light.specular, [1.0, 1.0, 1.0]);

  // Start drawing frames. This is a recursive animation function
  drawFrame(lastFrameTime);
  console.log("Context initialized.");
}

// ***********************************************************
//                      Render Loop
// ***********************************************************
// This is the function that will be called every frame to draw a frame on in the WebGL context

const inverseView = GLM.mat4.create(); // store our inverse view matrix here to avoid re-creation every frame
const scale = GLM.vec3.create(); // store the current scale of our view matrix
function drawFrame(time: number) {
    // Ensure we have an OpenGL context, if not error and return
    if (!glRef) {
      console.error("Frame drawn without a WebGL context");
      return;
    }
    const gl = glRef; // Set a clearer reference to our WebGL context

    // Ensure we have a valid shader program, if not error and return
    if (!shaderProgram) {
      console.error("Frame drawn without a shader program");
      return;
    }

    // Ensure we have a billboard shader program
    if (!bbShaderProgram) {
      console.error("Frame drawn without a billboard shader program");
      return;
    }

    // Ensure we have a valid location for the model matrix uniform, if not error and return
    if (!house.modelLoc) {
      console.error("No model matrix location");
      return;
    }

    // Ensure valid material uniform locations
    if (!house.ambientLoc || !house.diffuseLoc || !house.specularLoc || !house.shininessLoc) {
      console.error("No material uniform locations.");
      return;
    }

    // Ensure we have a proper house buffer, if not error and return
    if (!house.buffer) {
      console.error("Invalid buffers.");
      return;
    }

    // Ensure we have a proper house vertex array object (VAO), if not error and return
    if (!house.vao) {
      console.error("Invalid VAO.");
      return;
    }

    // Ensure we have a proper camera view matrix location
    if (!cam.viewLoc) {
      console.error("Invalid camera view uniform.");
      return;
    }

    // Ensure billboard locations
    if (!house.bbBuffer || !house.bbModelLoc || !house.bbVao || !cam.bbInverseViewLoc || !cam.bbProjectionLoc || !cam.bbViewLoc || !house.bbHeightOffsetLoc || !house.bbHealthPercentLoc) {
      console.error("Invalid billboard data.");
      return;
    }

    // Check time and update frame time to get a delta for animation
    const delta = (time - lastFrameTime) / 1000;
    lastFrameTime = time;

    // Prepare draw by clearing the screen and depth buffer
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // For the cube draw calls, we need to switch to the correct vertex at  tribute and buffer configuration. 
    // This also updates our view matrix so we can rotate the world around
    gl.useProgram(shaderProgram); // use the household shader program
    bindVAO(house.vao);

    // Scale view matrix (thus scaling the world)
    // Get the current scale
    GLM.mat4.getScaling(scale, cam.viewMatrix);
    // Make sure we have high enough velocity to zoom, so we don't annoyingly pan when want to zoom
    if (Math.abs(panVelocityY) > 1.0) {
      // scale according to y pan and y drag direction
      // scale up = scaleAmt > 1
      // scale down = scale amt < 1
      const scaleAmt = panYDir < 0 ? 1 + panVelocityY * delta : 1 + panVelocityY * delta;

      // Check if the proposed scale is valid (since we evenly scale, we only need to do this for the first component)
      const testScale = scaleAmt * scale[0];
      if (testScale > MIN_WORLD_SCALE && testScale < MAX_WORLD_SCALE) {
        // we have a valid scale
        GLM.mat4.scale(cam.viewMatrix, cam.viewMatrix, [scaleAmt, scaleAmt, scaleAmt]);
      } 
    }
    
    GLM.mat4.rotateY(cam.viewMatrix, cam.viewMatrix, panVelocityX * delta); // Rotate the world according to the frame delta for smooth movement
    gl.uniformMatrix4fv(cam.viewLoc, false, cam.viewMatrix as Float32Array); // Upload this new model matrix for drawing

    // Figure out which walls to hide - walls will be features[1-4]
    // we need to figure out which walls have vectors pointing towards the camera
    for (let i = 1; i <= 4; i++) {
      // we add walls in the order left (-x), right (+x) back (+z), front (-z)

      // Get the normal pointing away from the origin for each wall
      let sideVec = GLM.vec3.create();
      switch(i) {
        case 1:
          sideVec = GLM.vec3.fromValues(1, 0, 0); 
          break;
        case 2:
          sideVec = GLM.vec3.fromValues(-1, 0, 0);
          break;
        case 3:
          sideVec = GLM.vec3.fromValues(0, 0, 1);
          break;
        case 4:
          sideVec = GLM.vec3.fromValues(0, 0, -1);
          break;
        }

        // Calculate the camera forward vector from the view matrix
        const cameraFwdVec = GLM.vec3.fromValues(
          // camera forward is the third column in the view matrix
          cam.viewMatrix[2], cam.viewMatrix[6], cam.viewMatrix[10]
        );

        // Check if the normal is facing more away from the camera or to the camera and set visibility accordingly
        const dot = GLM.vec3.dot(sideVec, cameraFwdVec);
        house.renderableFeatures[i].visible = dot > 0.1;
    }

    // Iterate through all cubes making up our model and draw them each
    for (let i = 0; i < house.renderableFeatures.length; i++) {
      if (!house.renderableFeatures[i].visible) {
        // Skip invisible features
        continue;
      }
      gl.uniformMatrix4fv(house.modelLoc, false, house.renderableFeatures[i].modelMatrix as Float32Array); // upload the correct model matrix for drawing
      gl.uniform3fv(house.ambientLoc, house.renderableFeatures[i].material.ambient); // update lighting uniform values for the material of the object
      gl.uniform3fv(house.diffuseLoc, house.renderableFeatures[i].material.diffuse);
      gl.uniform3fv(house.specularLoc, house.renderableFeatures[i].material.specular);
      gl.uniform1f(house.shininessLoc, house.renderableFeatures[i].material.shininess);
      gl.drawArrays(gl.TRIANGLES, 0, 36); // One draw call to the GPU. Our cube has 6 faces, and each face has two triangles, which yiels 6 faces * 6 vertices for 36 vertices to draw.
    }

    // Draw the grid. Use our grid vertex configuration, upload the grid's model matrix to the vertex shader, and then draw a line. Each line has two vertices. 
    // Only draw if we have a proper grid setup
    if (grid !== null && grid.vao !== null && grid.buffer !== null && grid.gridVertices !== null) {
      bindVAO(grid.vao);
      gl.uniformMatrix4fv(house.modelLoc, false, grid.modelMatrx as Float32Array);
      gl.uniform3fv(house.ambientLoc, grid.material.ambient); // update lighting uniform values for the material of the object
      gl.uniform3fv(house.diffuseLoc, grid.material.diffuse);
      gl.uniform3fv(house.specularLoc, grid.material.specular);
      gl.uniform1f(house.shininessLoc, grid.material.shininess);
      gl.drawArrays(gl.LINES, 0, 2 * (grid.width + grid.height + 2)); // Lines are 1 pixel thick by default. Two vertices per line. Two more lines to close the grid.
    }

    // Now, draw all the healthbars if we can calculate the correct inverse view matrix to position them (I think we always can)
    const inverseResult = GLM.mat4.invert(inverseView, cam.viewMatrix);
    if (!inverseResult) {
      console.error("Unable to calculate inverse view matrix.");
    } else {
      // Begin the new shader program specific to billboards
      gl.useProgram(bbShaderProgram);
      gl.disable(gl.DEPTH_TEST); // so the healthbars get drawn on top of everything else
      bindVAO(house.bbVao);
      // Set camera uniforms. We need the inverse view matrix to easily get camera vectors for the billboards. We can calculate this once per frame since it stays the same
      // instead of calculating a ton of times in the vertex shader
      gl.uniformMatrix4fv(cam.bbProjectionLoc, false, cam.projectionMatrix as Float32Array);
      gl.uniformMatrix4fv(cam.bbViewLoc, false, cam.viewMatrix as Float32Array);
      gl.uniformMatrix4fv(cam.bbInverseViewLoc, false, inverseView as Float32Array);
      // Now iterate through
      for (let i = 0; i < house.renderableFeatures.length; i++) {
        // Get the feature position
        gl.uniformMatrix4fv(house.bbModelLoc, false, house.renderableFeatures[i].modelMatrix as Float32Array);
        for (let j = 0; j < house.renderableFeatures[i].tasks.length; j++) {
          gl.uniform1f(house.bbHeightOffsetLoc, 0.8 + (j + 1) * 0.4); // Add an offset per chore bar
          gl.uniform1f(house.bbHealthPercentLoc, house.renderableFeatures[i].tasks[j].getAndSetHealthPercent()); // Update the current decay value
          gl.drawArrays(gl.TRIANGLES, 0, 6); // draw 6 vertices = 2 triangles = 1 quad
        }
      }
      gl.enable(gl.DEPTH_TEST); // return to normal
    }

    // End frame and then request a new animation frame with this same method (recursive)
    gl.endFrameEXP();
    frameId = window.requestAnimationFrame(drawFrame);
}