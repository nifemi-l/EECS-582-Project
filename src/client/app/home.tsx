/* PROLOGUE
File name: home.tsx
Description: Provide a home page with a WebGL context for graphical rendering
Programmer: Jack Bauer
Creation date: 2/15/26
Revision date: 
  - 2/15/26: Move graphical context and related code from index.tsx to here. Add comments. 
  - 2/23/26: Add a grid on the xz-axis, the ability to pan and tap, and convert taps from screen to world coordinates
Preconditions: A React application asking for the home page
Postconditions: A home page component ready for rendering
Errors: The home page will always be delivered successfully. 
Side effects: None
Invariants: None
Known faults: None
*/

// Import required components
import React from 'react';
import { Asset } from 'expo-asset';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import * as GLM from 'gl-matrix';
import { LayoutChangeEvent, Platform, Pressable, View, useWindowDimensions } from "react-native";
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Define the near and far clips for the projection matrix
const NEAR_CLIP = 0.1;
const FAR_CLIP = 100.0;

// See https://docs.swmansion.com/react-native-gesture-handler/docs/gestures/use-pan-gesture for gesture handler details
// Also define global variables to store this data and update each frame
let panVelocityX = 0;
let panLastX = 0 
let panVelocityY = 0;
let panLastY = 0 

// A helper function to update the velocity of the pan. We multiply the delta by a constant speed value
function updateVelocityPan(dx: number, dy: number) {
  panVelocityX = dx * 0.5;
  panVelocityY = dy * 0.5;
}

// Define gesture handler function for panning and rotating the model
const handlePan = Gesture.Pan()
  .runOnJS(true) // Run all gesture handling on the main JS thread. Note: for performance reasons we could change this so it runs on the UI thread in the future
  
  // Reset values on the start of a gesture
  .onStart(() => {
    panLastX = 0;
    panLastY = 0;
  })

  // Handle gesture updates and calculate the difference between frames, then update the velocity
  .onUpdate((event) => {
    const deltaX = event.translationX - panLastX;
    panLastX = event.translationX;

    const deltaY = event.translationY - panLastY;
    panLastY = event.translationY;

    updateVelocityPan(deltaX, deltaY);
  })

  // When we let go of the drag, we no longer want to rotate so we set the rotation value to 0
  .onEnd(() => {
    updateVelocityPan(0, 0);
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
        // Add the matrix to House
        addBlock(tappedCell[0], 0, tappedCell[1]);
      }
    }
  })

// Select a random material from the materials list
function selectRandomMaterial() {
  const index = Math.floor(Math.random() * FEATURE_COLORS.length)
  return FEATURE_COLORS[index];
}

// A function to add a block to the household at a certain position
function addBlock(cellX: number, cellY: number, cellZ: number) {
  const newModelMatrix = GLM.mat4.create(); // create a new transform 
  GLM.mat4.translate(newModelMatrix, newModelMatrix, [cellX + 0.5, cellY + 0.5, cellZ + 0.5]); // The 0.5s account for the difference between the cell center and edges
  const newMaterial: Material = currentDrawingColor;
  const newFeature = new Feature(newModelMatrix, newMaterial); // this is the new feature object we're adding
  house.features.push(newFeature); // add the feature to the house
}

// A helper function to retrieve the cell that was clicked from a given position on the xz plane
function cellFromCoords(x: number, z: number) {
  // The grid is designed so that each line marks the end of one cell from the origin. 
  // In other words, 0 is at 0, one is after 1 unit, 2 is after 2 units, etc. So, to find the cell we're in we perform a floor.
  // It's worth mentioning though that this creates an imbalance between the number of negative and positive cells. Positive
  // will index at 0, negative at -1. This means that the origin cell (at 0,0) is the cell from 0 to 1 on both the x and z axes
  // which might not be ideal. 
  return [Math.floor(x), Math.floor(z)];
}

