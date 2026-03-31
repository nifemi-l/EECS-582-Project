/* PROLOGUE
File name: renderUtils.ts
Description: Provide renderer functionality to the application.
Programmer: Jack Bauer
Creation date: 3/29/26
Revision date: 
  - No revisions yet
Preconditions: A proper draw / render loop is created outside of this file (Renderer does not contain its own loop, instead it has the pieces)
Postconditions: None
Errors: None
Side effects: None
Invariants: None
Known faults: None
*/

// ***********************************************************
//                      Needed Imports
// ***********************************************************

// GL & Library imports 
import * as GLM from 'gl-matrix';
import { ExpoWebGLRenderingContext } from 'expo-gl';

// Import server classes
import Task from "./task";
import Feature from "./feature";
import Household from "./household";

// Import graphics utilities
import {
  MoveDirection, Material, genGrid, readShaderData,
  FEATURE_ORANGE, FEATURE_GREY, FEATURE_BLUE,
  ShaderLightUniformLocations, ShaderBillboardUniformLocations,
  ShaderAttributebLocations, ShaderMatrixUniformLocations,
} from "./graphicsUtils";

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
//                       Renderer Class
// ***********************************************************
// IMPORTANT NOTES:
// -- renderable features in house depend on feature 0 being the floor, and 1-4 being the 4 walls of the house. 
// -- this class depends on a render loop being defined externally. It only provides the pieces of that loop. 
// -- this class depends on feature data being loaded into it externally. 

// Store details needed for a functional renderer
export class Renderer {
  // Graphical context data
  lastFrameTime: number; // The time since the last frame
  frameId: number | null; // the id of the current frame being drawn
  oesExt: OES_vertex_array_object | null; // A global way to access the OES extension for WebGL 1.0 support

  // Renderer data
  glRef: ExpoWebGLRenderingContext | null; // A global way to access the single WebGL context created on launch
  shaderProgram: WebGLProgram | null; // The currently used GPU shader program
  bbShaderProgram: WebGLProgram | null; // The shader program for billboards
  cam: Camera; // Our global camera value
  initialized: boolean;

  // Draw routine helpers
  inverseView = GLM.mat4.create(); // store our inverse view matrix here to avoid re-creation every frame
  scale = GLM.vec3.create(); // store the current scale of our view matrix

  // Shader data
  attribLocs: ShaderAttributebLocations | null;
  matrixUniformLocs: ShaderMatrixUniformLocations | null;
  lightUniformLocs: ShaderLightUniformLocations | null;
  bbLocs: ShaderBillboardUniformLocations | null;

  // Application data
  house: RenderableHousehold; // The displayed household 
  selectedEditFeature: RenderableFeature | null; // The current feature being edited in the edit window
  grid: Grid; // Store a global grid object
  currentDrawingColor: Material; // the current color used for drawing our objects
  featuresDirty: boolean; // flag so we know if we need to apply feature updates or not
  features: Feature[]; // store the fetched feature list for our household

  // log error function
  logError() {
    console.log(this.glRef?.getError());
  }

  ///////////////////////
  ///  Init Routines  ///
  ///////////////////////

  // Called to load the needed features from an external database. Once they've been fetched, we call this method to 
  // apply the updated list. 
  setFeatures(householdID: number, features: Feature[]) {
    this.featuresDirty = true; // mark the feature list as dirty so we know to update before drawing next
    this.features = []; // empty the features array
    features.forEach((f) => {this.features.push(f)}) // manually copy the features over
    this.house.id = householdID; // NOTE: at some point we need to get all the household details
  }

