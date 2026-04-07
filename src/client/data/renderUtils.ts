/* PROLOGUE
File name: renderUtils.ts
Description: Provide renderer functionality to the application.
Programmer: Jack Bauer
Creation date: 3/29/26
Revision date: 
  - 4/6/26: Convert to use FeatureType enum & support model loading
Preconditions: 
  - A proper draw / render loop is created outside of this file (Renderer does not contain its own loop, instead it has the pieces)
  - For the order of features in a renderable household's renderable features, the following are required:
    --> index 0 being the floor
    --> indices 1-4 being the 4 walls of the house. 
  - The renderer depends on feature data being loaded into it from an external source. 
Postconditions: None
Errors: None
Side effects: API requests may be made to the external server in order to manage the creation, updating, and deletion of features, tasks, and households 
Invariants: See "Constants"
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
import Feature, { FeatureType, getFeatureTypeToString } from "./feature";
import Household from "./household";

// Import graphics utilities
import {
  MoveDirection, Material, genGrid,
  FEATURE_ORANGE, FEATURE_GREY,
  ShaderLightUniformLocations, ShaderBillboardUniformLocations,
  ShaderAttributebLocations, ShaderMatrixUniformLocations,
  MeshManager, VAO, getMeshFromType, VAOManager,
  ShaderProgramManager, SHADER_REGULAR_PATHS, SHADER_BILLBOARD_PATHS,
  SHADER_PICK_PATHS, ShaderPickLocations, RenderPass, resizeFramebufferAttachments,
} from "./graphicsUtils";

// Import API utilities
import { 
  createFeature as apiCreateFeature, deleteFeature as apiDeleteFeature,
  createTask as apiCreateTask
} from "./api";

// ***********************************************************
//                      Constants
// ***********************************************************

// Define the near and far clips for the projection matrix
export const NEAR_CLIP = 0.1;
export const FAR_CLIP = 100.0;

// Define min and max world scaling
const MIN_WORLD_SCALE = 0.1;
const MAX_WORLD_SCALE = 6.0;

// Define the maximum number of attempts before we give up on placing a feature with a bad XYZ position
const MAX_PLACE_ATTEMPTS = 10;

// Radians FOV
export const FOV_RADIANS = (45 * Math.PI / 180);

// ***********************************************************
//                       Renderer Class
// ***********************************************************
// IMPORTANT NOTES:
// -- this class and others depend on feature 0 being the floor, and 1-4 being the 4 walls of the house. 
// -- this class depends on a render loop being defined externally. It only provides the pieces of that loop. 
// -- this class depends on feature data being loaded into it externally. 

// Store details needed for a functional renderer
export class Renderer {
  // Debug
  id: number;

  // Graphical context data
  lastFrameTime: number; // The time since the last frame
  frameId: number | null; // the id of the current frame being drawn
  vaoManager: VAOManager | null; // a wrapper class to help with Vertex Array Object management

  // Renderer data
  glRef: ExpoWebGLRenderingContext | null; // A global way to access the single WebGL context created on launch
  cam: Camera; // Our global camera value
  initialized: boolean;
  currentDrawPass: RenderPass;

  // Draw routine helpers
  inverseView = GLM.mat4.create(); // store our inverse view matrix here to avoid re-creation every frame
  scale = GLM.vec3.create(); // store the current scale of our view matrix

  // Shader data
  attribLocs: ShaderAttributebLocations | null;
  matrixUniformLocs: ShaderMatrixUniformLocations | null;
  lightUniformLocs: ShaderLightUniformLocations | null;
  bbLocs: ShaderBillboardUniformLocations | null;
  pickLocs: ShaderPickLocations | null;

  // Shader program related variables - these manage the GPU pipeline
  mainProgramManager: ShaderProgramManager | null;
  billboardProgramManager: ShaderProgramManager | null;
  pickProgramManager: ShaderProgramManager | null;
  shaderProgram: WebGLProgram | null; // The currently used GPU shader program
  bbShaderProgram: WebGLProgram | null; // The shader program for billboards
  pickProgram: WebGLProgram | null; // the shader program for object picking

  // Application data
  house: RenderableHousehold; // The displayed household 
  selectedEditFeature: RenderableFeature | null; // The current feature being edited in the edit window
  grid: Grid; // Store a global grid object
  currentDrawingColor: Material; // the current color used for drawing our objects
  featuresDirty: boolean; // flag so we know if we need to apply feature updates or not
  features: Feature[]; // store the fetched feature list for our household
  highlightedFeatureID: number | null;

  // Model data
  meshManager: MeshManager | null;

  // Other pick object data
  targetTexture: WebGLTexture | null;
  depthBuffer: WebGLRenderbuffer | null;
  frameBuffer: WebGLFramebuffer | null;

  ///////////////////////
  ///  Init Routines  ///
  ///////////////////////

  // Called to load the needed features from an external database. Once they've been fetched, we call this method to 
  // apply the updated list. 
  setFeatures(householdID: number, features: Feature[]) {
    this.featuresDirty = true; // mark the feature list as dirty so we know to update before drawing next
    this.features = []; // empty the features array
    features.forEach((f) => {this.features.push(f)}) // manually copy the features over
    this.house.household_id = householdID; // NOTE: at some point we need to get all the household details
    this.house.id = householdID; // for compatability
  }

  setHighlightedFeature(id: number) {
    // Don't include the walls
    if (id >= 0) {
      this.highlightedFeatureID = id;
    } else {
      this.highlightedFeatureID = null;
    }
  }

  // Called when a GL context is created - NOT at construction time. 
  async init(gl: ExpoWebGLRenderingContext) {
    // Setup our graphical VAO manager
    this.vaoManager = new VAOManager(gl);

    // Reset everything so it works when navigating back to the graphics page. Descriptions are above.
    this.glRef = gl;
    this.lastFrameTime = 0;
    this.shaderProgram = null; // I don't think this causes a memory leak as Expo should clean up resources on unmount
    this.bbShaderProgram = null;

    // Only update these if we have to
    if (!this.house) {
      this.house = new RenderableHousehold(this, "RENDERER_HOUSE_2");
      this.grid = new Grid(this);
    }

    // This needs to be updated to reset the camera
    this.cam = new Camera();
    
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


    // Read the text of the shader files. We later pass shader data as a string, so we need the actual shader files in a 
    // string representation for later use. We still split them into their own files though because it's easier to manage.
    // Setup shader programs
    this.mainProgramManager = new ShaderProgramManager(gl, SHADER_REGULAR_PATHS);
    await this.mainProgramManager.loadAndLinkShaders();
    this.shaderProgram = this.mainProgramManager.getProgram();
    
    this.billboardProgramManager = new ShaderProgramManager(gl, SHADER_BILLBOARD_PATHS);
    await this.billboardProgramManager.loadAndLinkShaders();
    this.bbShaderProgram = this.billboardProgramManager.getProgram();

    this.pickProgramManager = new ShaderProgramManager(gl, SHADER_PICK_PATHS);
    await this.pickProgramManager.loadAndLinkShaders();
    this.pickProgram = this.pickProgramManager.getProgram();

    // Get attribute and uniform location information for the shader program. Essentially, this is get references to location information
    // so we can upload data to the GPU for shaders to use. Here, we deal with both attributes and uniforms. Uniforms are variables that are the same
    // for all instances of the shader being run (as shaders are run in parallel) although they may change frame to frame. Attributes are pieces
    // of data that are usually given in vertex data. For example, above with our cubes we provide both position and normal data. Position would
    // be one attribute, normals would be another. 
    this.attribLocs = {
      // We need to figure out where these attributes are being stored on the GPU.
      vertLoc: gl.getAttribLocation(this.shaderProgram, "aVertPos"),
      normalLoc: gl.getAttribLocation(this.shaderProgram, "aNormal"),
      texLoc: gl.getAttribLocation(this.shaderProgram, "aTexCoord")
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
    this.pickLocs = {
      position: gl.getAttribLocation(this.pickProgram, "aPosition"),
      model: gl.getUniformLocation(this.pickProgram, "uModelMatrix"),
      view: gl.getUniformLocation(this.pickProgram, "uViewMatrix"),
      projection: gl.getUniformLocation(this.pickProgram, "uProjMatrix"),
      objectID: gl.getUniformLocation(this.pickProgram, "objectID"),
      colorMult: gl.getUniformLocation(this.shaderProgram, "uColorMult"),
    }

    // Load our models async. Will update the meshMap, VAOs, and prepare them all for drawing
    this.meshManager = new MeshManager(gl, this.vaoManager);
    await this.meshManager.initialize(this.attribLocs, this.pickLocs);

    // Setup our vertex buffer and attribute informations. This is how we know what information is stored where. 
    // Attributes are explained above. Basically, we send our vertex data to the GPU by storing it in a buffer. We also have to tell
    // the GPU how to interpret this data, as each vertex might contain different sets of data. For our cube, we store, for each vertex, 
    // 3 floats of position data and 3 floats of normal data. So, we set this attribute information and ultimately store it all in a Vertex Array
    // Object or VAO. This VAO allows us to easily load in our settings for the cube and switch out for a different configuration when we want to 
    // render the grid. 
    this.house.buffer = gl.createBuffer();
    this.house.vao = this.vaoManager.createVAO();
    this.vaoManager.bindVAO(this.house.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.house.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.house.blockVertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.attribLocs.vertLoc);
    gl.vertexAttribPointer(this.attribLocs.vertLoc, 3, gl.FLOAT, false, 6 * 4, 0); // 4 bytes per float * 6 floats stored per vertex = 24 bytes per vertex
    gl.enableVertexAttribArray(this.attribLocs.normalLoc);
    gl.vertexAttribPointer(this.attribLocs.normalLoc, 3, gl.FLOAT, false, 6 * 4, 4 * 3); // 4 bytes per float * 3 floats before we get to our first set of normal data
    gl.disableVertexAttribArray(this.attribLocs.texLoc);
    gl.vertexAttrib2f(this.attribLocs.texLoc, 0.0, 0.0);
    gl.enableVertexAttribArray(this.pickLocs.position);
    gl.vertexAttribPointer(this.pickLocs.position, 3, gl.FLOAT, false, 6 * 4, 0);
    this.vaoManager.bindVAO(null);

    // Do the same for billboards
    this.house.bbBuffer = gl.createBuffer();
    this.house.bbVao = this.vaoManager.createVAO();
    this.vaoManager.bindVAO(this.house.bbVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.house.bbBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.house.bbVertices, gl.STATIC_DRAW);
    gl.vertexAttribPointer(this.bbLocs.pos, 3, gl.FLOAT, false, 3 * 4, 0);
    gl.enableVertexAttribArray(this.bbLocs.pos);
    this.vaoManager.bindVAO(null);

    // Do the same as above, but for the grid vertices. Note that we disable the normal attribute and default it to (0, 1, 0) always since we don't 
    // store normal data with our vertices. We'll wrap this up in another VAO for ease of use. Skip this is we have no grid vertices
    if (this.grid !== null && this.grid.gridVertices !== null) {
      const gridBuffer = gl.createBuffer();
      const gridVao = this.vaoManager.createVAO();
      this.vaoManager.bindVAO(gridVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.grid.gridVertices, gl.STATIC_DRAW); 
      gl.vertexAttribPointer(this.attribLocs.vertLoc, 3, gl.FLOAT, false, 3 * 4, 0);
      gl.enableVertexAttribArray(this.attribLocs.vertLoc);
      gl.disableVertexAttribArray(this.attribLocs.normalLoc);
      gl.vertexAttrib3f(this.attribLocs.normalLoc, 0, 1, 0);

      // Set these afterwards for safety in case there's anything funky going on with the grid object
      this.grid.vao = gridVao;
      this.grid.buffer = gridBuffer;
      this.vaoManager.bindVAO(null);
    } else {
      console.log("Skipping grid configuration.");
    }

    // Prepare pick object pass
    this.targetTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.targetTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Create buffers to store our side render
    this.depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
    resizeFramebufferAttachments(gl, this.targetTexture, this.depthBuffer, 1, 1); // we'll use a 1x1 pixel texture to render to
    this.frameBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
    // attach to texture
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.targetTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthBuffer);

    // Select our shader program to use for the rest of initialization
    gl.useProgram(this.shaderProgram);

    // Set up our perspective matrix
    GLM.mat4.perspective(this.cam.projectionMatrix, FOV_RADIANS, gl.drawingBufferWidth / gl.drawingBufferHeight, NEAR_CLIP, FAR_CLIP);
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
    // Set for debug
    this.id = Math.round(Math.random() * 10000);

    // These values must be set on context create (not during construction)
    this.glRef = null;
    this.shaderProgram = null;
    this.bbShaderProgram = null;
    this.pickProgram = null;
    this.lightUniformLocs = null;
    this.bbLocs = null;
    this.matrixUniformLocs = null;
    this.attribLocs = null;
    this.pickLocs = null;
    this.mainProgramManager = null;
    this.billboardProgramManager = null;
    this.pickProgramManager = null;
    this.meshManager = null;
    this.vaoManager = null;
    this.targetTexture = null;
    this.depthBuffer = null;
    this.frameBuffer = null;
    this.highlightedFeatureID = null;

    // These can safely be set at construction time
    this.grid = new Grid(this);
    this.house = new RenderableHousehold(this, "RENDERER_HOUSE_1");
    this.cam = new Camera();
    this.lastFrameTime = 0;
    this.currentDrawingColor = FEATURE_ORANGE;
    this.initialized = false;
    this.features = [];
    this.featuresDirty = false;
    this.currentDrawPass = RenderPass.MAIN;

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
      // If position is conflicting, find a new position (NOTE: this is not ideal behavior, likely should have different approach)
      let attempts = 0;
      while (!this.checkValidCell(f.x_pos, f.y_pos, f.z_pos)) {
        // Get a new position
        console.warn("Adjusting feature position due to conflict. Attempt:", attempts);
        f.x_pos = Math.floor(Math.random() * this.grid.width - this.grid.width / 2);
        f.z_pos = Math.floor(Math.random() * this.grid.height - this.grid.height / 2);

        // Ensure we don't try too hard placing the feature
        attempts += 1;
        if (attempts > MAX_PLACE_ATTEMPTS) {
          console.error("Too many attempts placing a feature. Giving up.");
          return;
        }
      }

      // Prepare the appropriate model matrix
      const transform = GLM.mat4.create();
      GLM.mat4.translate(transform, transform, [f.x_pos + 0.5, f.y_pos + 0.5, f.z_pos + 0.5]); // The 0.5s account for the difference between the cell center and edges

      // Select the correct material
      let mat = FEATURE_ORANGE;

      // Create the feature for rendering
      const rf = new RenderableFeature(f.name, f.household_id, f.id, transform, mat, f.x_pos, f.y_pos, f.z_pos, f.tasks, f.feature_type, f.icon);
      this.house.renderableFeatures.push(rf); // add to RenderableFeatures
    });

    // Done with update routine
    this.featuresDirty = false;
    console.log("Features updated.");
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

    // Ensure we have a VAO Manager, if not error and return
    if (!this.vaoManager) {
      console.error("Frame drawn without a VAO manager");
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
    if (!this.glRef || !this.matrixUniformLocs || !this.matrixUniformLocs.viewMatrix || !this.pickLocs || !this.pickLocs.view) {
      console.error("Unable to set view matrix.");
      return;
    }

    // Update
    if (this.currentDrawPass === RenderPass.MAIN) {
      this.glRef.uniformMatrix4fv(this.matrixUniformLocs.viewMatrix, false, this.cam.viewMatrix as Float32Array); // Upload this new model matrix for drawing
    } else if (this.currentDrawPass === RenderPass.PICK_OBJECT) {
      this.glRef.uniformMatrix4fv(this.pickLocs.view, false, this.cam.viewMatrix as Float32Array); // Upload this new model matrix for drawing
    }
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
      || !this.lightUniformLocs.material.ambient || !this.lightUniformLocs.material.diffuse || !this.lightUniformLocs.material.specular 
      || !this.lightUniformLocs.material.shininess || !this.meshManager || !this.vaoManager || !this.pickLocs) {
      console.error("Not ready to draw features.");
      return;
    }
    const gl = this.glRef;

    // Iterate through all cubes making up our model and draw them each
    for (let i = 0; i < this.house.renderableFeatures.length; i++) {
      const f = this.house.renderableFeatures[i];
      const fVao = !f.mesh ? this.house.vao : this.meshManager.getVaoForMesh(f.mesh); 

      if (!f.visible) {
        // Skip invisible features
        continue;
      }

      this.vaoManager.bindVAO(fVao); // bind the appropriate VAO

      // Update uniforms and draw
      if (this.currentDrawPass === RenderPass.MAIN) {
        // Normal object uniform updates
        gl.uniformMatrix4fv(this.matrixUniformLocs.modelMatrix, false, this.house.renderableFeatures[i].modelMatrix as Float32Array); // upload the correct model matrix for drawing
        gl.uniform3fv(this.lightUniformLocs.material.ambient, this.house.renderableFeatures[i].material.ambient); // update lighting uniform values for the material of the object
        gl.uniform3fv(this.lightUniformLocs.material.diffuse, this.house.renderableFeatures[i].material.diffuse);
        gl.uniform3fv(this.lightUniformLocs.material.specular, this.house.renderableFeatures[i].material.specular);
        gl.uniform1f(this.lightUniformLocs.material.shininess, this.house.renderableFeatures[i].material.shininess);
        
        // Setup the color multiplier if this object was picked
        if (f.id === this.highlightedFeatureID) {
          gl.uniform3fv(this.pickLocs.colorMult, [0.5, 0.5, 0.5]);
        } else {
          gl.uniform3fv(this.pickLocs.colorMult, [1.0, 1.0, 1.0]);
        }

      } else if (this.currentDrawPass === RenderPass.PICK_OBJECT) {
        gl.uniformMatrix4fv(this.pickLocs.model, false, this.house.renderableFeatures[i].modelMatrix as Float32Array); // upload the correct model matrix for drawing
        gl.uniformMatrix4fv(this.pickLocs.view, false, this.cam.viewMatrix as Float32Array); // upload the correct view matrix for drawing
        gl.uniformMatrix4fv(this.pickLocs.projection, false, this.cam.pixelPickFrustrum as Float32Array); // upload the correct projection matrix for drawing

        // See here: https://webglfundamentals.org/webgl/lessons/webgl-picking.html for more information
        // We split the objectID across 4 channels in order to support more objects than 256
        const encodedColor = [
          ((f.id >> 0) & 0xFF) / 0xFF,
          ((f.id >> 8) & 0xFF) / 0xFF,
          ((f.id >> 16) & 0xFF) / 0xFF,
          ((f.id >> 24) & 0xFF) / 0xFF,
        ];
        gl.uniform4fv(this.pickLocs.objectID, encodedColor);
      }
      else {
        console.error("Invalid render pass.");
        return;
      }

      // draw a mesh, or if no mesh exists draw a cube
      if (!f.mesh || f.mesh === "") {
        gl.drawArrays(gl.TRIANGLES, 0, 36); // One draw call to the GPU. Our cube has 6 faces, and each face has two triangles, which yields 6 faces * 6 vertices for 36 vertices to draw.
      } else {
        this.meshManager.drawMesh(f.mesh);
      }
    }

    this.vaoManager.bindVAO(null); // reset state
  }

  // Draw the grid
  drawGrid() {
    // Skip for non-main renders
    if (this.currentDrawPass !== RenderPass.MAIN) {
      return;
    }

    // Ensure we're ready to draw
    if (!this.glRef || !this.matrixUniformLocs || !this.matrixUniformLocs.modelMatrix || !this.lightUniformLocs || !this.lightUniformLocs.material.ambient 
      || !this.lightUniformLocs.material.diffuse || !this.lightUniformLocs.material.shininess || !this.lightUniformLocs.material.specular || !this.pickLocs) {
        console.error("Not ready to draw grid.");
        return;
    }
    const gl = this.glRef;

    gl.uniform3fv(this.pickLocs.colorMult, [1.0, 1.0, 1.0]); // reset to normal color multiplier

    // Use our grid vertex configuration, upload the grid's model matrix to the vertex shader, and then draw a line. Each line has two vertices. 
    // Only draw if we have a proper grid setup
    if (this.grid !== null && this.grid.vao !== null && this.grid.buffer !== null && this.grid.gridVertices !== null && this.vaoManager !== null) {
      this.vaoManager.bindVAO(this.grid.vao);
      gl.uniformMatrix4fv(this.matrixUniformLocs.modelMatrix, false, this.grid.modelMatrx as Float32Array);
      gl.uniform3fv(this.lightUniformLocs.material.ambient, this.grid.material.ambient); // update lighting uniform values for the material of the object
      gl.uniform3fv(this.lightUniformLocs.material.diffuse, this.grid.material.diffuse);
      gl.uniform3fv(this.lightUniformLocs.material.specular, this.grid.material.specular);
      gl.uniform1f(this.lightUniformLocs.material.shininess, this.grid.material.shininess);
      gl.drawArrays(gl.LINES, 0, 2 * (this.grid.width + this.grid.height + 2)); // Lines are 1 pixel thick by default. Two vertices per line. Two more lines to close the grid.
      this.vaoManager.bindVAO(null);
    }
  }

  // Draw health bars for features
  drawHealthbars() {
    // Skip for non-main renders
    if (this.currentDrawPass !== RenderPass.MAIN) {
      return;
    }

    // Ensure ready to draw
    if (!this.glRef || !this.bbLocs || !this.vaoManager) {
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
      this.vaoManager.bindVAO(this.house.bbVao);
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

  // Switch which pass we're rendering
  switchRenderpass(pass: RenderPass) {
    if (!this.glRef || !this.vaoManager) {
      console.error("Can't switch render pass without a GL context.");
      return;
    }
    const gl = this.glRef;

    // Reset state
    this.vaoManager.bindVAO(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Make the switch
    switch (pass) {
      case RenderPass.MAIN:
        this.currentDrawPass = RenderPass.MAIN;
        gl.useProgram(this.shaderProgram);
        break;
      case RenderPass.PICK_OBJECT:
        this.currentDrawPass = RenderPass.PICK_OBJECT;
        gl.useProgram(this.pickProgram);
        gl.bindTexture(gl.TEXTURE_2D, this.targetTexture);
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
        break;
    }
  }

  // A function to add a block to the household at a certain position
  async addBlock(cellX: number, cellY: number, cellZ: number) {
    // Ensure our cell position is in bounds
    if (!this.checkCellInBounds(cellX, cellY, cellZ)) {
      return;
    }

    // Ensure we haven't already placed a block here. If we have, remove it 
    const cellFree = await this.checkValidCellAndRemove(cellX, cellY, cellZ);
    if (!cellFree) {
      return;
    }

    // Create the transform
    const newModelMatrix = GLM.mat4.create(); // create a new transform 
    GLM.mat4.translate(newModelMatrix, newModelMatrix, [cellX + 0.5, cellY + 0.5, cellZ + 0.5]); // The 0.5s account for the difference between the cell center and edges

    // Create the material / type
    const newMaterial: Material = this.currentDrawingColor;

    // Get the correct type
    const featureIndex = Math.max(Math.abs(Math.round(((Math.random() * 10) % (Object.keys(FeatureType).length / 2) - 1))), 1); // count the number possible enum values (will not include undefined)

    // Create the feature object
    const newFeature = new RenderableFeature("f:" + cellX + cellY + cellZ, this.house.household_id, 0, newModelMatrix, newMaterial, cellX, cellY, cellZ, undefined, featureIndex); // this is the new feature object we're adding
    // randomly add a second chore for demo purposes
    if (Math.round(Math.random()) == 0) {
      newFeature.addTask(new Task("Test Task", newFeature.id, 1));
    } else {
      newFeature.addTask(new Task("Test Task", newFeature.id, 1));
      newFeature.addTask(new Task("Test Task", newFeature.id, 2));
    }

    // Update the remote server
    try {
      // Create the feature on the server
      const featureID = await apiCreateFeature({
        household_id: this.house.household_id,
        feature_name: "f:" + cellX + cellY + cellZ,
        x_pos: cellX,
        y_pos: cellY,
        z_pos: cellZ,
        feature_type: getFeatureTypeToString(featureIndex)
      });
      newFeature.setID(featureID.feature_id); // retroactively set the appropriate ID

      // Now create the tasks on the server
      newFeature.tasks.forEach((t) => {
        const now = new Date();
        apiCreateTask({
          feature_id: featureID.feature_id,
          task_name: "No name yet",
          frequency_days: 1, // Default to daily task
          visibility: "household",
          last_completed: now.toISOString(), 
        }).then((id) => {
          // Update task ids
          t.id = id.task_id;
          t.last_completed = now;
        }).catch((e) => {
          console.error("Unable to add task.", e);
        })});

      // If the remote server was successful, add the feature for drawing
      this.house.renderableFeatures.push(newFeature); // add the feature to the house
    } catch (e) {
      console.error(`Unable to create feature for household ${this.house.household_id}.`, e);
    }
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
  async checkValidCellAndRemove(cellX: number, cellY: number, cellZ: number) {
    // copy array to new array, without the removed element. We'll do this as we iterate. If we find one to remove, set the result bool

    /* 
      Cases: 
        - Case 1: the cell is occupied and we successfully delete it (feature array changes) - we do not want to add a feature in addBlock
            --> cellFree = false, removed = true
        - Case 2: the cell is occupied and we fail to delete it (features do not change) - we do not want to add a feature in addBlock
            --> cellFree = false, removed = false
        - Case 3: the cell is not occupied so we don't delete anything (features do not change) - we add a feature in addBlock
            --> cellFree = true, removed = false
    */

    let cellFree = true;  // Have we found a feature in this cell? If the caller is addBlock, then it will not add anything assuming we have removed a block. 
    let removed = false; // Have we removed a block? If so, we need to copy over the new features array. If not, then an error likely occurred and we keep the same array. 
    let copyArray = [];  // Store the copy array we will build up

    for (let i = 0; i < this.house.renderableFeatures.length; i++) {
      const f = this.house.renderableFeatures[i];

      // Note: only applies to the first found feature in a location (there should only ever be one)
      if (cellFree && f.x_pos == cellX && f.y_pos == cellY && f.z_pos == cellZ) {
        // We've found a feature not to keep
        cellFree = false;
        try {
          // Delete on the server
          await apiDeleteFeature(f.id);
          removed = true;
        } catch (e) {
          // Note, if we fail we don't need to copy the feature over because we're not updating the feature array anyway
          console.error(`Failed to delete feature. Canceling deletion for feature ${f.id} in household ${this.house.household_id}.`, e);
          console.log("Corresponding feature:", f);
        } 
      } else {
        // We've found a feature we want to keep
        copyArray.push(f);
      }
    }

    // update house array if we have removed an object
    if (removed) {
      this.house.renderableFeatures = copyArray;
    }
    
    // Returns true if we have not found an object (the cell is valid), and false otherwise
    return cellFree;
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
  pixelPickFrustrum: GLM.mat4;

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
    this.pixelPickFrustrum = GLM.mat4.create();
  }
}