// A function to convert screen clicks / taps from screen coordinates to world coordinates in the renderer
function screenToWorldCoords(screenX: number, screenY: number) {
  // Ensure we have a valid context
  if (!glRef || !cam.projectionMatrix || !cam.viewMatrix) {
    console.error("Unable to convert coordinates without WebGL context.");
    return null;
  }

  // Ensure we have valid dimensions. Window size is the size of the entire window, 
  // view size is the specific size of the React view wrapping the GLView. In other words, this is 
  // the size of the drawing canvas.
  if (viewWidth == 0 || viewHeight === 0 || windowWidth === 0 || windowHeight === 0) {
    console.error("No width or height defined.");
    return null;
  }

  // normalize screen coordinates to normalized device coordinates [-1, 1]
  // convert screen coords to clip space. Centered at 0,0,0. 
  // Top left: (-1, 1, ~). Bottom right: (1, -1, ~) in NDC
  // Top left: (0, 0), bottom right (max, max) in Screen Coordinates.
  // After dividing screen by max, we get [0, 1] as our screen coord range
  const normX = 2.0 * (screenX / viewWidth) - 1.0;
  const normY = 1.0 - 2.0 * ((screenY - (windowHeight - viewHeight)) / viewHeight); // top left is 0,0 in screen coords. WebGL uses a +Y up convention, whereas screenX and Y increase as Y decreases

  // get our projection * view matrix. We will then invert this to get our unprojection matrix.
  // The unprojection matrix is what we can use to "undo" the projection * view process done in our shaders to convert the world to screen position.
  // We just invert that "view-projection" matrix. Here, we want to go screen to world, hence "unproject".
  const viewProjMatrix = GLM.mat4.create();
  GLM.mat4.multiply(viewProjMatrix, cam.projectionMatrix, cam.viewMatrix);
  const unprojectionMatrix = GLM.mat4.create();
  const unprojectionMatrixResult = GLM.mat4.invert(unprojectionMatrix, viewProjMatrix);
  if (!unprojectionMatrixResult) {
    console.error("Unable to calculate the inverse of the view projection matrix.");
    return null;
  }

  // Since we clicked a point in 2D space, our result in 3D space is a line. We need to perform a raycast and see what this line intersects with.
  // We'll define the z bounds of this line as the near and far planes of the NDC space (which is actually defined in 3D). 
  // See: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_model_view_projection 
  // In NDC, the Z coordinate is between -1 and 1, with -1 being the direction that the camera is looking. 
  const front = GLM.vec4.fromValues(normX, normY, -1, 1);
  const back = GLM.vec4.fromValues(normX, normY, 1, 1); 

  // We now multiply the screen position by the unprojection matrix to get world coordinates for both the front and back points.
  GLM.vec4.transformMat4(front, front, unprojectionMatrix);
  GLM.vec4.transformMat4(back, back, unprojectionMatrix);

  // Now, we divide by the perspective (w) component to convert from homgenous coordinates (which use a w component to simulate depth) to cartesian coordinates
  front[0] /= front[3];
  front[1] /= front[3];
  front[2] /= front[3];
  back[0] /= back[3];
  back[1] /= back[3];
  back[2] /= back[3];

  // Next, find where the ray intersects with the y=0 plane
  // parametric equation of a 3D line:
  // x = x0 + at
  // y = y0 + bt
  // z = z0 + ct
  // <a, b, c> is the direction vector calculated from <x1 - x0, y1 - y0, z1 - z0>. 
  // Since we want to find the intersection with the xz plane (y=0) we can calculate as follows:
  // 0 = y0 + bt --> -y0/b = t
  // z = z0 + c * (-y0 / b)
  // x = x0 + a * (-y0 / b)
  // This will give us our intersection point (x, 0, z) in world space. 
  // Additionally, if b is 0 we cannot calculate a solution and must fail.
  // We'll treat front as position 0 and back as position 1 since front is usually smaller
  const dir = GLM.vec3.fromValues(back[0] - front[0], back[1] - front[1], back[2] - front[2]);
  if (Math.abs(dir[1]) <= 0.000001) { // check against a very small value to handle floating point error
    console.log("Failing, unable to calculate a ray.")
    return null;
  }  
  const t = -1.0 * front[1] / dir[1];
  const finalPos = GLM.vec3.fromValues(front[0] + dir[0] * t, 0, front[2] + dir[2] * t);

  return finalPos;
}