  // Called when a GL context is created - NOT at construction time. 
  async init(gl: ExpoWebGLRenderingContext) {
    // Reset everything so it works when navigating back to the graphics page. Descriptions are above.
    this.glRef = gl;
    this.lastFrameTime = 0;
    this.shaderProgram = null; // I don't think this causes a memory leak as Expo should clean up resources on unmount
    this.bbShaderProgram = null;
    this.house = new RenderableHousehold(this, "default_2");
    this.cam = new Camera();
    this.grid = new Grid(this);

    // Read the text of the shader files. We later pass shader data as a string, so we need the actual shader files in a 
    // string representation for later use. We still split them into their own files though because it's easier to manage.
    const [vertData, fragData, bbVertData, bbFragData] = await readShaderData();

    // Get the OES Vertex Array Object extension
    // This is needed because these VAOs provide very useful functionality (we don't have to define vertex array attributes
    // every frame). However, since we need to support WebGL 1.0 (for older Raspberry Pis), we need to pull this in as an extension
    // as this functionality is only native in WebGL 2.0. To make things more annoying, often this functionality is NOT available in WebGL 2.0 
    // contexts. So, it's stupid, but we have to support both. This getExtension(...) call will either return an object or null.
    this.oesExt = gl.getExtension('OES_vertex_array_object'); 

    // Rebuild the grid if we're missing it
    if (!this.grid) {
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
    this.shaderProgram = program;

    // Now, we create a shader program for the healthbars (bb is short for billboard)
    const bbProgram = gl.createProgram();
    gl.attachShader(bbProgram, bbVert);
    gl.attachShader(bbProgram, bbFrag);
    gl.linkProgram(bbProgram);
    this.bbShaderProgram = bbProgram;

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
    this.attribLocs = {
      // We need to figure out where these attributes are being stored on the GPU.
      vertLoc: gl.getAttribLocation(this.shaderProgram, "aVertPos"),
      normalLoc: gl.getAttribLocation(this.shaderProgram, "aNormal")
    }
    this.matrixUniformLocs = {
      // We use three matrices to transform a model's unique position in the world into a 
      // projected value on the screen. 
      modelMatrix: gl.getUniformLocation(this.shaderProgram, "uModel"),
      viewMatrix: gl.getUniformLocation(this.shaderProgram, "uView"),
      projectionMatrix: gl.getUniformLocation(this.shaderProgram, "uProjection")
    }
    this.lightUniformLocs = {
      // These are used in lighting calculations. We'll use a slightly modified phong lighting model 
      // where we cut out the specular for performance (although we may add it back in later. We'll keep
      // support for it even though it's unused). This is meant to emulate a "material" as you often see in 
      // different game engines. 
      viewPosition: gl.getUniformLocation(this.shaderProgram, "uViewPos"),
      material: {
        ambient: gl.getUniformLocation(this.shaderProgram, "uMaterial.ambient"),
        diffuse: gl.getUniformLocation(this.shaderProgram, "uMaterial.diffuse"), 
        specular: gl.getUniformLocation(this.shaderProgram, "uMaterial.specular"),
        shininess: gl.getUniformLocation(this.shaderProgram, "uMaterial.shininess")
      },
      light: {
        position: gl.getUniformLocation(this.shaderProgram, "uLight.position"),
        ambient: gl.getUniformLocation(this.shaderProgram, "uLight.ambient"),
        diffuse: gl.getUniformLocation(this.shaderProgram, "uLight.diffuse"),
        specular: gl.getUniformLocation(this.shaderProgram, "uLight.specular"),
      }
    }
    this.bbLocs = { // Now for the billboard program
      pos: gl.getAttribLocation(this.bbShaderProgram, "aVertPos"),
      model: gl.getUniformLocation(this.bbShaderProgram, "uModel"),
      view: gl.getUniformLocation(this.bbShaderProgram, "uView"),
      inverseView: gl.getUniformLocation(this.bbShaderProgram, "uInverseView"),
      projection: gl.getUniformLocation(this.bbShaderProgram, "uProjection"),
      heightOffset: gl.getUniformLocation(this.bbShaderProgram, "uHeightOffset"),
      healthPercent: gl.getUniformLocation(this.bbShaderProgram, "uHealthPercent"),
    }

    // Setup our vertex buffer and attribute informations. This is how we know what information is stored where. 
    // Attributes are explained above. Basically, we send our vertex data to the GPU by storing it in a buffer. We also have to tell
    // the GPU how to interpret this data, as each vertex might contain different sets of data. For our cube, we store, for each vertex, 
    // 3 floats of position data and 3 floats of normal data. So, we set this attribute information and ultimately store it all in a Vertex Array
    // Object or VAO. This VAO allows us to easily load in our settings for the cube and switch out for a different configuration when we want to 
    // render the grid. 
    this.house.buffer = gl.createBuffer();
    this.house.vao = this.createVAO();
    this.bindVAO(this.house.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.house.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.house.blockVertices, gl.STATIC_DRAW);
    gl.vertexAttribPointer(this.attribLocs.vertLoc, 3, gl.FLOAT, false, 6 * 4, 0); // 4 bytes per float * 6 floats stored per vertex = 24 bytes per vertex
    gl.enableVertexAttribArray(this.attribLocs.vertLoc);
    gl.vertexAttribPointer(this.attribLocs.normalLoc, 3, gl.FLOAT, false, 6 * 4, 4 * 3); // 4 bytes per float * 3 floats before we get to our first set of normal data
    gl.enableVertexAttribArray(this.attribLocs.normalLoc);  
    this.bindVAO(null);

    // Do the same for billboards
    this.house.bbBuffer = gl.createBuffer();
    this.house.bbVao = this.createVAO();
    this.bindVAO(this.house.bbVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.house.bbBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.house.bbVertices, gl.STATIC_DRAW);
    gl.vertexAttribPointer(this.bbLocs.pos, 3, gl.FLOAT, false, 3 * 4, 0);
    gl.enableVertexAttribArray(this.bbLocs.pos);
    this.bindVAO(null);

    // Do the same as above, but for the grid vertices. Note that we disable the normal attribute and default it to (0, 1, 0) always since we don't 
    // store normal data with our vertices. We'll wrap this up in another VAO for ease of use. Skip this is we have no grid vertices
    if (this.grid !== null && this.grid.gridVertices !== null) {
      const gridBuffer = gl.createBuffer();
      const gridVao = this.createVAO();
      this.bindVAO(gridVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.grid.gridVertices, gl.STATIC_DRAW); 
      gl.vertexAttribPointer(this.attribLocs.vertLoc, 3, gl.FLOAT, false, 3 * 4, 0);
      gl.enableVertexAttribArray(this.attribLocs.vertLoc);
      gl.disableVertexAttribArray(this.attribLocs.normalLoc);
      gl.vertexAttrib3f(this.attribLocs.normalLoc, 0, 1, 0);

      // Set these afterwards for safety in case there's anything funky going on with the grid object
      this.grid.vao = gridVao;
      this.grid.buffer = gridBuffer;
      this.bindVAO(null);
    } else {
      console.log("Skipping grid configuration.");
    }

    // Select our shader program to use. We must always have an active shader program.
    gl.useProgram(this.shaderProgram);

    // Set up our perspective matrix
    GLM.mat4.perspective(this.cam.projectionMatrix, (45 * Math.PI / 180), gl.drawingBufferWidth / gl.drawingBufferHeight, NEAR_CLIP, FAR_CLIP);
    gl.uniformMatrix4fv(this.matrixUniformLocs.projectionMatrix, false, this.cam.projectionMatrix as Float32Array);

    // Move the camera up, back, and turn it a little to the origin, rotate a little to the left to show 2 walls
    GLM.mat4.rotateX(this.cam.viewMatrix, this.cam.viewMatrix, 40 * Math.PI / 180);
    GLM.mat4.translate(this.cam.viewMatrix, this.cam.viewMatrix, [0.0, -12.0, -16]);
    GLM.mat4.rotateY(this.cam.viewMatrix, this.cam.viewMatrix, 45 * Math.PI / 180);
    gl.uniformMatrix4fv(this.matrixUniformLocs.viewMatrix, false, this.cam.viewMatrix as Float32Array);

    // Setup lighting data. We'll just use placeholder values for now. Ambient simulates the basic lighting that just "exists", 
    // diffuse simulates lighting the bounces around and hits items and originates at a point, and specular I think of as just the 
    // shiny reflection of very pointed light. It's the "bright spots" that appear when light is reflected strongly in one direction 
    // towards you. Diffuse is scattered light, specular is not. Shiniess is just a material value. See https://learnopengl.com/Lighting/Basic-Lighting. 
    // We have no need to set the materials here though since they are determined on a per-object basis
    gl.uniform3fv(this.lightUniformLocs.viewPosition, [0, 0, 0]);
    gl.uniform3fv(this.lightUniformLocs.light.position, [0.0, 6.0, 3.0]);
    gl.uniform3fv(this.lightUniformLocs.light.ambient, [0.4, 0.4, 0.4]);
    gl.uniform3fv(this.lightUniformLocs.light.diffuse, [0.9, 0.9, 0.9]);
    gl.uniform3fv(this.lightUniformLocs.light.specular, [1.0, 1.0, 1.0]);

    this.initialized = true;
    console.log("Context initialized.");
  }

  constructor() {
    // These values must be set on context create (not during construction)
    this.oesExt = null;
    this.glRef = null;
    this.shaderProgram = null;
    this.bbShaderProgram = null;
    this.lightUniformLocs = null;
    this.bbLocs = null;
    this.matrixUniformLocs = null;
    this.attribLocs = null;

    // These can safely be set at construction time
    this.grid = new Grid(this);
    this.house = new RenderableHousehold(this, "default_1");
    this.cam = new Camera();
    this.lastFrameTime = 0;
    this.currentDrawingColor = FEATURE_ORANGE;
    this.initialized = false;
    this.features = [];
    this.featuresDirty = false;

    // These will be set as needed
    this.frameId = null;
    this.selectedEditFeature = null;

    console.log("Renderer constructed.");
  }

  ///////////////////////
  ///  Draw Routines  ///
  ///////////////////////
  // NOTE: The actual render loop is not in this file. Instead, these are a series of helpers

  // Copy from the renderer's list of features to the house's list of RenderableFeatures
  updateFeatures() {
    // Remove all renderable features EXCEPT the floor and 4 walls (features at indices [0, 4])
    const length = this.house.renderableFeatures.length;
    for (let i = length - 1; i > 4; i--) {
      this.house.renderableFeatures.pop();
    }

    // Update the renderable features
    this.features.forEach((f) => {
      // Prepare the appropriate model matrix
      const transform = GLM.mat4.create();
      GLM.mat4.translate(transform, transform, [f.x_pos + 0.5, f.y_pos + 0.5, f.z_pos + 0.5]); // The 0.5s account for the difference between the cell center and edges

      // Select the correct material depending on the type
      let mat = FEATURE_ORANGE;
      switch(f.feature_type) {
        case "room":
          mat = FEATURE_BLUE;
        case "":
        default:
          mat = FEATURE_ORANGE;
      } 

      // Add the feature for rendering
      this.house.renderableFeatures.push(new RenderableFeature(f.name, f.household_id, transform, mat, f.x_pos, f.y_pos, f.z_pos));
      this.featuresDirty = false;
      console.log("Features updated.");
    });
  }

  // Return true if a frame has the data it needs to draw and is able to draw, flase otherwise
  checkReadyToDraw() {
    // Ensure initialization
    if (!this.initialized) {
      console.error("Attempting to update view matrix before initialization.");
      return false;
    }

    // Ensure we have an OpenGL context, if not error and return
    if (!this.glRef) {
      console.error("Frame drawn without a WebGL context");
      return false;
    }

    // Ensure we have a valid shader program, if not error and return
    if (!this.shaderProgram) {
      console.error("Frame drawn without a shader program");
      return false;
    }

    // Ensure we have a billboard shader program
    if (!this.bbShaderProgram) {
      console.error("Frame drawn without a billboard shader program");
      return false;
    }

    // Ensure we have valid uniform or attribute locations
    if (!this.attribLocs || !this.bbLocs || !this.lightUniformLocs || !this.matrixUniformLocs) {
      console.error("Invalid shader uniform and/or attribute location data. ");
      return false;
    } 

    // Ensure we have a valid location for the matrix uniforms, if not error and return
    if (!this.matrixUniformLocs.modelMatrix || !this.matrixUniformLocs.projectionMatrix || !this.matrixUniformLocs.viewMatrix) {
      console.error("Missing at least one matrix shader uniform location.");
      return false;
    }

    // Ensure we have valid light uniform locations, if not error and return - note we don't check for viewPosition
    if (!this.lightUniformLocs.material.ambient || !this.lightUniformLocs.material.diffuse || !this.lightUniformLocs.material.specular || !this.lightUniformLocs.material.shininess
          || !this.lightUniformLocs.light.ambient || !this.lightUniformLocs.light.diffuse || !this.lightUniformLocs.light.position || !this.lightUniformLocs.light.specular 
    ) {
      console.error("Missing at least one light shader uniform location:", this.lightUniformLocs);
      return false;
    }

    // Ensure billboard uniform locations (we don't need to check pos since it cannot be null)
    if (!this.bbLocs.model || !this.bbLocs.view || !this.bbLocs.projection || !this.bbLocs.inverseView || !this.bbLocs.heightOffset || !this.bbLocs.healthPercent) {
      console.error("Missing at lease one billboard uniform location.");
      return false;
    }

    // Ensure we have a proper house buffer, if not error and return
    if (!this.house.buffer) {
      console.error("Invalid buffers.");
      return false;
    }

    // Ensure we have a proper house vertex array object (VAO), if not error and return
    if (!this.house.vao) {
      console.error("Invalid VAO.");
      return false;
    }

    // Ensure we have a proper house billboard buffer, if not error and return
    if (!this.house.bbBuffer) {
      console.error("Invalid billboard buffer.");
      return false;
    }

    // Ensure we have a proper house billboard vertex array object (VAO), if not error and return
    if (!this.house.bbVao) {
      console.error("Invalid billboard VAO.");
      return false;
    }

    // Otherwise...
    return true;
  }

  // Update the world according to new input
  updateViewMatrix(panVelocityX: number, panVelocityY: number, panYDir: number, delta: number) {
    // Ensure initialization
    if (!this.initialized) {
      console.error("Attempting to update view matrix before initialization.");
      return;
    }

    // Scale view matrix (thus scaling the world)
    // Get the current scale
    GLM.mat4.getScaling(this.scale, this.cam.viewMatrix);
    // Make sure we have high enough velocity to zoom, so we don't annoyingly pan when want to zoom
    if (Math.abs(panVelocityY) > 1.0) {
      // scale according to y pan and y drag direction
      // scale up = scaleAmt > 1
      // scale down = scale amt < 1
      const scaleAmt = panYDir < 0 ? 1 + panVelocityY * delta : 1 + panVelocityY * delta;

      // Check if the proposed scale is valid (since we evenly scale, we only need to do this for the first component)
      const testScale = scaleAmt * this.scale[0];
      if (testScale > MIN_WORLD_SCALE && testScale < MAX_WORLD_SCALE) {
        // we have a valid scale
        GLM.mat4.scale(this.cam.viewMatrix, this.cam.viewMatrix, [scaleAmt, scaleAmt, scaleAmt]);
      } 
    }
    
    // Apply pan-to-rotate
    GLM.mat4.rotateY(this.cam.viewMatrix, this.cam.viewMatrix, panVelocityX * delta); // Rotate the world according to the frame delta for smooth movement
    
    // Update the shader's view matrix
    if (!this.glRef || !this.matrixUniformLocs || !this.matrixUniformLocs.viewMatrix) {
      console.error("Unable to set view matrix.");
      return;
    }
    this.glRef.uniformMatrix4fv(this.matrixUniformLocs.viewMatrix, false, this.cam.viewMatrix as Float32Array); // Upload this new model matrix for drawing
  }

  // Update and switch which walls are displayed
  setWallVisibility() {
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
          this.cam.viewMatrix[2], this.cam.viewMatrix[6], this.cam.viewMatrix[10]
        );

        // Check if the normal is facing more away from the camera or to the camera and set visibility accordingly
        const dot = GLM.vec3.dot(sideVec, cameraFwdVec);
        this.house.renderableFeatures[i].visible = dot > 0;
    }
  }

  // Draw each feature in the associated house model
  drawFeatures() {
    // Ensure we have a matrix uniform location and a GL context
    if (!this.glRef || !this.matrixUniformLocs || !this.matrixUniformLocs.modelMatrix || !this.lightUniformLocs 
      || !this.lightUniformLocs.material.ambient || !this.lightUniformLocs.material.diffuse || !this.lightUniformLocs.material.specular || !this.lightUniformLocs.material.shininess) {
      console.error("Not ready to draw features.");
      return;
    }
    const gl = this.glRef;

    // Iterate through all cubes making up our model and draw them each
    for (let i = 0; i < this.house.renderableFeatures.length; i++) {
      if (!this.house.renderableFeatures[i].visible) {
        // Skip invisible features
        continue;
      }
      gl.uniformMatrix4fv(this.matrixUniformLocs.modelMatrix, false, this.house.renderableFeatures[i].modelMatrix as Float32Array); // upload the correct model matrix for drawing
      gl.uniform3fv(this.lightUniformLocs.material.ambient, this.house.renderableFeatures[i].material.ambient); // update lighting uniform values for the material of the object
      gl.uniform3fv(this.lightUniformLocs.material.diffuse, this.house.renderableFeatures[i].material.diffuse);
      gl.uniform3fv(this.lightUniformLocs.material.specular, this.house.renderableFeatures[i].material.specular);
      gl.uniform1f(this.lightUniformLocs.material.shininess, this.house.renderableFeatures[i].material.shininess);
      gl.drawArrays(gl.TRIANGLES, 0, 36); // One draw call to the GPU. Our cube has 6 faces, and each face has two triangles, which yields 6 faces * 6 vertices for 36 vertices to draw.
    }
  }

  // Draw the grid
  drawGrid() {
    // Ensure we're ready to draw
    if (!this.glRef || !this.matrixUniformLocs || !this.matrixUniformLocs.modelMatrix || !this.lightUniformLocs || !this.lightUniformLocs.material.ambient 
      || !this.lightUniformLocs.material.diffuse || !this.lightUniformLocs.material.shininess || !this.lightUniformLocs.material.specular) {
        console.error("Not ready to draw grid.");
        return;
    }
    const gl = this.glRef;

    // Use our grid vertex configuration, upload the grid's model matrix to the vertex shader, and then draw a line. Each line has two vertices. 
    // Only draw if we have a proper grid setup
    if (this.grid !== null && this.grid.vao !== null && this.grid.buffer !== null && this.grid.gridVertices !== null) {
      this.bindVAO(this.grid.vao);
      gl.uniformMatrix4fv(this.matrixUniformLocs.modelMatrix, false, this.grid.modelMatrx as Float32Array);
      gl.uniform3fv(this.lightUniformLocs.material.ambient, this.grid.material.ambient); // update lighting uniform values for the material of the object
      gl.uniform3fv(this.lightUniformLocs.material.diffuse, this.grid.material.diffuse);
      gl.uniform3fv(this.lightUniformLocs.material.specular, this.grid.material.specular);
      gl.uniform1f(this.lightUniformLocs.material.shininess, this.grid.material.shininess);
      gl.drawArrays(gl.LINES, 0, 2 * (this.grid.width + this.grid.height + 2)); // Lines are 1 pixel thick by default. Two vertices per line. Two more lines to close the grid.
    }
  }

  // Draw health bars for features
  drawHealthbars() {
    // Ensure ready to draw
    if (!this.glRef || !this.bbLocs) {
      console.error("Not ready to draw healthbars.");
      return;
    }
    const gl = this.glRef;

    // Now, draw all the healthbars if we can calculate the correct inverse view matrix to position them (I think we always can)
    const inverseResult = GLM.mat4.invert(this.inverseView, this.cam.viewMatrix);
    if (!inverseResult) {
      console.error("Unable to calculate inverse view matrix.");
    } else {
      // Begin the new shader program specific to billboards
      gl.useProgram(this.bbShaderProgram);
      gl.disable(gl.DEPTH_TEST); // so the healthbars get drawn on top of everything else
      this.bindVAO(this.house.bbVao);
      // Set camera uniforms. We need the inverse view matrix to easily get camera vectors for the billboards. We can calculate this once per frame since it stays the same
      // instead of calculating a ton of times in the vertex shader
      gl.uniformMatrix4fv(this.bbLocs.projection, false, this.cam.projectionMatrix as Float32Array);
      gl.uniformMatrix4fv(this.bbLocs.view, false, this.cam.viewMatrix as Float32Array);
      gl.uniformMatrix4fv(this.bbLocs.inverseView, false, this.inverseView as Float32Array);
      // Now iterate through
      for (let i = 0; i < this.house.renderableFeatures.length; i++) {
        // Get the feature position
        gl.uniformMatrix4fv(this.bbLocs.model, false, this.house.renderableFeatures[i].modelMatrix as Float32Array);
        for (let j = 0; j < this.house.renderableFeatures[i].tasks.length; j++) {
          gl.uniform1f(this.bbLocs.heightOffset, 0.8 + (j + 1) * 0.4); // Add an offset per chore bar
          gl.uniform1f(this.bbLocs.healthPercent, this.house.renderableFeatures[i].tasks[j].getAndSetHealthPercent()); // Update the current decay value
          gl.drawArrays(gl.TRIANGLES, 0, 6); // draw 6 vertices = 2 triangles = 1 quad
        }
      }
      gl.enable(gl.DEPTH_TEST); // return to normal
    }
  }

  ///////////////////
  ///  Utilities  ///
  ///////////////////

  // Since WebGL 1.0 and 2.0 create vertex array objects (explained above) differently, we need a wrapper function. 
  createVAO() {
    // Ensure we have a WebGL context
    if (!this.glRef) {
      console.error("No gl context.");
      return null;
    }

    if (!this.oesExt) {
      // WebGL 2.0 - we do not have the OES extension and support VAOs natively
      return this.glRef.createVertexArray();
    } else {
      // WebGL 1.0 - we do have the OES extension to support VAOs but we do not have support for VAOs natively
      return this.oesExt.createVertexArrayOES();
    }
  }

  // Since WebGL 1.0 and 2.0 bind vertex array objects (explained above) differently, we need a wrapper function. 
  // Note that it is possible to bind a null VAO, this just clears whatever VAO is currently bound. 
  bindVAO(vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null) {
    // Ensure we have a WebGL context
    if (!this.glRef) {
      console.error("No gl context.");
      return null;
    }

    if (!this.oesExt) {
      // WebGL 2.0 - we do not have the OES extension and support VAOs natively
      return this.glRef.bindVertexArray(vao);
    } else {
      // WebGL 1.0 - we do have the OES extension to support VAOs but we do not have support for VAOs natively
      return this.oesExt.bindVertexArrayOES(vao);
    }
  }

  // A function to add a block to the household at a certain position
  addBlock(cellX: number, cellY: number, cellZ: number) {
    // Ensure our cell position is in bounds
    if (!this.checkCellInBounds(cellX, cellY, cellZ)) {
      return;
    }

    // Ensure we haven't already placed a block here. If we have, remove it 
    if (!this.checkValidBlockAndRemove(cellX, cellY, cellZ)) {
      return;
    }

    const newModelMatrix = GLM.mat4.create(); // create a new transform 
    GLM.mat4.translate(newModelMatrix, newModelMatrix, [cellX + 0.5, cellY + 0.5, cellZ + 0.5]); // The 0.5s account for the difference between the cell center and edges
    const newMaterial: Material = this.currentDrawingColor;
    const newFeature = new RenderableFeature("f:" + cellX + cellY + cellZ, this.house.household_id, newModelMatrix, newMaterial, cellX, cellY, cellZ); // this is the new feature object we're adding
    // randomly add a second chore for demo purposes
    if (Math.round(Math.random()) == 0) {
      newFeature.addTask(new Task("Test Task", newFeature.id, 1));
    }
    this.house.renderableFeatures.push(newFeature); // add the feature to the house
  }

  // A function to convert screen clicks / taps from screen coordinates to world coordinates in the renderer
  screenToWorldCoords(screenX: number, screenY: number, viewWidth: number, viewHeight: number, windowWidth: number, windowHeight: number) {
    // Ensure we have a valid context
    if (!this.glRef || !this.cam.projectionMatrix || !this.cam.viewMatrix) {
      console.error("Unable to convert coordinates without WebGL context.");
      return null;
    }

    // Ensure we have valid dimensions. Window size is the size of the entire window, 
    // view size is the specific size of the React view wrapping the GLView. In other words, this is 
    // the size of the drawing canvas.
    if (viewWidth === 0 || viewHeight === 0 || windowWidth === 0 || windowHeight === 0) {
      console.error("No width or height defined:", viewWidth, viewHeight, windowWidth, windowHeight);
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
    GLM.mat4.multiply(viewProjMatrix, this.cam.projectionMatrix, this.cam.viewMatrix);
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
      console.error("Failing, unable to calculate a ray.")
      return null;
    }  
    const t = -1.0 * front[1] / dir[1];
    const finalPos = GLM.vec3.fromValues(front[0] + dir[0] * t, 0, front[2] + dir[2] * t);

    return finalPos;
  }

  // Check if a block already exists on the cell - check against all existing cells. If it does, remove what's there
  checkValidBlockAndRemove(cellX: number, cellY: number, cellZ: number) {
    // copy array to new array, without the removed element. We'll do this as we iterate. If we find one to remove, set the result bool
    let success = true;
    let copyArray = []; 
    for (let i = 0; i < this.house.renderableFeatures.length; i++) {
      if (this.house.renderableFeatures[i].x_pos == cellX && this.house.renderableFeatures[i].y_pos == cellY && this.house.renderableFeatures[i].z_pos == cellZ) {
        // We've found a feature not to keep
        success = false;
      } else {
        // We've found a feature we want to keep
        copyArray.push(this.house.renderableFeatures[i]);
      }
    }
    // update house array and return success or not
    this.house.renderableFeatures = copyArray;
    return success;
  }

  // Check if a block already exists in a cell without removing
  checkCellFree(cellX: number, cellY: number, cellZ: number) {
    // Iterate over the features and see if something is in the provided cell. If so, we know it is not free
    for (let i = 0; i < this.house.renderableFeatures.length; i++) {
      if (this.house.renderableFeatures[i].x_pos == cellX && this.house.renderableFeatures[i].y_pos == cellY && this.house.renderableFeatures[i].z_pos == cellZ) {
        return false;
      } 
    }
    return true;
  }

  // See if a cell is within the bounds of the grid
  checkCellInBounds(cellX: number, cellY: number, cellZ: number) {
    // Disallow invalid block positions. For a grid of size 10,10 we allow range [-5, 4] in the xz directions. We lock to the xz plane (y=0)
    const halfGridWidth = Math.floor(this.grid.width / 2);
    const halfGridHeight = Math.floor(this.grid.height / 2);
    if ((cellX < 0 - halfGridWidth || cellX >= halfGridWidth) || Math.abs(cellY) > 0 || (cellZ < 0 - halfGridHeight || cellZ >= halfGridHeight)) {
      return false;
    }
    return true;
  }

  // A wrapper function to check if a cell is both free and within the grid
  checkValidCell(cellX: number, cellY: number, cellZ: number) {
    return this.checkCellInBounds(cellX, cellY, cellZ) && this.checkCellFree(cellX, cellY, cellZ);
  }
}