// Extended Feature class for 3D rendering
export class RenderableFeature extends Feature {
   modelMatrix: GLM.mat4; // The transform of the feature in the world
   material: Material; // How the feature looks materially
   visible: boolean;
   mesh: string | undefined; // if null, draw a cube

   constructor(name: string, household_id: number, feature_id: number, mm?: GLM.mat4, mat?: Material, x?: number, y?: number, z?: number, tasks?: Task[], type?: FeatureType, icon?: string, ) {
    super(name, household_id, type, x, y, z, feature_id, icon);

    // Set up mesh if a type is provided
    this.mesh = !type ? undefined : getMeshFromType(type);

    // Assign model matrix to either a provided value or a default
    this.modelMatrix = mm || GLM.mat4.create();

    // Do the same for the material (basically what should the object look like color-wise).
    this.material = mat || FEATURE_ORANGE;

    // Add chore list
    this.tasks = tasks || [];

    // Defaults to origin in super if not provided (note: assumes valid input)
    this.x_pos = x || 0;
    this.y_pos = y || 0;
    this.z_pos = z || 0;

    // Default to visibile
    this.visible = true;
   }

   setID(id: number) {
    this.id = id;
   }
}

// This is the household class. It is meant to be the primary way to store and access the currently rendered house model
export class RenderableHousehold extends Household {
   // A series of relevant variables to render the household on the screen.
   blockVertices: Float32Array; // The vertices that make up a cube (including the normals of each face)
   renderableFeatures: RenderableFeature[]; // The list of feature objects in our household
   buffer: WebGLBuffer | null; // A way to access the buffer storing cube vertex data on the GPU
   vao: VAO; // A single object to store the vertex attribute data and which buffer to bind for the household