// store screen dimensios. Window is the entire window, view is the view component that wraps the GL context
let viewWidth = 0;
let viewHeight = 0;
let windowHeight = 0;
let windowWidth = 0;

// Set width and height of view on layout change
function handleLayout(event: LayoutChangeEvent) {
  viewWidth = event.nativeEvent.layout.width;
  viewHeight = event.nativeEvent.layout.height;
}

// Use a composed gesture to allow for both pan and tap gestures. It is exclusive in that we can't use them both
const composedGesture = Gesture.Exclusive(handlePan, handleTap);

// Outline the layout of the main page. The GLView component will provide our WebGL context for graphics, the ViewToggle
// will allow a switch between the 3D rendered graphical view and the list view of the house model, and the View structures 
// the page. Also uses a container to grab user gestures (e.g. rotating on the screen or panning or screen taps (clicks))
export default function Index() {
  // Get dims of entire screen
  windowWidth = useWindowDimensions().width; 
  windowHeight = useWindowDimensions().height;
  return (
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

      {/* Buttons for selecting type */}
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
          onPress={() => {currentDrawingColor = FEATURE_RED}}
          hitSlop={8}
        >
          <MaterialCommunityIcons name='circle-outline' size={20} color="#de3737"/>
        </Pressable>
        {/* Green Button */}
        <Pressable
          onPress={() => {currentDrawingColor = FEATURE_GREEN}}
          hitSlop={8}
        >
          <MaterialCommunityIcons name='circle-outline' size={20} color="#53de37"/>
        </Pressable>
        {/* Blue Button */}
        <Pressable
          onPress={() => {currentDrawingColor = FEATURE_BLUE}}
          hitSlop={8}
        >
          <MaterialCommunityIcons name='circle-outline' size={20} color="#3764de" />
        </Pressable>
        {/* Orange Button */}
        <Pressable
          onPress={() => {currentDrawingColor = FEATURE_ORANGE}}
          hitSlop={8}
        >
          <MaterialCommunityIcons name='circle-outline' size={20} color="#de8537"/>
        </Pressable>
      </View>
    </View>
  );
}

let glRef: ExpoWebGLRenderingContext | null = null; // A global way to access the single WebGL context created on launch
let shaderProgram: WebGLProgram | null = null; // The currently used GPU shader program
let lastFrameTime = 0; // The time since the last frame
let oesExt: OES_vertex_array_object | null = null; // A global way to access the OES extension for WebGL 1.0 support

// A class to represent the camera object. This manages the world view matrix
class Camera {
  viewMatrix: GLM.mat4; // The view matrix used to setup the projection
  viewLoc: WebGLUniformLocation | null; // The location to access and provide the view matrix data for the shaders to use
  projectionMatrix: GLM.mat4;
  projectionLoc: WebGLUniformLocation | null; // same as above but for the projection matrix

  // Constructor. Initialize the viewLocation to null since we have no gl context yet, and create an identity view matrix
  constructor() {
    this.viewMatrix = GLM.mat4.create();
    this.viewLoc = null;
    this.projectionLoc = null;

    // We'll use a 3 matrix system. All model data is originally input with respect for its own space as the transform. That is, all model data
    // assumes its position origin is at 0. Obviously, when rendering multiple objects in different locations this isn't the case. 
    // We then define a "model matrix" to store the transform data for each object relevant to its world. Then, we use a "view matrix" to shift all 
    // world data around depending on how the camera is looking at the world (e.g. if the camera should move left, the world actually moves right).
    // Finally, we store a projection matrix to transform this view space coordinate data into a perspective view for the screen. Here, we create 
    // our projection and view matrix. We create our perspective matrix with a FOV of 45, aspect ratio of the WebGL context, a near clip of 0.1 and far of 100. 
    // Then, we upload this matrix data as uniform data for use in our vertex shader as an array of values. 
    // we'll actually set this projection matrix up during initialization
    this.projectionMatrix = GLM.mat4.create();
  }
}
let cam = new Camera(); // Our global camera value