// ***********************************************************
//                       Helper Classes
// ***********************************************************

// A class to represent the camera object. This manages the world view matrix
export class Camera {
  viewMatrix: GLM.mat4; // The view matrix used to setup the projection
  projectionMatrix: GLM.mat4;

  // Constructor. Initialize the viewLocation to null since we have no gl context yet, and create an identity view matrix
  constructor() {
    this.viewMatrix = GLM.mat4.create();

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

// Extended Feature class for 3D rendering
export class RenderableFeature extends Feature {
   modelMatrix: GLM.mat4; // The transform of the feature in the world
   material: Material; // How the feature looks materially
   visible: boolean;

   constructor(name: string, household_id: number, mm: GLM.mat4 | null, mat: Material | null, x: number | null, y: number | null, z: number | null) {
    super(name, household_id)

    // Assign model matrix to either a provided value or a default
    this.modelMatrix = mm || GLM.mat4.create();

    // Do the same for the material (basically what should the object look like color-wise).
    this.material = mat || FEATURE_ORANGE;

    // Default chore list
    this.addTask(new Task("Mock Task", 0 , 1));

    // Defaults to origin in super if not provided (note: assumes valid input)
    this.x_pos = x || 0;
    this.y_pos = y || 0;
    this.z_pos = z || 0;

    // Default to visibile
    this.visible = true;
   }
}

// This is the household class. It is meant to be the primary way to store and access the currently rendered house model
export class RenderableHousehold extends Household {
   // A series of relevant variables to render the household on the screen.
   blockVertices: Float32Array; // The vertices that make up a cube (including the normals of each face)
   renderableFeatures: RenderableFeature[]; // The list of feature objects in our household
   buffer: WebGLBuffer | null; // A way to access the buffer storing cube vertex data on the GPU
   vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null; // A single object to store the vertex attribute data and which buffer to bind for the household

   // Billboard related values
   bbBuffer: WebGLBuffer | null; // A way to access the buffer storing cube vertex data on the GPU
   bbVertices: Float32Array; // The vertices of the billboard quad
   bbVao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null; // A single object to store the vertex attribute data and which buffer to bind for the household

   // Active renderer
   rdr: Renderer;

   // change the size of the floor feature to match the grid
   resizeFloorFeature() {
    // floor feature is always the first feature in the features array
    const floorMatrix = GLM.mat4.create();
    GLM.mat4.scale(floorMatrix, floorMatrix, [this.rdr.grid.width, 0.5, this.rdr.grid.height]);
    GLM.mat4.translate(floorMatrix, floorMatrix, [0, -0.51, 0]); // The 0.5s account for the difference between the cell center and edges
    const floorFeature = new RenderableFeature("Floor", this.household_id, floorMatrix, FEATURE_GREY, 0, -1, 0); // Set to one below for now (does not coorespond to model matrix) so we don't accidentally delete it
    floorFeature.tasks = []; // reset tasks so no healthbar
    this.renderableFeatures[0] = floorFeature;
   }
   
   // Moves the selected edit feature one cell over based on the input direction
   moveSelectedFeatureByOne(dir: MoveDirection) {
    // Ensure we have a feature selected
    if (!this.rdr.selectedEditFeature) {
      console.error("Attempting to move null feature.");
      return;
    }

    // Apply movement. First, check if the proposed move would be within bounds. Then, apply updates to the model matrices and XYZ values.
    switch (dir) {
      case MoveDirection.POS_X:
        if (this.rdr.checkValidCell(this.rdr.selectedEditFeature.x_pos + 1, this.rdr.selectedEditFeature.y_pos, this.rdr.selectedEditFeature.z_pos)) {
          this.rdr.selectedEditFeature.x_pos += 1;
          GLM.mat4.translate(this.rdr.selectedEditFeature.modelMatrix, this.rdr.selectedEditFeature.modelMatrix, [1, 0, 0]);
        }
        break;
      case MoveDirection.NEG_X:
        if (this.rdr.checkValidCell(this.rdr.selectedEditFeature.x_pos - 1, this.rdr.selectedEditFeature.y_pos, this.rdr.selectedEditFeature.z_pos)) {
          this.rdr.selectedEditFeature.x_pos -= 1;
          GLM.mat4.translate(this.rdr.selectedEditFeature.modelMatrix, this.rdr.selectedEditFeature.modelMatrix, [-1, 0, 0]);
        }
        break;
      case MoveDirection.POS_Z:
        if (this.rdr.checkValidCell(this.rdr.selectedEditFeature.x_pos, this.rdr.selectedEditFeature.y_pos, this.rdr.selectedEditFeature.z_pos + 1)) {
          this.rdr.selectedEditFeature.z_pos += 1;
          GLM.mat4.translate(this.rdr.selectedEditFeature.modelMatrix, this.rdr.selectedEditFeature.modelMatrix, [0, 0, 1]);
        }
        break;
      case MoveDirection.NEG_Z:
        if (this.rdr.checkValidCell(this.rdr.selectedEditFeature.x_pos, this.rdr.selectedEditFeature.y_pos, this.rdr.selectedEditFeature.z_pos - 1)) {
          this.rdr.selectedEditFeature.z_pos -= 1;
          GLM.mat4.translate(this.rdr.selectedEditFeature.modelMatrix, this.rdr.selectedEditFeature.modelMatrix, [0, 0, -1]);
        }
        break;
      default:
        console.error("Unknown direction provided when requesting a feature move.");
    }
   }

   // Add a renderable feature to the renderablefeatures array. This should mirror the super's Feature array. A spot for future improvement.
   addRenderableFeature(rf: RenderableFeature) {
    this.renderableFeatures.push(rf);
   }

   constructor(parentRenderer: Renderer, name: string) {
    super(name);
    this.rdr = parentRenderer;

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

    this.bbVertices = new Float32Array([ // two triangles
      -1.0, -0.15, 0.0,
      1.0, -0.15, 0.0,
      1.0, 0.15, 0.0,
      -1.0, -0.15, 0.0,
      -1.0, 0.15, 0.0,
      1.0, 0.15, 0.0,
    ]);

    // These are as mentioned above. We initialize the WebGL specific ones to null because they need a proper WebGL context first
    this.renderableFeatures = []; // This is variable, start with none

    // Add a floor to the house
    const floorMatrix = GLM.mat4.create();
    GLM.mat4.scale(floorMatrix, floorMatrix, [10, 0.5, 10]); // note implicitly depends on grid size defaulting to 10
    GLM.mat4.translate(floorMatrix, floorMatrix, [0, -0.51, 0]); // The 0.5s account for the difference between the cell center and edges
    const floorFeature = new RenderableFeature("Floor", this.household_id, floorMatrix, FEATURE_GREY, 0, -1, 0); // Set to one below for now (does not coorespond to model matrix) so we don't accidentally delete it
    floorFeature.tasks = []; // reset tasks so no healthbar
    this.addRenderableFeature(floorFeature); // must be the first feature

    // Add walls
    // Left wall
    const leftWallMatrix = GLM.mat4.create();
    GLM.mat4.translate(leftWallMatrix, leftWallMatrix, [-5.25, 1.5, 0])
    GLM.mat4.scale(leftWallMatrix, leftWallMatrix, [0.5, 3, 10.1]); 
    const leftWall = new RenderableFeature("Left Wall", this.household_id, leftWallMatrix, FEATURE_GREY, -5, -1, 0)
    leftWall.tasks = [];
    this.addRenderableFeature(leftWall);

    // Right wall
    const rightWallMatrix = GLM.mat4.create();
    GLM.mat4.translate(rightWallMatrix, rightWallMatrix, [5.25, 1.5, 0])
    GLM.mat4.scale(rightWallMatrix, rightWallMatrix, [0.5, 3, 10.1]); 
    const rightWall = new RenderableFeature("Right Wall", this.household_id, rightWallMatrix, FEATURE_GREY, 5, -1, 0)
    rightWall.tasks = [];
    this.addRenderableFeature(rightWall);

    // Back wall
    const backWallMatrix = GLM.mat4.create();
    GLM.mat4.translate(backWallMatrix, backWallMatrix, [0, 1.5, -5.25])
    GLM.mat4.scale(backWallMatrix, backWallMatrix, [10.1, 3, 0.5]); 
    const backWall = new RenderableFeature("Back Wall", this.household_id, backWallMatrix, FEATURE_GREY, 0, -1, -5)
    backWall.tasks = [];
    this.addRenderableFeature(backWall);

    // Front wall
    const frontWallMatrix = GLM.mat4.create();
    GLM.mat4.translate(frontWallMatrix, frontWallMatrix, [0, 1.5, 5.25])
    GLM.mat4.scale(frontWallMatrix, frontWallMatrix, [10.1, 3, 0.5]); 
    const frontWall = new RenderableFeature("Front Wall", this.household_id, frontWallMatrix, FEATURE_GREY, 0, -1, 5)
    frontWall.tasks = [];
    this.addRenderableFeature(frontWall);

    // We cannot determine the following entries without a gl context
    this.buffer = null;
    this.vao = null;
    this.bbBuffer = null;
    this.bbVao = null;
   }
}

// This is the grid class, used to draw a grid on the screen
export class Grid {
  gridVertices: Float32Array | null; // Store the vertices that make up the grid
  modelMatrx: GLM.mat4; // Store the transform data of the grid
  buffer: WebGLBuffer | null; // Access the GPU buffer where the grid vertex data is uploaded
  vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null; // Store a descriptor of the proper vertex attribute format and related buffer
  width: number;
  height: number;
  material: Material;

  // Store a reference to the parent renderer
  rdr: Renderer

  // For cases where we want to resize the grid
  resize(w: number, h: number) {
    if (w <= 1 || h <= 1) {
      console.error("Invalid grid size given.");
      return;
    }

    // Note: this function should not be called in the render loop
    if (!this.rdr.glRef) {
      console.error("Cannot resize grid without OpenGL context.");
      return;
    }

    // Set member data
    this.width = w;
    this.height = h;
    this.gridVertices = genGrid(this.width, this.height);

    this.rdr.bindVAO(this.vao);
    this.rdr.glRef.bindBuffer(this.rdr.glRef.ARRAY_BUFFER, this.buffer);
    this.rdr.glRef.bufferData(this.rdr.glRef.ARRAY_BUFFER, this.rdr.grid.gridVertices, this.rdr.glRef.STATIC_DRAW); 
    this.rdr.bindVAO(null);
  }

  constructor(parentRenderer: Renderer) {
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

    // Set the renderer
    this.rdr = parentRenderer;
  }
}