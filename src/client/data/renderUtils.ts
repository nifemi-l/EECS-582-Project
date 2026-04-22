/* PROLOGUE
File name: renderUtils.ts
Description: Provide renderer functionality to the application.
Programmer: Jack Bauer
Creation date: 3/29/26
Revision date: 
  - 4/6/26: Convert to use FeatureType enum & support model loading
  - 4/15/26: Add support for scaling, rotating, and moving features. Also rooms
  - 4/16/26: Connect edit menu to database
  - 4/18/26: Highlight selected task and health bar
  - 4/20/26: Add inventory bar to manage adding features to the graphical view and related integration
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
  MeshManager, VAO, VAOManager, getFeatureTypeFromIcon,
  ShaderProgramManager, SHADER_REGULAR_PATHS, SHADER_BILLBOARD_PATHS,
  SHADER_PICK_PATHS, ShaderPickLocations, RenderPass, resizeFramebufferAttachments,
} from "./graphicsUtils";

// Import API utilities
import { 
  createFeature as apiCreateFeature, deleteFeature as apiDeleteFeature,
  createTask as apiCreateTask, updateFeature as apiUpdateFeature,
  clearFeaturePosition as apiClearFeaturePosition,
} from "./api";
import { HouseholdRoom } from './room';

// ***********************************************************
//                      Constants
// ***********************************************************

// Define the near and far clips for the projection matrix
export const NEAR_CLIP = 0.1;
export const FAR_CLIP = 100.0;

// Define min and max world scaling
const MIN_WORLD_SCALE = 0.1;
const MAX_WORLD_SCALE = 6.0;
const MIN_FEATURE_SCALE = 0.5;
const MAX_FEATURE_SCALE = 2;

// Radians FOV
export const FOV_RADIANS = (45 * Math.PI / 180);

// Define a magic invalid room ID. They should only be positive
export const UNASSIGNED_ROOM_ID = -1024;

// An identifier to store a room id for the unassigned tasks.
// This primarily helps us maintain array logic
const UNASSIGNED_ROOM_OBJ: HouseholdRoom = {
  room_id: UNASSIGNED_ROOM_ID,
  household_id: -1,
  room_name: "Unassigned",
  accent_color: null
};

// An identifier for an invalid task name. If changing, note backwards compatability
export const INVALID_TASK_NAME = "No name yet";

// Colors for the healthbar - vec4 from 0 to 1 with RGBA
const HEALTHBAR_FILL_COLOR: GLM.vec4 = GLM.vec4.fromValues(0.0, 1.0, 0.0, 1.0);
const HEALTHBAR_BACKGROUND_COLOR: GLM.vec4 = GLM.vec4.fromValues(1.0, 0.0, 0.0, 1.0);
const HEALTHBAR_HIGHLIGHT_COLOR: GLM.vec4 = GLM.vec4.fromValues(1.0, 215/255, 0.0, 1.0);

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
  grid: Grid; // Store a global grid object
  currentDrawingColor: Material; // the current color used for drawing our objects
  featuresDirty: boolean; // flag so we know if we need to apply feature updates or not
  features: Feature[]; // store the fetched feature list for our household
  unplacedFeatures: Feature[]; // store an array of features that do not yet have coordinate values
  highlightedFeatureID: number | null; // which feature the user's mouse is hovering over
  currentViewingRoom: number; // which room of the household we're currently viewing
  roomList: HouseholdRoom[]; // the list of current rooms for the household

  // UI managed state variables
  selectedEditFeature: RenderableFeature | null; // The current feature being edited in the edit window
  selectedEditTask: Task | null; // the currently selected UI task
  selectedPlaceFeature: Feature | null; // The current feature waiting to be placed 

  // Callback functions
  syncUnplacedFeatures: (unplacedFeatureList: Feature[]) => void;
  clearSelectedPlaceFeature: () => void;

  // Model data
  meshManager: MeshManager | null;

  // Other pick object data
  targetTexture: WebGLTexture | null;
  depthBuffer: WebGLRenderbuffer | null;
  frameBuffer: WebGLFramebuffer | null;

  ///////////////////////
  ///  Init Routines  ///
  ///////////////////////

  // Setup the callback link from renderer to graphics. This must be called before we can actually sync updtates to graphics
  setUnplacedFeatureCallback(callback: (unplacedFeatueList: Feature[]) => void) {
    this.syncUnplacedFeatures = callback;
  }

  // Setup the callback to clear the selectedPlace feature in graphics
  setClearSelectedPlaceFeatureCallback(callback: () => void) {
    this.clearSelectedPlaceFeature = callback;
  }

  // Called to load the needed features from an external database. Once they've been fetched, we call this method to 
  // apply the updated list. 
  setFeatures(householdID: number, features: Feature[], ) {
    // Prepare features
    this.featuresDirty = true; // mark the feature list as dirty so we know to update before drawing next
    this.features = []; // empty the features array
    this.unplacedFeatures = []; // empty the unplaced features array
    let unassignedRoomEnabled = false; // flag if we've had to do this or not yet
    features.forEach((f) => {
      // figure out if we need to enable the unassigned room
      if (!unassignedRoomEnabled && f.room_id === null) {
        console.warn("Unassigned feature(s) found.");
        this.enableUnassignedRoom(); // if we find any features with null room ids, we need to allow the use of the unassigned room
        unassignedRoomEnabled = true;
      }

      // Figure out if the feature has not been placed yet
      if ((f.x_pos === null) || (f.y_pos === null) || (f.z_pos === null)) {
        console.warn("Unplaced feature.");
        this.unplacedFeatures.push(f); // if not, add it to the appropriate list
      } else {
        // Otherwise, add it to our features list
        this.features.push(f)
      }
    }); // manually copy the features over
    this.house.household_id = householdID; // Set household ID
    this.house.id = householdID; // for compatability

    // Finally, sync the unplaced feature list
    this.syncUnplacedFeatures(this.unplacedFeatures);
  }

  setRooms(rooms: HouseholdRoom[]) {
    // Now prepare rooms
    this.roomList = [];
    rooms.forEach((r) => {this.roomList.push(r)});
  }

  // Set which feature the mouse is currently hovering over
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
      fillColor: gl.getUniformLocation(this.bbShaderProgram, "uFillColor"),
      backgroundColor: gl.getUniformLocation(this.bbShaderProgram, "uBackgroundColor"),
      highlightColor: gl.getUniformLocation(this.bbShaderProgram, "uHighlightColor"),
      selected: gl.getUniformLocation(this.bbShaderProgram, "uSelected"),
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
    this.unplacedFeatures = [];
    this.featuresDirty = false;
    this.currentDrawPass = RenderPass.MAIN;
    this.currentViewingRoom = 0;
    this.roomList = [];
    this.selectedEditTask = null;
    this.selectedPlaceFeature = null;

    // Set callbacks
    this.syncUnplacedFeatures = () => {};
    this.clearSelectedPlaceFeature = () => {};

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
      const yRot = GLM.quat.create();
      GLM.quat.fromEuler(yRot, 0, f.rotation_y, 0);
      GLM.mat4.fromRotationTranslationScale(transform, yRot, [f.x_pos, f.y_pos, f.z_pos], [f.scale, f.scale, f.scale]);

      // Select the correct material
      let mat = FEATURE_ORANGE;

      // Create the feature for rendering
      const rf = new RenderableFeature(f.name, f.household_id, f.id, transform, mat, f.x_pos, f.y_pos, f.z_pos, f.tasks, f.feature_type, f.icon, f.room_id, f.scale, f.rotation_y);
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

      if (!f.visible) {continue;} // Skip invisible features always

      if (f.room_id !== this.currentViewingRoom) {
        if (i < 5) {
          // The first four features are always the walls and floor, we render them
        } else if (f.room_id === null && this.currentViewingRoom === UNASSIGNED_ROOM_ID) {
          // If the room id is unassigned, and we're in the unassigned room, then render
        } else {
          // Otherwise, we do not render
          continue;
        }
      }
      // At this point, the feature must satisfy the following conditions to be rendered:
      // - be visible AND (
      // - have a room id matching the current room
      // - OR (be a wall/floor element OR (be unassigned AND the current room is unassigned)))

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
      // instead of calculating a ton of times in the vertex shader. Also set highlight uniforms since they apply to all health bars drawn
      gl.uniformMatrix4fv(this.bbLocs.projection, false, this.cam.projectionMatrix as Float32Array);
      gl.uniformMatrix4fv(this.bbLocs.view, false, this.cam.viewMatrix as Float32Array);
      gl.uniformMatrix4fv(this.bbLocs.inverseView, false, this.inverseView as Float32Array);
      gl.uniform4fv(this.bbLocs.fillColor, HEALTHBAR_FILL_COLOR);
      gl.uniform4fv(this.bbLocs.backgroundColor, HEALTHBAR_BACKGROUND_COLOR);
      gl.uniform4fv(this.bbLocs.highlightColor, HEALTHBAR_HIGHLIGHT_COLOR);
      // Now iterate through
      for (let i = 0; i < this.house.renderableFeatures.length; i++) {
        // Skip if we're not displaying feature because it isn't in the current room
        if ((this.house.renderableFeatures[i].room_id !== this.currentViewingRoom)) {
          if (this.house.renderableFeatures[i].room_id === null && this.currentViewingRoom === UNASSIGNED_ROOM_ID) {
            // Allow drawing health bars for features when the id is null and the room is UNASSIGNED
          } else {
            // Otherwise skip
            continue;
          }
        }

        // See the model matrix of the feature that is the same for all tchores of that feature
        gl.uniformMatrix4fv(this.bbLocs.model, false, this.house.renderableFeatures[i].modelMatrix as Float32Array);

        // If our feature is selected, we want to show all of the healthbars. If it isn't we only show the worst one. 
        if (this.house.renderableFeatures[i] === this.selectedEditFeature) {
          for (let j = 0; j < this.house.renderableFeatures[i].tasks.length; j++) {
            // Set per health bar uniforms
            gl.uniform1f(this.bbLocs.heightOffset, 0.8 + (j + 1) * 0.4); // Add an offset per chore bar
            gl.uniform1f(this.bbLocs.healthPercent, this.house.renderableFeatures[i].tasks[j].getAndSetHealthPercent()); // Update the current decay value
            
            // If our task is selected, we want to highlight it by drawing a copy slightly larger behind it
            if (this.selectedEditFeature !== null && this.house.renderableFeatures[i].tasks[j] === this.selectedEditTask) {
              gl.uniform1f(this.bbLocs.selected, 1.0); // set selected to true
              gl.drawArrays(gl.TRIANGLES, 0, 6); // draw 6 vertices = 2 triangles = 1 quad
            }  else {
              // Otherwise, just draw it without the highlight
              gl.uniform1f(this.bbLocs.selected, 0.0); // set selected to false
              gl.drawArrays(gl.TRIANGLES, 0, 6); // draw 6 vertices = 2 triangles = 1 quad
            }
          }
        } else {
          // Store the health bar to display if we can find one
          let worstDecayTask: Task | null = null;

          // Find the task with the worst decay
          for (let j = 0; j < this.house.renderableFeatures[i].tasks.length; j++) {
            const iterTask = this.house.renderableFeatures[i].tasks[j];
            iterTask.getAndSetHealthPercent(); // ensure we have up-to-date info

            // If we haven't set a task yet, set it
            if (!worstDecayTask) {
              worstDecayTask = iterTask;
            } else {
              // Otherwise, see if this new task is worse. If so, select it.
              if (worstDecayTask.healthPercent >= iterTask.healthPercent) {
                worstDecayTask = iterTask;
              }
            }
          }

          // If we found a worst task, display it's healthbar. A feature might have no tasks
          if (worstDecayTask !== null) {
            gl.uniform1f(this.bbLocs.selected, 0.0);
            gl.uniform1f(this.bbLocs.heightOffset, 0.8 + (0 + 1) * 0.4); // Add an offset per chore bar
            gl.uniform1f(this.bbLocs.healthPercent, worstDecayTask.getAndSetHealthPercent()); // Update the current decay value
            gl.drawArrays(gl.TRIANGLES, 0, 6); // draw 6 vertices = 2 triangles = 1 quad
          }
        }
      }
      gl.enable(gl.DEPTH_TEST); // return to normal
    }
  }

  ///////////////////
  ///  Utilities  ///
  ///////////////////

  // Just make sure we're using a valid room, set to the 1st in the room list index
  setValidRoom(): number {
    if (this.roomList.length > 0) {
      this.currentViewingRoom = this.roomList[0].room_id;
    } else {
      this.enableUnassignedRoom(); // enable the unassigned room if there are no rooms
      this.currentViewingRoom = UNASSIGNED_ROOM_ID;
    }
    console.log("Rooms updated.");
    return this.currentViewingRoom;
  }

  // Switch to the next room
  // In the draw loop, we check if the room id of the feature matches the room id of the current room. 
  // So, currentViewingRoom must be in the set of possible room ids for this household
  goNextRoom(): number {
    // We have our list of rooms. We need to move to the next room
    const currentIndex = this.roomList.findIndex((r) => {
      return r.room_id === this.currentViewingRoom
    }); // current index on success, -1 on failure

    // If we did NOT find out current room in the list of rooms, we just go to the first room
    if (currentIndex < 0) {
      this.currentViewingRoom = this.roomList[0].room_id;
    } else {
      const accessIndex = (currentIndex + 1 + this.roomList.length) % this.roomList.length;
      this.currentViewingRoom = this.roomList[accessIndex].room_id; // otherwise just get the next element 
    }

    return this.currentViewingRoom;
  }

  // Switch the to previous room
  // Similar to goNextRoom() just in reverse
  goPrevRoom(): number {
    // We have our list of rooms. We need to move to the next room
    // See if our current room is within the list of rooms
    const currentIndex = this.roomList.findIndex((r) => {
      return r.room_id === this.currentViewingRoom
    }); // current index on success, -1 on failure

    // If we did NOT find out current room in the list of rooms, we just go to the first room
    if (currentIndex < 0) {
      this.currentViewingRoom = this.roomList[0].room_id;
    } else {
      const accessIndex = (currentIndex - 1 + this.roomList.length) % this.roomList.length;
      this.currentViewingRoom = this.roomList[accessIndex].room_id; // otherwise just get the prev element
    }

    return this.currentViewingRoom;
  }

  getRoomNameFromId(roomId: number) {
    return this.roomList.find((r) => (r.room_id === roomId))?.room_name || "Unknown";
  }

  getRoomAccentColorFromId(roomId: number) {
    return this.roomList.find((r) => (r.room_id === roomId))?.accent_color;
  }

  // Adds the unassigned room to the array if it isn't already present
  enableUnassignedRoom() {
    // Check if the unassigned room is already being used
    const unassignedRoom = this.roomList.find((r) => {return r.room_id === UNASSIGNED_ROOM_ID});
    if (!unassignedRoom) {
      // If we didn't find it, add it
      this.roomList.push(UNASSIGNED_ROOM_OBJ);
    }
  }

  // Return the angle difference between the local direction vector (e.g. straight right on the +x axis)
  // and the camera forward vector
  getAngleFromCameraRight(localDirVec: MoveDirection): number {
    // Get our normal direction vector in world space
    let sideVec = GLM.vec3.create();
    switch(localDirVec) {
      case MoveDirection.POS_X:
        sideVec = GLM.vec3.fromValues(1, 0, 0); 
        break;
      case MoveDirection.NEG_X:
        sideVec = GLM.vec3.fromValues(-1, 0, 0);
        break;
      case MoveDirection.POS_Z:
        sideVec = GLM.vec3.fromValues(0, 0, 1);
        break;
      case MoveDirection.NEG_Z:
        sideVec = GLM.vec3.fromValues(0, 0, -1);
        break;
    }

    // Since we invert the view matrix every frame, we should have an inverse view matrix ready. 
    // If not, we will have draw failures and bigger issues.
    // Now, get the camera forward angle in world space from the inverse view matrix
    const camFwdVec = GLM.vec3.fromValues(
      this.inverseView[2], this.inverseView[6], this.inverseView[10]
    );
    GLM.vec3.normalize(camFwdVec, camFwdVec);

    // Get the angle between the camera right in world space and the normal
    const angle = GLM.vec3.angle(sideVec, camFwdVec);

    // Now, check if we are rotated counter clockwise or clockwise around the Y axis (up) by calculating the 
    // cross product to determine the sign
    const cross = GLM.vec3.create();
    GLM.vec3.cross(cross, GLM.vec3.fromValues(0, 1, 0), camFwdVec);

    // Check the sign and return the angle according to sign (we check against the correct normal)
    if (GLM.vec3.dot(sideVec, cross) < 0) {
      return angle * -1;
    }
    return angle
  }

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

  // Remove a placed feature and put it in the inventory
  removeFeature(featureID: number) {
    // Find our feature
    const feature = this.features.find((f) => {return f.id === featureID});
    if (!feature) {
      console.error("Unable to find feature for removal.");
      return;
    }

    // Remove it's position data on the server
    apiClearFeaturePosition(featureID)
    .then(() => {
      // On success, apply the results in graphics. Otherwise, do nothing
      this.house.renderableFeatures = this.house.renderableFeatures.filter((f) => {return f.id !== featureID}); // remove the deleted feature
      this.features = this.features.filter((f) => {return f.id !== featureID}); // remove the deleted feature here too
      this.unplacedFeatures = [...this.unplacedFeatures, feature];
      this.syncUnplacedFeatures(this.unplacedFeatures); // trigger a sync in the React UI
    }).catch((e) => {
      console.error(`Failed to remove feature. Canceling removal for feature ${featureID} in household ${this.house.household_id}.`, e);
    });
  }

  // Place the selected feature
  placeSelectedFeature(worldX: number, worldY: number, worldZ: number) {
    // Ensure we have selected a place feature
    const f = this.selectedPlaceFeature;
    if (!f) {
      // Note: this is not an error, we don't want to do anything here
      return;
    }

    // We already know our feature is within bounds by the time this method is called since when we convert screenToWorld coords, we 
    // return a null position on out-of-bounds and thus don't call this method. 
    // We also ignore collisions. 

    // First, round inputs to 2 decimal places
    const x = Number(worldX.toFixed(2));
    const y = Number(worldY.toFixed(2));
    const z = Number(worldZ.toFixed(2));

    // Prepare the appropriate model matrix
    const transform = GLM.mat4.create();
    const yRot = GLM.quat.create();
    GLM.quat.fromEuler(yRot, 0, f.rotation_y, 0);
    GLM.mat4.fromRotationTranslationScale(transform, yRot, [x, y, z], [f.scale, f.scale, f.scale]);

    // Create the material / type
    const newMaterial: Material = this.currentDrawingColor;

    // Set the correct type. We derive type from the icon set by the list view. Type is assigned here.
    const featureType = getFeatureTypeFromIcon(f.icon);

    // Create the feature object
    const newFeature = new RenderableFeature(f.name, f.household_id, f.id, transform, newMaterial, x, y, z, f.tasks, featureType, f.icon, f.room_id, f.scale, f.rotation_y); // this is the new feature object we're adding

    // Update the feature's XYZ positions
    apiUpdateFeature(f.id, {
      x_pos: x,
      y_pos: y,
      z_pos: z,
      feature_type: getFeatureTypeToString(featureType),
    }).then(() => {
      // Apply updates in graphics upon success
      this.house.renderableFeatures.push(newFeature); // add the feature to the house
      this.features.push(f); // add the super feature to our features array
      this.unplacedFeatures = this.unplacedFeatures.filter((fv) => {return fv.id !== f.id}); // remove from the unplaced feature
      this.syncUnplacedFeatures(this.unplacedFeatures); // trigger a sync in the UI
      this.clearSelectedPlaceFeature(); // deselect the current edit feature
    }).catch((e) => {
      console.error(`Unable to create feature for household ${this.house.household_id}.`, e);
    });
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

    // Get the ray from the front and back vertices
    // We'll treat front as position 0 and back as position 1 since front is usually smaller
    const dir = GLM.vec3.fromValues(back[0] - front[0], back[1] - front[1], back[2] - front[2]);
    GLM.vec3.normalize(dir, dir); // ensure nromalization
    if (Math.abs(dir[1]) <= 0.000001) { // check against a very small value to handle floating point error
      console.error("Failing, unable to calculate a ray.")
      return null;
    }  

    // Now, we need to check if the ray intersects any of the floor or wall features. Since these are known rectangles, this shouldn't be too bad.
    // We know that the floor and walls will be the first 4 features of the RenderableFeatures array.
    // We know that the ray will only ever intersect one of these features (we can't ever look at it from the back)
    // NOTE: We actually disable this so we can only place on the floor. HOWEVER we leave the functionality here for later use. Set to 5 to allow wall placement.
    const FEATURE_BOUND = 1; 
    for (let i = 0; i < FEATURE_BOUND; i++) {
      const f = this.house.renderableFeatures[i];
      if (!f.visible) {
        continue; // skip hidden features (e.g. walls)
      }

      // We can figure out pretty easily the equation of the plane that covers the surface of each feature. 
      // We can get a point on the plane since we know where the feature is in world space.
      // We can easily figure out a normal vector for the plane as well. 
      // Also adjust x0, y0, z0 points by 1/2 width to move it to the front of the feature.
      const center = GLM.vec3.create();
      GLM.vec3.transformMat4(center, center, f.modelMatrix); // transform to get the center point
      const halfScale = GLM.vec3.create();
      GLM.mat4.getScaling(halfScale, f.modelMatrix);
      GLM.vec3.multiply(halfScale, halfScale, [0.5, 0.5, 0.5]); // adjustment factor so we can get the plane at the front of the feature
      let normal = GLM.vec3.create();
      switch(i) {
        case 0:
          normal = GLM.vec3.fromValues(0, 1, 0);
          center[1] += halfScale[1];
          break;
        case 1:
          normal = GLM.vec3.fromValues(1, 0, 0); 
          center[0] += halfScale[0];
          break;
        case 2:
          normal = GLM.vec3.fromValues(-1, 0, 0);
          center[0] -= halfScale[0];
          break;
        case 3:
          normal = GLM.vec3.fromValues(0, 0, 1);
          center[2] += halfScale[2];
          break;
        case 4:
          normal = GLM.vec3.fromValues(0, 0, -1);
          center[2] -= halfScale[2];
          break;
        }

        // We know if the line's direction vector dot the plane's normal is zero, there is no intersection
        if (GLM.vec3.dot(dir, normal) === 0) {
          console.error("Ray is either parallel or within the plane.");
          return null;
        }

        // Now, we check if our ray intersects with said plane.
        // The equation of the plane will be:
        //      a(x - x0) + b(y - y0) + c(z - z0) = 0 
        //      where: a,b,c are normal vector components and x0, y0, z0 are the point we know the place passes through
        // Simplified: Ax + By + Cz = Ax0 + By0 + Cz0 = D
        const D = normal[0] * center[0] + normal[1] * center[1] + normal[2] * center[2];
        // Now, we have: Ax + By + Cz = D for the plane. 
        // For the lines, we have: 
        //      p(t) = p1 + Nt 
        //      where p(t) is an output point (x, y, or z), p1 is a known point on the line, N is the line's direction vector, 
        //      and t is a parameter. For us, p1 = front, N = dir. 
        // To find the intersection point, we rearrange the equation to calculate t
        //      t = (D - Ax1 - By1 - Cz1) / (An + Bn + Cn)
        const t = (D - normal[0] * front[0] - normal[1] * front[1] - normal[2] * front[2]) / (normal[0] * dir[0] + normal[1] * dir[1] + normal[2] * dir[2]);
        
        // Now, we substitute t back into the line equations to find the final point on the infinite plane
        const worldPos = GLM.vec3.fromValues(front[0] + dir[0] * t, front[1] + dir[1] * t, front[2] + dir[2] * t);

        // Now, we check if this point on the inifinte plane is beyond the bounds of the finite plane
        // First, we get the coordinates of the bounds of the plane. These will be the center times 1/2 the scale.
        // Then, we check bounds. We only need to check two bounds since they will always be aligned to one of the axis
        let inBounds = false;
        switch(i) {
          case 0: // floor (y=0, e.g. [x, 0, z])
            if (worldPos[0] < center[0] + halfScale[0] && worldPos[0] > center[0] - halfScale[0] && worldPos[2] < center[2] + halfScale[2] && worldPos[2] > center[2] - halfScale[2]) {
              // in bounds
              inBounds = true;
            }
            break;
          case 1: // left (-x, e.g. [-5, y, z])
          case 2: // right (+x, e.g. [5, y, z])
            if (worldPos[1] < center[1] + halfScale[1] && worldPos[1] > center[1] - halfScale[1] && worldPos[2] < center[2] + halfScale[2] && worldPos[2] > center[2] - halfScale[2]) {
              // in bounds
              inBounds = true;
            }
            break;
          case 3: // up (-z, e.g. [x, y, -5])
          case 4: // down (+z, e.g. [x, y, 5])
            if (worldPos[0] < center[0] + halfScale[0] && worldPos[0] > center[0] - halfScale[0] && worldPos[1] < center[1] + halfScale[1] && worldPos[1] > center[1] - halfScale[1]) {
              // in bounds
              inBounds = true;
            }
            break;
        }

        // If we've found a point where we're in bounds, then return the valid point.
        if (inBounds) {
          return worldPos;
        }
    }

    // If we've found no in bounds point after a full search, then return null for failure.
    return null;
  }

  // See if a cell is within the bounds of the grid
  checkValidMove(posX: number, posY: number, posZ: number, translationAmt: number, dir: MoveDirection) {
    // Disallow invalid block positions. For a grid of size 10,10 we allow range [-5, 4] in the xz directions. We lock to the xz plane (y=0)
    const halfGridWidth = Math.floor(this.grid.width / 2);
    const halfGridHeight = Math.floor(this.grid.height / 2);

    // We want to allow movement if the direction of travel is in-bounds, otherwise we disallow it
    switch (dir) {
        // For each of these, we check if the direction of movement brings us closer or further from the edge
        case MoveDirection.POS_X:
          if (posX + translationAmt >= halfGridWidth) {
            // we know we're out of bounds
            return false;
          }
          break;
        case MoveDirection.NEG_X:
          if (posX - translationAmt <= 0 - halfGridWidth) {
            // we know we're out of bounds
            return false;
          }
          break;
        case MoveDirection.POS_Z:
          if (posZ + translationAmt >= halfGridHeight) {
            // we know we're out of bounds
            return false;
          }
          break;
        case MoveDirection.NEG_Z:
          if (posZ - translationAmt <= 0 - halfGridHeight) {
            // we know we're out of bounds
            return false;
          }
          break;
      }
    
    // Otherwsie, we return true since movement is allowed
    return true;
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

   constructor(name: string, household_id: number, feature_id: number, mm?: GLM.mat4, mat?: Material, x?: number, y?: number, z?: number, tasks?: Task[], type?: FeatureType, icon?: string, room_id?: number | null, scale?: number, rotation_y?: number) {
    super(name, household_id, type, x, y, z, feature_id, icon, room_id, scale, rotation_y);

    // Set up mesh if a type is provided
    this.mesh = !type ? undefined : getFeatureTypeToString(type);

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

   async scaleFeature(scaleAmt: number) {
    // Figure out how much to scale the feature by
    let scaleBy = this.scale + scaleAmt; // we will scale from the identity to this value

    // Set scale to max or min depending on its sign (if we end to grow or shrink the feature) if it is out of bounds
    scaleBy = scaleAmt > 0 ? (scaleBy > MAX_FEATURE_SCALE ? MAX_FEATURE_SCALE : scaleBy) : (scaleBy < MIN_FEATURE_SCALE ? MIN_FEATURE_SCALE : scaleBy)

    // Before we begin, save a rollback matrix in case the DB fails
    const rollbackMatrix = this.modelMatrix;
    const rollbackScale = this.scale;

    // First, reset the scale to 0. We save rotation and position, then set to identity.
    // This helps us use a consistent scale factor and also helps avoid floating point error accumulation
    // We already know the scale factor since it is an integer
    const rot = GLM.quat.create(); // rotation as a quaternion
    GLM.mat4.getRotation(rot, this.modelMatrix);
    const pos = GLM.vec3.create();
    GLM.mat4.getTranslation(pos, this.modelMatrix);
    GLM.mat4.identity(this.modelMatrix); // reset to identity
    
    // Now, reapply the position and rotation values
    GLM.mat4.fromRotationTranslationScale(this.modelMatrix, rot, pos, [scaleBy, scaleBy, scaleBy]);

    // Update the current scale value
    this.scale = scaleBy;

    // Now, update the DB - Rollback on failure
    apiUpdateFeature(this.id, {scale: this.scale}).catch( (e) => {
      this.modelMatrix = rollbackMatrix;
      this.scale = rollbackScale;
      console.error("Failed to scale feature on remote.", e);
    });
   }

   async rotateFeatureY(rotAmt: number) {
    // Before we begin, save a rollback matrix in case the DB fails
    const rollbackMatrix = this.modelMatrix;
    const rollbackRotation = this.rotation_y;

    // Convert to radians
    const rotFactor = rotAmt * Math.PI / 180;

    // Apply the rotation
    GLM.mat4.rotateY(this.modelMatrix, this.modelMatrix, rotFactor);

    // Save to feature data
    this.rotation_y = this.rotation_y += rotAmt;

    // Clamp positive range to 0 to 360
    if (this.rotation_y > 360.0) {
      this.rotation_y -= 360.0;
    }

    // Clamp negative range to -360 to 0
    if (this.rotation_y < -360.0) {
      this.rotation_y += 360.0;
    }

    // Now, update the DB
    apiUpdateFeature(this.id, {rotation_y: this.rotation_y}).catch( (e) => {
      this.modelMatrix = rollbackMatrix;
      this.rotation_y = rollbackRotation;
      console.error("Failed to rotate feature on remote.", e);
    });
   }

   async translateFeature(translationAmt: number, dir: MoveDirection) {
    // Before we begin, save a rollback matrix in case the DB fails
    const rollbackMatrix = this.modelMatrix;
    const rollbackPositionX = this.x_pos;
    const rollbackPositionY = this.y_pos;
    const rollbackPositionZ = this.z_pos;

    // We want to translate the feature in terms of world space, not local space. So, we have to pre-multiply our matrix
    // instead of the typical GLM post multiply
    const translationMatrix = GLM.mat4.create();
    let translationVector = [0, 0, 0];
    switch (dir) {
      case MoveDirection.POS_X:
        translationVector[0] = translationAmt;
        this.x_pos += translationAmt;
        break;
      case MoveDirection.NEG_X:
        translationVector[0] = -translationAmt;
        this.x_pos -= translationAmt;
        break;
      case MoveDirection.POS_Z:
        translationVector[2] = translationAmt;
        this.z_pos += translationAmt;
        break;
      case MoveDirection.NEG_Z:
        translationVector[2] = -translationAmt;
        this.z_pos -= translationAmt;
        break;
    }

    // Now, actually apply the translation in world space
    GLM.mat4.fromTranslation(translationMatrix, translationVector);
    GLM.mat4.multiply(this.modelMatrix, translationMatrix, this.modelMatrix);

    // Now, update the DB
    apiUpdateFeature(this.id, {
      x_pos: this.x_pos,
      y_pos: this.y_pos,
      z_pos: this.z_pos
    }).catch( (e) => {
      this.modelMatrix = rollbackMatrix;
      this.x_pos = rollbackPositionX;
      this.y_pos = rollbackPositionY;
      this.z_pos = rollbackPositionZ;
      console.error("Failed to translate feature on remote.", e);
    });
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

  // Scale a particular feature by a certain amount
  scaleSelectedFeature(scaleAmt: number) {
    // Ensure we have a feature selected
    if (!this.rdr.selectedEditFeature) {
      console.error("Attempting to scale null feature.");
      return;
    }

    this.rdr.selectedEditFeature.scaleFeature(scaleAmt);
  }

  // Rotate a particular feature by a certain amount around the Y axis
  rotateSelectedFeatureY(rotAmt: number) {
    // Ensure we have a feature selected
    if (!this.rdr.selectedEditFeature) {
      console.error("Attempting to scale null feature.");
      return;
    }

    this.rdr.selectedEditFeature.rotateFeatureY(rotAmt);
  }

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
   translateSelectedFeature(translationAmt: number, dir: MoveDirection) {
    // Ensure we have a feature selected
    if (!this.rdr.selectedEditFeature) {
      console.error("Attempting to move null feature.");
      return;
    }

    // Apply movement. First, check if the proposed move would be within bounds. Then, apply updates to the model matrices and XYZ values.
    switch (dir) {
      case MoveDirection.POS_X:
        if (this.rdr.checkValidMove(this.rdr.selectedEditFeature.x_pos, this.rdr.selectedEditFeature.y_pos, this.rdr.selectedEditFeature.z_pos, translationAmt, MoveDirection.POS_X)) {
          this.rdr.selectedEditFeature.translateFeature(translationAmt, MoveDirection.POS_X);
        }
        break;
      case MoveDirection.NEG_X:
        if (this.rdr.checkValidMove(this.rdr.selectedEditFeature.x_pos, this.rdr.selectedEditFeature.y_pos, this.rdr.selectedEditFeature.z_pos, translationAmt,  MoveDirection.NEG_X)) {
          this.rdr.selectedEditFeature.translateFeature(translationAmt, MoveDirection.NEG_X);
        }
        break;
      case MoveDirection.POS_Z:
        if (this.rdr.checkValidMove(this.rdr.selectedEditFeature.x_pos, this.rdr.selectedEditFeature.y_pos, this.rdr.selectedEditFeature.z_pos, translationAmt, MoveDirection.POS_Z)) {
          this.rdr.selectedEditFeature.translateFeature(translationAmt, MoveDirection.POS_Z);
        }
        break;
      case MoveDirection.NEG_Z:
        if (this.rdr.checkValidMove(this.rdr.selectedEditFeature.x_pos, this.rdr.selectedEditFeature.y_pos, this.rdr.selectedEditFeature.z_pos, translationAmt, MoveDirection.NEG_Z)) {
          this.rdr.selectedEditFeature.translateFeature(translationAmt, MoveDirection.NEG_Z);
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