// Define the structure of what a material should have. We follow the phong lighting model. 
// Values for all numbers but shininess should be in [0, 1]
interface Material {
  ambient: [number, number, number];
  diffuse: [number, number, number];
  specular: [number, number, number];
  shininess: number;
}

// Define a series of colors
const FEATURE_RED: Material = {
  ambient: [0.3, 0.0, 0.0],
  diffuse: [1.0, 0.0, 0.0],
  specular: [0.5, 0.5, 0.5],
  shininess: 32.0,
}

const FEATURE_BLUE: Material = {
  ambient: [0.0, 0.0, 0.3],
  diffuse: [0.0, 0.0, 1.0],
  specular: [0.5, 0.5, 0.5],
  shininess: 32.0,
}

const FEATURE_GREEN: Material = {
  ambient: [0.0, 0.3, 0.0],
  diffuse: [0.0, 1.0, 0.0],
  specular: [0.5, 0.5, 0.5],
  shininess: 32.0,
}

const FEATURE_ORANGE: Material = {
  ambient: [0.31, 0.31, 0.31],
  diffuse: [1.0, 1.0, 1.0],
  specular: [0.5, 0.5, 0.5],
  shininess: 32.0,
}

// We will pick from this array of colors
const FEATURE_COLORS = [FEATURE_RED, FEATURE_BLUE, FEATURE_GREEN, FEATURE_ORANGE]
let currentDrawingColor = FEATURE_ORANGE;

// Define what one of our cleanable features should have
class Feature {
   modelMatrix: GLM.mat4;
   material: Material;

   constructor(mm: GLM.mat4 | null, mat: Material | null) {
    // Assign model matrix to either a provided value or a default
    if (!mm) {
      this.modelMatrix = GLM.mat4.create();
    } else {
      this.modelMatrix = mm;
    }

    // Do the same for the material (basically what should the object look like color-wise).
    if (!mat) {
      this.material = FEATURE_ORANGE;
    } else {
      this.material = mat;
    }
   }
}

// This is the household class. It is meant to be the primary way to store and access the currently rendered house model
class Household {
   // A series of relevant variables to render the household on the screen.
   blockVertices: Float32Array; // The vertices that make up a cube (including the normals of each face)
   features: Feature[]; // The list of feature objects in our household
   buffer: WebGLBuffer | null; // A way to access the buffer storing cube vertex data on the GPU
   vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null; // A single object to store the vertex attribute data and which buffer to bind for the household
   modelLoc: WebGLUniformLocation | null; // The location to access and provide the model matrix data for the shaders to use
   ambientLoc: WebGLUniformLocation | null; // The location to access and provide the color material data for the shaders to use
   diffuseLoc: WebGLUniformLocation | null; // The location to access and provide the color material data for the shaders to use
   specularLoc: WebGLUniformLocation | null; // The location to access and provide the color material data for the shaders to use
   shininessLoc: WebGLUniformLocation | null; // The location to access and provide the color material data for the shaders to use

