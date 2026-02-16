/* PROLOGUE
File name: home.tsx
Description: Provide a home page with a WebGL context for graphical rendering
Programmer: Jack Bauer
Creation date: 2/15/26
Revision date: 
  - 2/15/26: Move graphical context and related code from index.tsx to here. Add comments. 
Preconditions: A React application asking for the home page
Postconditions: A home page component ready for rendering
Errors: The home page will always be delivered successfully. 
Side effects: None
Invariants: None
Known faults: None
*/

// Import required components
import { Asset } from 'expo-asset';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import * as GLM from 'gl-matrix';
import { Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewToggle from "./components/ViewToggle";
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';

// See https://docs.swmansion.com/react-native-gesture-handler/docs/gestures/use-pan-gesture for gesture handler details
// Also define global variables to store this data and update each frame
let panVelocityX = 0;
let panLastX = 0 

// A helper function to update the velocity of the pan. We multiply the x delta by a constant speed value
function updateVelocityPanX(dx: number) {
  panVelocityX = dx * 0.5;
}

// Define gesture handler function for panning and rotating the model
const handlePan = Gesture.Pan()
  .runOnJS(true) // Run all gesture handling on the main JS thread. Note: for performance reasons we could change this so it runs on the UI thread in the future
  
  // Reset values on the start of a gesture
  .onStart(() => {
    panLastX = 0;
  })

  // Handle gesture updates and calculate the difference between frames, then update the velocity
  .onUpdate((event) => {
    const deltaX = event.translationX - panLastX;
    panLastX = event.translationX;
    updateVelocityPanX(deltaX);
  })

  // When we let go of the drag, we no longer want to rotate so we set the rotation value to 0
  .onEnd(() => {
    updateVelocityPanX(0);
  });

// Outline the layout of the main page. The GLView component will provide our WebGL context for graphics, the ViewToggle
// will allow a switch between the 3D rendered graphical view and the list view of the house model, and the View structures 
// the page. Also uses a container to grab user gestures (e.g. rotating on the screen or panning)
export default function Index() {
  return (
    <GestureHandlerRootView>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#f0f2f5" }} edges={["top"]}>
          <ViewToggle active="3d" />
            <GestureDetector gesture={handlePan}>
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <GLView style={{width: 300, height: 300}} onContextCreate={onContextCreate} />
              </View>
          </GestureDetector>
        </SafeAreaView>
    </GestureHandlerRootView>
  );
}

let glRef: ExpoWebGLRenderingContext | null = null; // A global way to access the single WebGL context created on launch
let shaderProgram: WebGLProgram | null = null; // The currently used GPU shader program
let lastFrameTime = 0; // The time since the last frame
let oesExt: OES_vertex_array_object | null = null; // A global way to access the OES extension for WebGL 1.0 support

// This is the household class. It is meant to be the primary way to store and access the currently rendered house model
class Household {
   // A series of relevant variables to render the household on the screen.
   blockVertices: Float32Array; // The vertices that make up a cube (including the normals of each face)
   modelMatrices: GLM.mat4[]; // The list of matrices that represent the transform of each drawn cube
   modelLoc: WebGLUniformLocation | null; // The location to access and provide the model matrix data for the shaders to use
   buffer: WebGLBuffer | null; // A way to access the buffer storing cube vertex data on the GPU
   vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null; // A single object to store the vertex attribute data and which buffer to bind for the household

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
    this.modelMatrices = [GLM.mat4.create(), GLM.mat4.create(), GLM.mat4.create(), GLM.mat4.create()]; // We'll prepare for 4 cubes at the moment, but eventually this will be variable
    this.modelLoc = null;
    this.buffer = null;
    this.vao = null;
   }
}
const house = new Household(); // Create a global household object

// This is the grid class, used to draw a grid on the screen
class Grid {
  gridVertices: Float32Array; // Store the vertices that make up the grid
  modelMatrx: GLM.mat4; // Store the transform data of the grid
  buffer: WebGLBuffer | null; // Access the GPU buffer where the grid vertex data is uploaded
  vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null; // Store a descriptor of the proper vertex attribute format and related buffer

  constructor() {
    // As above, but no need for normal data
    this.gridVertices = new Float32Array([
      -100.0, 0.0, 0.0,
      100.0, 0.0, 0.0,
    ]);
    
    // As in Household, we initialize what we can but set to null whatever needs a WebGL context first
    this.modelMatrx = GLM.mat4.create();
    this.buffer = null;
    this.vao = null;
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
  house.modelMatrices = [GLM.mat4.create(), GLM.mat4.create(), GLM.mat4.create(), GLM.mat4.create()];
  house.modelLoc = null;

  // See expo documentation here: https://docs.expo.dev/versions/latest/sdk/gl-view/#usage
  // See also: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Adding_2D_content_to_a_WebGL_context 
  // Also see: https://learnopengl.com 

  // Setup initial parameters
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); // The size of the rendered context on the screen
  gl.clearColor(0.4, 0, 0.4, 1); // The background color 
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
  // store normal data with our vertices. We'll wrap this up in another VAO for ease of use. 
  grid.buffer = gl.createBuffer();
  grid.vao = createVAO();
  bindVAO(grid.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, grid.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, grid.gridVertices, gl.STATIC_DRAW); 
  gl.vertexAttribPointer(attribLocs.vertLoc, 3, gl.FLOAT, false, 3 * 4, 0);
  gl.enableVertexAttribArray(attribLocs.vertLoc);
  gl.disableVertexAttribArray(attribLocs.normalLoc);
  gl.vertexAttrib3f(attribLocs.normalLoc, 0, 1, 0);
  bindVAO(null);