   // Billboard related values
   bbBuffer: WebGLBuffer | null; // A way to access the buffer storing cube vertex data on the GPU
   bbVertices: Float32Array; // The vertices of the billboard quad
   bbVao: VAO; // A single object to store the vertex attribute data and which buffer to bind for the household

   // Active renderer
   rdr: Renderer;

   // change the size of the floor feature to match the grid
   resizeFloorFeature() {
    // floor feature is always the first feature in the features array
    const floorMatrix = GLM.mat4.create();
    GLM.mat4.scale(floorMatrix, floorMatrix, [this.rdr.grid.width, 0.5, this.rdr.grid.height]);
    GLM.mat4.translate(floorMatrix, floorMatrix, [0, -0.51, 0]); // The 0.5s account for the difference between the cell center and edges
    const floorFeature = new RenderableFeature("Floor", this.household_id, 0, floorMatrix, FEATURE_GREY, 0, -1, 0); // Set to one below for now (does not coorespond to model matrix) so we don't accidentally delete it
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
    const floorFeature = new RenderableFeature("Floor", this.household_id, -1, floorMatrix, FEATURE_GREY, 0, -1, 0); // Set to one below for now (does not coorespond to model matrix) so we don't accidentally delete it
    this.addRenderableFeature(floorFeature); // must be the first feature

    // Add walls
    // Left wall
    const leftWallMatrix = GLM.mat4.create();
    GLM.mat4.translate(leftWallMatrix, leftWallMatrix, [-5.25, 1.5, 0])
    GLM.mat4.scale(leftWallMatrix, leftWallMatrix, [0.5, 3, 10.1]); 
    const leftWall = new RenderableFeature("Left Wall", this.household_id, -2, leftWallMatrix, FEATURE_GREY, -5, -1, 0)
    this.addRenderableFeature(leftWall);

    // Right wall
    const rightWallMatrix = GLM.mat4.create();
    GLM.mat4.translate(rightWallMatrix, rightWallMatrix, [5.25, 1.5, 0])
    GLM.mat4.scale(rightWallMatrix, rightWallMatrix, [0.5, 3, 10.1]); 
    const rightWall = new RenderableFeature("Right Wall", this.household_id, -3, rightWallMatrix, FEATURE_GREY, 5, -1, 0)
    this.addRenderableFeature(rightWall);

    // Back wall
    const backWallMatrix = GLM.mat4.create();
    GLM.mat4.translate(backWallMatrix, backWallMatrix, [0, 1.5, -5.25])
    GLM.mat4.scale(backWallMatrix, backWallMatrix, [10.1, 3, 0.5]); 
    const backWall = new RenderableFeature("Back Wall", this.household_id, -4, backWallMatrix, FEATURE_GREY, 0, -1, -5)
    this.addRenderableFeature(backWall);

    // Front wall
    const frontWallMatrix = GLM.mat4.create();
    GLM.mat4.translate(frontWallMatrix, frontWallMatrix, [0, 1.5, 5.25])
    GLM.mat4.scale(frontWallMatrix, frontWallMatrix, [10.1, 3, 0.5]); 
    const frontWall = new RenderableFeature("Front Wall", this.household_id, -5, frontWallMatrix, FEATURE_GREY, 0, -1, 5)
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
  vao: VAO; // Store a descriptor of the proper vertex attribute format and related buffer
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
    if (!this.rdr.glRef || !this.rdr.vaoManager) {
      console.error("Cannot resize grid without OpenGL context.");
      return;
    }

    // Set member data
    this.width = w;
    this.height = h;
    this.gridVertices = genGrid(this.width, this.height);

    this.rdr.vaoManager.bindVAO(this.vao);
    this.rdr.glRef.bindBuffer(this.rdr.glRef.ARRAY_BUFFER, this.buffer);
    this.rdr.glRef.bufferData(this.rdr.glRef.ARRAY_BUFFER, this.rdr.grid.gridVertices, this.rdr.glRef.STATIC_DRAW); 
    this.rdr.vaoManager.bindVAO(null);
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