   constructor() {
    // Vertices + normal vectors of a cube. Each cube has 6 faces, and each face is made up of two triangles. Each triangle has 3 vertices. 
    this.blockVertices = new Float32Array([
        -0.5, -0.5, -0.5,  0.0,  0.0, -1.0,
        0.5, -0.5, -0.5,  0.0,  0.0, -1.0, 
        0.5,  0.5, -0.5,  0.0,  0.0, -1.0, 
        0.5,  0.5, -0.5,  0.0,  0.0, -1.0, 
        -0.5,  0.5, -0.5,  0.0,  0.0, -1.0, 
        -0.5, -0.5, -0.5,  0.0,  0.0, -1.0, 

        -0.5, -0.5,  0.5,  0.0,  0.0, 1.0,
        0.5, -0.5,  0.5,  0.0,  0.0, 1.0,
        0.5,  0.5,  0.5,  0.0,  0.0, 1.0,
        0.5,  0.5,  0.5,  0.0,  0.0, 1.0,
        -0.5,  0.5,  0.5,  0.0,  0.0, 1.0,
        -0.5, -0.5,  0.5,  0.0,  0.0, 1.0,

        -0.5,  0.5,  0.5, -1.0,  0.0,  0.0,
        -0.5,  0.5, -0.5, -1.0,  0.0,  0.0,
        -0.5, -0.5, -0.5, -1.0,  0.0,  0.0,
        -0.5, -0.5, -0.5, -1.0,  0.0,  0.0,
        -0.5, -0.5,  0.5, -1.0,  0.0,  0.0,
        -0.5,  0.5,  0.5, -1.0,  0.0,  0.0,

        0.5,  0.5,  0.5,  1.0,  0.0,  0.0,
        0.5,  0.5, -0.5,  1.0,  0.0,  0.0,
        0.5, -0.5, -0.5,  1.0,  0.0,  0.0,
        0.5, -0.5, -0.5,  1.0,  0.0,  0.0,
        0.5, -0.5,  0.5,  1.0,  0.0,  0.0,
        0.5,  0.5,  0.5,  1.0,  0.0,  0.0,

        -0.5, -0.5, -0.5,  0.0, -1.0,  0.0,
        0.5, -0.5, -0.5,  0.0, -1.0,  0.0,
        0.5, -0.5,  0.5,  0.0, -1.0,  0.0,
        0.5, -0.5,  0.5,  0.0, -1.0,  0.0,
        -0.5, -0.5,  0.5,  0.0, -1.0,  0.0,
        -0.5, -0.5, -0.5,  0.0, -1.0,  0.0,

        -0.5,  0.5, -0.5,  0.0,  1.0,  0.0,
        0.5,  0.5, -0.5,  0.0,  1.0,  0.0,
        0.5,  0.5,  0.5,  0.0,  1.0,  0.0,
        0.5,  0.5,  0.5,  0.0,  1.0,  0.0,
        -0.5,  0.5,  0.5,  0.0,  1.0,  0.0,
        -0.5,  0.5, -0.5,  0.0,  1.0,  0.0
    ]);

    // These are as mentioned above. We initialize the WebGL specific ones to null because they need a proper WebGL context first
    this.features = []; // This is variable, start with none
    this.buffer = null;
    this.vao = null;
    // We cannot determine the following entries without a gl context
    this.modelLoc = null;
    this.ambientLoc = null;
    this.diffuseLoc = null;
    this.specularLoc = null;
    this.shininessLoc = null;
   }
}
let house = new Household(); // Create a global household object

// This is the grid class, used to draw a grid on the screen
class Grid {
  gridVertices: Float32Array | null; // Store the vertices that make up the grid
  modelMatrx: GLM.mat4; // Store the transform data of the grid
  buffer: WebGLBuffer | null; // Access the GPU buffer where the grid vertex data is uploaded
  vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null; // Store a descriptor of the proper vertex attribute format and related buffer
  width: number;
  height: number;
  material: Material;

  constructor() {
    // As above, but no need for normal data
    this.width = 10;
    this.height = 10;
    this.gridVertices = genGrid(this.width, this.height);
    
    // As in Household, we initialize what we can but set to null whatever needs a WebGL context first
    this.modelMatrx = GLM.mat4.create();
    this.buffer = null;
    this.vao = null;

    // Select the grid's color / material settings
    this.material = FEATURE_ORANGE;
  }
}
const grid = new Grid(); // Store a global grid object