  // Select our shader program to use. We must always have an active shader program.
  gl.useProgram(program);

  // We'll use a 3 matrix system. All model data is originally input with respect for its own space as the transform. That is, all model data
  // assumes its position origin is at 0. Obviously, when rendering multiple objects in different locations this isn't the case. 
  // We then define a "model matrix" to store the transform data for each object relevant to its world. Then, we use a "view matrix" to shift all 
  // world data around depending on how the camera is looking at the world (e.g. if the camera should move left, the world actually moves right).
  // Finally, we store a projection matrix to transform this view space coordinate data into a perspective view for the screen. Here, we create 
  // our projection and view matrix. We create our perspective matrix with a FOV of 45, aspect ratio of the WebGL context, a near clip of 0.1 and far of 100. 
  // Then, we upload this matrix data as uniform data for use in our vertex shader as an array of values. 
  const projectionMatrix = GLM.mat4.create();
  const viewMatrix = GLM.mat4.create();
  GLM.mat4.perspective(projectionMatrix, (45 * Math.PI / 180), gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 100.0);
  GLM.mat4.translate(house.modelMatrices[0], house.modelMatrices[0], [0.0, 0.0, -5.0]); // Move the house model back 5 units
  gl.uniformMatrix4fv(matrixUniformLocs.projectionMatrix, false, projectionMatrix as Float32Array);
  gl.uniformMatrix4fv(matrixUniformLocs.modelMatrix, false, house.modelMatrices[0] as Float32Array);
  gl.uniformMatrix4fv(matrixUniformLocs.viewMatrix, false, viewMatrix as Float32Array);

  // Move the grid lines back
  GLM.mat4.translate(grid.modelMatrx, grid.modelMatrx, [0.0, 0.0, -5.0]);

  // Setup lighting data. We'll just use placeholder values for now. Ambient simulates the basic lighting that just "exists", 
  // diffuse simulates lighting the bounces around and hits items and originates at a point, and specular I think of as just the 
  // shiny reflection of very pointed light. It's the "bright spots" that appear when light is reflected strongly in one direction 
  // towards you. Diffuse is scattered light, specular is not. Shiniess is just a material value. See https://learnopengl.com/Lighting/Basic-Lighting. 
  gl.uniform3fv(lightUniformLocs.viewPosition, [0, 0, 0]);
  gl.uniform3fv(lightUniformLocs.material.ambient, [1.0, 0.5, 0.31]);
  gl.uniform3fv(lightUniformLocs.material.diffuse, [1.0, 0.5, 0.31]);
  gl.uniform3fv(lightUniformLocs.material.specular, [0.5, 0.5, 0.5]);
  gl.uniform1f(lightUniformLocs.material.shininess, 32.0);
  gl.uniform3fv(lightUniformLocs.light.position, [0.0, 0.0, 0.6]);
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

    // Ensure we have proper house and grid buffers, if not error and return
    if (!house.buffer || !grid.buffer) {
      console.error("Invalid buffers.");
      return;
    }

    // Ensure we have proper house and grid vertex array objects (VAOs), if not error and return
    if (!house.vao || !grid.vao) {
      console.error("Invalid VAOs.");
      return;
    }

    // Check time and update frame time to get a delta for animation
    const delta = (time - lastFrameTime) / 1000;
    lastFrameTime = time;

    // Prepare draw by clearing the screen and depth buffer
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // For the cube draw calls, we need to switch to the correct vertex attribute and buffer configuration 
    bindVAO(house.vao);
    GLM.mat4.rotateY(house.modelMatrices[0], house.modelMatrices[0], panVelocityX * delta); // Rotate the cube according to the frame delta for smooth movement
    gl.uniformMatrix4fv(house.modelLoc, false, house.modelMatrices[0] as Float32Array); // Upload this new model matrix for drawing
    gl.drawArrays(gl.TRIANGLES, 0, 36); // One draw call to the GPU. Our cube has 6 faces, and each face has two triangles, which yiels 6 faces * 6 vertices for 36 vertices to draw.

    // Draw the grid. Use our grid vertex configuration, upload the grid's model matrix to the vertex shader, and then draw a line. Each line has two vertices. 
    bindVAO(grid.vao);
    gl.uniformMatrix4fv(house.modelLoc, false, grid.modelMatrx as Float32Array);
    gl.drawArrays(gl.LINES, 0, 2); // Lines are 1 pixel thick by default

    // End frame. Flush WebGL's GPU, call an expo handler method, and then request a new animation frame with this same method (recursive)
    gl.flush(); 
    gl.endFrameEXP();
    window.requestAnimationFrame(drawFrame);
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