// This is the function called to create the WebGL context, setup extensions if needed, read and compile shaders, and do all
// other prep work which is neccessary to initialize our renderer. 
async function onContextCreate(gl: ExpoWebGLRenderingContext) {
  // Read the text of the shader files. We later pass shader data as a string, so we need the actual shader files in a 
  // string representation for later use. We still split them into their own files though because it's easier to manage.
  const [vertData, fragData] = await readShaderData();

  // Get the OES Vertex Array Object extension
  // This is needed because these VAOs provide very useful functionality (we don't have to define vertex array attributes
  // every frame). However, since we need to support WebGL 1.0 (for older Raspberry Pis), we need to pull this in as an extension
  // as this functionality is only native in WebGL 2.0. To make things more annoying, often this functionality is NOT available in WebGL 2.0 
  // contexts. So, it's stupid, but we have to support both. This getExtension(...) call will either return an object or null.
  oesExt = gl.getExtension('OES_vertex_array_object'); 
  console.log("OES VAO Extension available:", oesExt);

  // Reset everything so it works when navigating back to this page. Descriptions are above.
  glRef = gl;
  shaderProgram = null;
  lastFrameTime = 0;
  house = new Household();
  cam = new Camera();

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

  // Ensure shaders are compiled correctly. Output an error if they aren't with relevant shader info, clear resources, and return. 
  if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
    console.error("Shaders failed to compile - ", gl.getShaderInfoLog(vert), " - AND - ", gl.getShaderInfoLog(frag));
    gl.deleteShader(vert);
    gl.deleteShader(frag);
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

  // Get attribute and uniform location information for the shader program. Essentially, this is get references to location information
  // so we can upload data to the GPU for shaders to use. Here, we deal with both attributes and uniforms. Uniforms are variables that are the same
  // for all instances of the shader being run (as shaders are run in parallel) although they may change frame to frame. Attributes are pieces
  // of data that are usually given in vertex data. For example, above with our cubes we provide both position and normal data. Position would
  // be one attribute, normals would be another. 
  const attribLocs = {
    // We need to figure out where these attributes are being stored on the GPU.
    vertLoc: gl.getAttribLocation(program, "aVertPos"),
    normalLoc: gl.getAttribLocation(program, "aNormal")
  }
  const matrixUniformLocs = {
    // We use three matrices to transform a model's unique position in the world into a 
    // projected value on the screen. 
    modelMatrix: gl.getUniformLocation(program, "uModel"),
    viewMatrix: gl.getUniformLocation(program, "uView"),
    projectionMatrix: gl.getUniformLocation(program, "uProjection")
  }
  const lightUniformLocs = {
    // These are used in lighting calculations. We'll use a slightly modified phong lighting model 
    // where we cut out the specular for performance (although we may add it back in later. We'll keep
    // support for it even though it's unused). This is meant to emulate a "material" as you often see in 
    // different game engines. 
    viewPosition: gl.getUniformLocation(program, "uViewPos"),
    material: {
      ambient: gl.getUniformLocation(program, "uMaterial.ambient"),
      diffuse: gl.getUniformLocation(program, "uMaterial.diffuse"), 
      specular: gl.getUniformLocation(program, "uMaterial.specular"),
      shininess: gl.getUniformLocation(program, "uMaterial.shininess")
    },
    light: {
      position: gl.getUniformLocation(program, "uLight.position"),
      ambient: gl.getUniformLocation(program, "uLight.ambient"),
      diffuse: gl.getUniformLocation(program, "uLight.diffuse"),
      specular: gl.getUniformLocation(program, "uLight.specular"),
    }
  }

  // Save the location information for the model matrix (that details transform information for each cube)
  house.modelLoc = matrixUniformLocs.modelMatrix; // We'll change this pretty frequently since we'll likely update it each frame.
  house.ambientLoc = lightUniformLocs.material.ambient;
  house.diffuseLoc = lightUniformLocs.material.diffuse;
  house.specularLoc = lightUniformLocs.material.specular;
  house.shininessLoc = lightUniformLocs.material.shininess;
  // It might be an improvement to save all the lightUniformLocs in one place, but doing it modlar like this ensures we don't give too much access all around

  // Save camera locations
  cam.viewLoc = matrixUniformLocs.viewMatrix;
  cam.projectionLoc = matrixUniformLocs.projectionMatrix;

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
  gl.useProgram(program);

  // Set up our perspective matrix
  GLM.mat4.perspective(cam.projectionMatrix, (45 * Math.PI / 180), gl.drawingBufferWidth / gl.drawingBufferHeight, NEAR_CLIP, FAR_CLIP);
  gl.uniformMatrix4fv(matrixUniformLocs.projectionMatrix, false, cam.projectionMatrix as Float32Array);

  // Move the camera up, back, and turn it a little to the origin
  GLM.mat4.rotateX(cam.viewMatrix, cam.viewMatrix, 30 * Math.PI / 180);
  GLM.mat4.translate(cam.viewMatrix, cam.viewMatrix, [0.0, -4.0, -7.0]);
  gl.uniformMatrix4fv(matrixUniformLocs.viewMatrix, false, cam.viewMatrix as Float32Array);

  // Setup lighting data. We'll just use placeholder values for now. Ambient simulates the basic lighting that just "exists", 
  // diffuse simulates lighting the bounces around and hits items and originates at a point, and specular I think of as just the 
  // shiny reflection of very pointed light. It's the "bright spots" that appear when light is reflected strongly in one direction 
  // towards you. Diffuse is scattered light, specular is not. Shiniess is just a material value. See https://learnopengl.com/Lighting/Basic-Lighting. 
  // We have no need to set the materials here though since they are determined on a per-object basis
  gl.uniform3fv(lightUniformLocs.viewPosition, [0, 0, 0]);
  gl.uniform3fv(lightUniformLocs.light.position, [0.0, 3.0, 3.0]);
  gl.uniform3fv(lightUniformLocs.light.ambient, [1.0, 0.5, 0.31]);
  gl.uniform3fv(lightUniformLocs.light.diffuse, [1.0, 0.5, 0.31]);
  gl.uniform3fv(lightUniformLocs.light.specular, [1.0, 1.0, 1.0]);

  // Start drawing frames. This is a recursive animation function
  drawFrame(lastFrameTime);

  // Clean up resources, although this probably never gets called. 
  gl.deleteShader(vert); // not needed anymore
  gl.deleteShader(frag); // same here
}

// This is the function that will be called every frame to draw a frame on in the WebGL context
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
    const program = shaderProgram; // Get a clearer reference to our shader program

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

    // Check time and update frame time to get a delta for animation
    const delta = (time - lastFrameTime) / 1000;
    lastFrameTime = time;

    // Prepare draw by clearing the screen and depth buffer
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // For the cube draw calls, we need to switch to the correct vertex attribute and buffer configuration. 
    // This also updates our view matrix so we can rotate the world around
    bindVAO(house.vao);
    GLM.mat4.rotateY(cam.viewMatrix, cam.viewMatrix, panVelocityX * delta); // Rotate the world according to the frame delta for smooth movement
    gl.uniformMatrix4fv(cam.viewLoc, false, cam.viewMatrix as Float32Array); // Upload this new model matrix for drawing
    
    // Iterate through all cubes making up our model and draw them each
    for (let i = 0; i < house.features.length; i++) {
      gl.uniformMatrix4fv(house.modelLoc, false, house.features[i].modelMatrix as Float32Array); // upload the correct model matrix for drawing
      gl.uniform3fv(house.ambientLoc, house.features[i].material.ambient); // update lighting uniform values for the material of the object
      gl.uniform3fv(house.diffuseLoc, house.features[i].material.diffuse);
      gl.uniform3fv(house.specularLoc, house.features[i].material.specular);
      gl.uniform1f(house.shininessLoc, house.features[i].material.shininess);
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

    // End frame. Flush WebGL's GPU, call an expo handler method, and then request a new animation frame with this same method (recursive)
    gl.flush(); 
    gl.endFrameEXP();
    window.requestAnimationFrame(drawFrame);
}

// Generate the vertices that would comrpise a grid based on a width and height value centered at 0 on the xz axis. 
function genGrid(width: number, height: number) {
  // Ensure valid width & height
  if (width <= 0 || height <= 0) {
    console.error("Invalid grid parameters.");
    return null;
  }

  // Each vertex has 3 position elements. Each line has two vertices, so 6 elements per line.
  // We start at -(width / 2), increasing by 1, until (width / 2) in the x direction, and then again in the z direction.
  const numLines = width + height + 2; // add two lines to close in the grid
  const numVertices = numLines * 6;

  // Store our vertices as a flat array
  let verts = new Float32Array(numVertices);

  // First half of verts is width lines
  // Draw all the lines in a z direction moving across the x axis
  for (let i = 0; i <= width; i++) {
    // x position goes from 0 - width / 2 to 0 + width / 2. z position is from 0 - height / 2 to 0 + height / 2
    
    // line 1 - x, y, z
    verts[i * 6 + 0] = i - width / 2;
    verts[i * 6 + 1] = 0.0;
    verts[i * 6 + 2] = 0 - height / 2;

    // line 2 - x, y, z
    verts[i * 6 + 3] = i - width / 2;
    verts[i * 6 + 4] = 0.0;
    verts[i * 6 + 5] = 0 + height / 2;
  }

  // Second half of verts is height lines
  // Draw all the lines in the x direction moving across the z axis
  for (let i = width + 1; i < numLines; i++) {
    // x position goes from 0 - width / 2 to 0 + width / 2. z position is from 0 - height / 2 to 0 + height / 2
    
    // line 1 - x, y, z
    verts[i * 6 + 0] = 0 - width / 2;
    verts[i * 6 + 1] = 0.0;
    verts[i * 6 + 2] = i - 1 - height / 2 - width;

    // line 2 - x, y, z
    verts[i * 6 + 3] = 0 + width / 2;
    verts[i * 6 + 4] = 0.0;
    verts[i * 6 + 5] = i - 1 - height / 2 - width;
  }

  return verts as Float32Array;
}

// Since WebGL 1.0 and 2.0 create vertex array objects (explained above) differently, we need a wrapper function. 
function createVAO() {
  // Ensure we have a WebGL context
  if (!glRef) {
    console.error("No gl context.");
    return null;
  }

  if (!oesExt) {
    // WebGL 2.0 - we do not have the OES extension and support VAOs natively
    return glRef.createVertexArray();
  } else {
    // WebGL 1.0 - we do have the OES extension to support VAOs but we do not have support for VAOs natively
    return oesExt.createVertexArrayOES();
  }
}

// Since WebGL 1.0 and 2.0 bind vertex array objects (explained above) differently, we need a wrapper function. 
// Note that it is possible to bind a null VAO, this just clears whatever VAO is currently bound. 
function bindVAO(vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null) {
  // Ensure we have a WebGL context
  if (!glRef) {
    console.error("No gl context.");
    return null;
  }

  if (!oesExt) {
    // WebGL 2.0 - we do not have the OES extension and support VAOs natively
    return glRef.bindVertexArray(vao);
  } else {
    // WebGL 1.0 - we do have the OES extension to support VAOs but we do not have support for VAOs natively
    return oesExt.bindVertexArrayOES(vao);
  }
}

// Read shader data from a .vert or .frag file (for vertex or fragment shaders), then return that file
// as a single string for later use in WebGL. I have no idea why they designed it this way, but WebGL wants
// a string. 
async function readShaderData() {
  // Load our vertex and fragment files. 
  const [vertFile, fragFile] = await Asset.loadAsync([
    require("../assets/shaders/main.vert"),
    require("../assets/shaders/main.frag"),
  ]);

  // Ensure we have a vertex shader (at least one is required), if not throw an error
  if (!vertFile.localUri) {
    throw new URIError("Unable to find vertex shader.");
  }

  // Ensure we have a fragment shader (at least one is required), if not throw an error
  if (!fragFile.localUri) {
    throw new URIError("Unable to find fragment shader.");
  }

  // Web and mobile bundle files differently. On web, we fetch it using a URL as if we were fetching an external resource.
  // On mobile, we can just read the file since it is bundled with the application. Once read, return the file data as text / string data.
  if (Platform.OS === 'web') {
    const vertSrc = await (await fetch(vertFile.localUri)).text(); // .text() is a promise, like fetch, hence the double await
    const fragSrc = await (await fetch(fragFile.localUri)).text();
    return [vertSrc, fragSrc]
  } else {
    const vertSrc = await readAsStringAsync(vertFile.localUri);
    const fragSrc = await readAsStringAsync(fragFile.localUri);
    return [vertSrc, fragSrc];
  }
}