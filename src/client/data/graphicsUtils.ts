/* PROLOGUE
File name: graphicsUtils.ts
Description: Provide support and organization for a variety of graphics-related utility functions.
Programmer: Jack Bauer
Creation date: 3/29/26
Revision date: 
  - 4/6/26: Support mesh loading
  - 4/18/26: Highlight selected task and health bar
Preconditions: Shader paths must also be added to app.json, VAOs must be bound properly outside drawMesh()
Postconditions: None
Errors: None
Side effects: None
Invariants: None
Known faults: None
*/

// ***********************************************************
//                      Needed Imports
// ***********************************************************
// NOTE: Should never import from renderer.ts (renderer.ts depends on this file) - this should just be general utilities

import { Asset } from 'expo-asset';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { ExpoWebGLRenderingContext } from 'expo-gl';
import { Platform } from 'react-native';
import * as OBJ from 'webgl-obj-loader';
import * as GLM from 'gl-matrix';
import { FeatureType } from './feature';
import { LOCATION_ICONS } from './householdUtils';

// ***********************************************************
//                    Misc useful functions
// ***********************************************************

// log error function
function logError(gl: ExpoWebGLRenderingContext) {
  console.log(gl.getError());
}

// ***********************************************************
//                 Mesh constants & interfaces
// ***********************************************************

export interface MeshPathMap {
  [key: string]: any
}

export interface MeshVAOMap {
  [key: string]: VAO
}

export const MESH_PATH_MAP: MeshPathMap = {
  "monkey": require("../assets/models/Monkey.obj"),
  "bed": require("../assets/models/bed.obj"),
  "table": require("../assets/models/table.obj"),
  "frame": require("../assets/models/frame.obj"),
  "flower_pot": require("../assets/models/flower_pot.obj"),
  "couch": require("../assets/models/couch.obj"),
  "fridge": require("../assets/models/Fridge.obj"),
  "car": require("../assets/models/car.obj"),
  "washing_machine": require("../assets/models/washing_machine.obj"),
  "tall_plant": require("../assets/models/tall_plant.obj"),
  "desk": require("../assets/models/desk.obj"),
  "bathtub": require("../assets/models/bathtub.obj"),
  "sink": require("../assets/models/sink.obj"),
  "toilet": require("../assets/models/toilet.obj"),
  "wood_chair": require("../assets/models/wood_chair.obj"),
  "square_rug": require("../assets/models/rug.obj"),
};

// ***********************************************************
//                 Shader constants & interfaces
// ***********************************************************

export enum RenderPass {
  MAIN,
  PICK_OBJECT
}

// Wrapper for shader interface
export interface Shader {
  name: string,
  shader: WebGLShader
}

// Wrapper for shader data interface
export interface ShaderData {
  name: string,
  data: string,
  type: ShaderType
}

// Wrapper for shader path interface
export interface ShaderPaths {
  [key: string] : [any, ShaderType]
}

export enum ShaderType {
  VERTEX,
  FRAGMENT
}

// The shader paths for a specific shader program
export const SHADER_BILLBOARD_PATHS: ShaderPaths = {
  "bbVert": [require("../assets/shaders/billboard.vert"), ShaderType.VERTEX],
  "bbFrag": [require("../assets/shaders/billboard.frag"), ShaderType.FRAGMENT]
};
export const SHADER_REGULAR_PATHS: ShaderPaths= {
  "vert": [require("../assets/shaders/main.vert"), ShaderType.VERTEX],
  "frag": [require("../assets/shaders/main.frag"), ShaderType.FRAGMENT]
};
export const SHADER_PICK_PATHS: ShaderPaths= {
  "vert": [require("../assets/shaders/pick.vert"), ShaderType.VERTEX],
  "frag": [require("../assets/shaders/pick.frag"), ShaderType.FRAGMENT]
};

// ***********************************************************
//   General Enums, and Interfaces (and related functions)
// ***********************************************************

// Define possible move directions in the xz plane
export enum MoveDirection {
  POS_X,
  NEG_X,
  POS_Z,
  NEG_Z
}

// Define tools to use for different house features
export enum Tool {
  TOOL_FEATURE,
  TOOL_WALL,
  TOOL_GRID,
  TOOL_EDIT_FEATURE
}

export interface InventoryProps {
  tool: Tool,
}

export interface EditMenuProps {
  tool: Tool,
  updateToolCallback: (tool: Tool) => void
}

// Interfaces for WebGL shader locations
// Attributes
export interface ShaderAttributebLocations {
    // We need to figure out where these attributes are being stored on the GPU.
    vertLoc: number,
    normalLoc: number,
    texLoc: number
}
// Matrices
export interface ShaderMatrixUniformLocations {
      // We use three matrices to transform a model's unique position in the world into a 
      // projected value on the screen. 
      modelMatrix: WebGLUniformLocation | null,
      viewMatrix: WebGLUniformLocation | null,
      projectionMatrix: WebGLUniformLocation | null
    }
// Lighting
export interface ShaderLightUniformLocations {
    viewPosition: WebGLUniformLocation | null
    material: {
        ambient: WebGLUniformLocation | null,
        diffuse: WebGLUniformLocation | null, 
        specular: WebGLUniformLocation | null,
        shininess: WebGLUniformLocation | null
    },
    light: {
        position: WebGLUniformLocation | null,
        ambient: WebGLUniformLocation | null,
        diffuse: WebGLUniformLocation | null,
        specular: WebGLUniformLocation | null,
    }
}
// Billboards
export interface ShaderBillboardUniformLocations {
    pos: number,
    model: WebGLUniformLocation | null,
    view: WebGLUniformLocation | null,
    inverseView: WebGLUniformLocation | null,
    projection: WebGLUniformLocation | null,
    heightOffset: WebGLUniformLocation | null,
    healthPercent: WebGLUniformLocation | null,
    fillColor: WebGLUniformLocation | null,
    backgroundColor: WebGLUniformLocation | null,
    highlightColor: WebGLUniformLocation | null,
    selected: WebGLUniformLocation | null,
}
// Pick objects
export interface ShaderPickLocations {
  position: number,
  model: WebGLUniformLocation | null,
  view: WebGLUniformLocation | null,
  projection: WebGLUniformLocation | null,
  objectID: WebGLUniformLocation | null,
  colorMult: WebGLUniformLocation | null,
}

// Type to bridge webgl 1 and 2 VAOs
export type VAO = WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null;

// Define the structure of what a material should have. We follow the phong lighting model. 
// Values for all numbers but shininess should be in [0, 1]
export interface Material {
  ambient: [number, number, number];
  diffuse: [number, number, number];
  specular: [number, number, number];
  shininess: number;
}

// Define a series of colors
export const FEATURE_RED: Material = {
  ambient: [0.21, 0.31, 0.31],
  diffuse: [1.0, 0.0, 0.0],
  specular: [0.5, 0.5, 0.5],
  shininess: 32.0,
}

export const FEATURE_BLUE: Material = {
  ambient: [0.21, 0.31, 0.31],
  diffuse: [0.0, 0.0, 1.0],
  specular: [0.5, 0.5, 0.5],
  shininess: 32.0,
}

export const FEATURE_GREEN: Material = {
  ambient: [0.21, 0.31, 0.31],
  diffuse: [0.0, 1.0, 0.0],
  specular: [0.5, 0.5, 0.5],
  shininess: 32.0,
}

export const FEATURE_ORANGE: Material = {
  ambient: [0.21, 0.31, 0.31],
  diffuse: [1.0, 0.6, 0.3],
  specular: [0.5, 0.5, 0.5],
  shininess: 32.0,
}

export const FEATURE_GREY: Material = {
  ambient: [0.21, 0.31, 0.31],
  diffuse: [1.0, 1.0, 1.0],
  specular: [0.5, 0.5, 0.5],
  shininess: 32.0,
}

// We will pick from this array of colors
export const FEATURE_COLORS = [FEATURE_RED, FEATURE_BLUE, FEATURE_GREEN, FEATURE_ORANGE]

// ***********************************************************
//                  Grid & Cell Utilities
// ***********************************************************

// A helper function to retrieve the cell that was clicked from a given position on the xz plane
export function cellFromCoords(x: number, z: number) {
  // The grid is designed so that each line marks the end of one cell from the origin. 
  // In other words, 0 is at 0, one is after 1 unit, 2 is after 2 units, etc. So, to find the cell we're in we perform a floor.
  // It's worth mentioning though that this creates an imbalance between the number of negative and positive cells. Positive
  // will index at 0, negative at -1. This means that the origin cell (at 0,0) is the cell from 0 to 1 on both the x and z axes
  // which might not be ideal. 
  return [Math.floor(x), Math.floor(z)];
}

// Generate the vertices that would comrpise a grid based on a width and height value centered at 0 on the xz axis. 
export function genGrid(width: number, height: number) {
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

// ***********************************************************
//                  Shader Utilities
// ***********************************************************

// This class will handle the creation and management of shader programs and also
// their respective shaders
export class ShaderProgramManager {
  shaderPaths: ShaderPaths; // The paths to all our shader files. NOTE: They must also be included in app.json
  _shaders: Shader[];  // Store our shaders (will be deleted after program is ready)
  gl: ExpoWebGLRenderingContext; // a reference to the owning WebGL context

  // These should be the only variables ever accessed beyond this class 
  program: WebGLProgram; // the program our shaders are attached to
  valid: boolean; // only true if we have loaded shaders AND linked a program

  // Load and link our shader program. This needs to be called before anything else can be used
  async loadAndLinkShaders() {
    try {
      this._shaders = await loadAllShaders(this.gl, this.shaderPaths);
      linkProgram(this.gl, this.program, this._shaders);
      detachAndDeleteShaders(this.gl, this.program, this._shaders); // clean up now unneeded resources
      this.valid = true; // We are now ready for use
    } catch (e) {
      // Clean up resources on error
      console.error("Unable to load shaders.", e);
      detachAndDeleteShaders(this.gl, this.program, this._shaders);
    }
  }

  // Return the related shader program
  getProgram() {
    return this.program;
  }

  // Return the valid state
  isValid() {
    return this.valid;
  }

  constructor(gl: ExpoWebGLRenderingContext, shaderProgramPathList: ShaderPaths) {
    // Set defaults
    this.valid = false;
    this.shaderPaths = shaderProgramPathList;
    this.gl = gl;
    this._shaders = [];
    this.program = gl.createProgram();
  }
}

// Link shaders to a program
function linkProgram(gl: ExpoWebGLRenderingContext, program: WebGLProgram, shaders: Shader[]) {
  // Link shaders together into a program. A shader program tells the GPU which order of shaders to run to fill the graphics pipeline. 
  // At a minimum, we need a vertex and fragment shader. Vertex shaders handle and transform vertex data, fragment shaders handle 
  // the individual "fragments" created after rasterization where lines are transformed into actual pixels. We could switch to a different 
  // program or modify this one if we wanted to use different shaders. 
  shaders.forEach((s) => {
    gl.attachShader(program, s.shader);
  });
  gl.linkProgram(program);
  return program;
}

// Read all listed shaders, then source and compile each
// Will throw an error on failure
async function loadAllShaders(gl: ExpoWebGLRenderingContext, shaderFilePaths: ShaderPaths) {
  // Read in our shader data
  const shaderDataArray: ShaderData[] = [];
  for (const key in shaderFilePaths) {
    const r = await readShaderData(key, shaderFilePaths);
    shaderDataArray.push(r);
  }

  // Source and compile shaders
  const compileResults: (Shader | null)[] = [];
  shaderDataArray.forEach((s) => {
    const r = sourceAndCompileShader(gl, s);
    compileResults.push(r);
  });

  // Check for errors. If we find any, delete all our shaders
  const shaders: Shader[] = compileResults.filter(elem => elem !== null);
  if (compileResults.includes(null)) {
    throw new Error("Failure compiling shader.");
  }

  // Return if we have had success and our shaders
  return shaders;
}

// Convert from a ShaderType to a WebGL shader type
function getGlShaderType(gl: ExpoWebGLRenderingContext, type: ShaderType) {
  switch(type) {
    case ShaderType.VERTEX:
      return gl.VERTEX_SHADER;
    case ShaderType.FRAGMENT:
      return gl.FRAGMENT_SHADER;
    default:
      throw Error("Invalid shader type.");
  }
}

// From a shader file read into a string (shaderDataString), source and compile the shader and then return it
function sourceAndCompileShader(gl: ExpoWebGLRenderingContext, shaderData: ShaderData): Shader | null{
  // Create shader. On error, clear resources, output an error, and quit
  const shader: WebGLShader | null = gl.createShader(getGlShaderType(gl, shaderData.type));
  if (shader === null) {
    console.error("Error creating shader.");
    return null;
  } 
  gl.shaderSource(shader, shaderData.data); // Set the shader source code accordingly (string of shader file)
  gl.compileShader(shader); // Compile that shader written in GLSL

  // Ensure shaders are compiled correctly. Output an error if they aren't with relevant shader info, clear resources, and return. 
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader failed to compile", shader);
    gl.deleteShader(shader);
    return null;
  }

  // Return a reference to the shader
  return {name: shaderData.name, shader: shader};
}

// Delete all shaders provided in the shaders argument
function detachAndDeleteShaders(gl: ExpoWebGLRenderingContext, program: WebGLProgram, shaders: Shader[]) {
  shaders.forEach((s) => {
    gl.deleteShader(s.shader)}
  );
  shaders = [];
}

// ***********************************************************
//                  File IO Utilities
// ***********************************************************

// Read shader data from a .vert or .frag file (for vertex or fragment shaders), then return that file
// as a single string for later use in WebGL. I have no idea why they designed it this way, but WebGL wants
// a string. 
// NOTE: You must add the shader to assets in app.json for this to work
async function readShaderData(shaderName: string, shaderPaths: ShaderPaths) {
  // Load our shader file
  const asset = Asset.fromModule(shaderPaths[shaderName][0]);
  await asset.downloadAsync();

  // Ensure we found it
  if (!asset.localUri) {
    throw new URIError("Unable to find shader.");
  }

  // Load the file into a string
  const shader: ShaderData = {
    name: shaderName, 
    data: await loadToStringByPlatform(asset.localUri),
    type: shaderPaths[shaderName][1]
  };
  return shader;
}

// Load from a URI to a text string
async function loadToStringByPlatform(localUri: string) {
  // Web and mobile bundle files differently. On web, we fetch it using a URL as if we were fetching an external resource.
  // On mobile, we can just read the file since it is bundled with the application. Once read, return the file data as text / string data.
  if (Platform.OS === 'web') {
    return await (await fetch(localUri)).text(); // .text() is a promise, like fetch, hence the double await
  } else {
    return await readAsStringAsync(localUri);
  }
}

// ***********************************************************
//                  Mesh Utilities
// ***********************************************************

// This class will be responsibile for sourcing all mesh models upon creation, as well as 
// handling the resulting mesh maps. 
export class MeshManager {
  valid: boolean;
  meshMap: OBJ.MeshMap;
  gl: ExpoWebGLRenderingContext;
  meshVaoMap: MeshVAOMap;
  vaoManager: VAOManager;

  async sourceMeshes() {
    try{
      this.meshMap = await sourceAllModels();
      this.valid = true;
      return true;
    } catch (e) {
      console.error("Unable to source models.");
      return false;
    }
  }

  // Call this to source and prpeare all meshes and their VAOs
  async initialize(attribLocs: ShaderAttributebLocations, pickLocs: ShaderPickLocations) {
    // Load our meshes into the meshMap, or return on failure
    const sourced = await this.sourceMeshes()
    if (!sourced) {
      console.error("Unable to source meshes.");
      return;
    }

    // For each mesh, prepare it and create an appropriate VAO
    for (const name in this.meshMap) {
      // Create and bind our VAO for this mesh
      const vao = this.vaoManager.createVAO()
      this.vaoManager.bindVAO(vao);

      // Prepare the mesh
      this.prepareMesh(name, attribLocs, pickLocs);

      // Set our final vao map and reset state
      this.vaoManager.bindVAO(null);
      this.meshVaoMap[name] = vao;
    }

    console.log("MeshManager initialized.");
  }

  // Must be called for every mesh. 
  // NOTE: You must properly bind and unbind the appropriate VAO before and after this call
  prepareMesh(name: string, attribLocs: ShaderAttributebLocations, pickLocs: ShaderPickLocations) {
    // Get our mesh from the name
    const mesh = this.meshMap[name];
    if (!mesh) {
      console.error(`Could not find mesh ${name}.`)
      return;
    }

    // Enable needed attrs
    this.gl.enableVertexAttribArray(attribLocs.vertLoc);
    this.gl.enableVertexAttribArray(attribLocs.normalLoc);
    this.gl.enableVertexAttribArray(attribLocs.texLoc);
    this.gl.enableVertexAttribArray(pickLocs.position);

    // Expand our buffers so we have what we need
    OBJ.initMeshBuffers(this.gl, mesh);

    // Now, prep needed runtime-created variables
    // Get our runtime-created buffers and check for errors
    const vb: WebGLBuffer = (mesh as any).vertexBuffer;
    const vbItemSize: number = (vb as any).itemSize;
    const vn: WebGLBuffer = (mesh as any).normalBuffer;
    const vnItemSize: number = (vn as any).itemSize;
    const tx: WebGLBuffer = (mesh as any).textureBuffer;
    const txItemSize: number = (tx as any).itemSize;
    if (!vb || !vn || !vbItemSize || !vnItemSize) {
      throw Error("No buffers to prep with on model.");
    }

    // Prep buffers
    // Vertex buffer
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vb);
    this.gl.vertexAttribPointer(attribLocs.vertLoc, vbItemSize, this.gl.FLOAT, false, 0, 0);

    // Object picking attribs
    this.gl.vertexAttribPointer(pickLocs.position, vbItemSize, this.gl.FLOAT, false, 0, 0);

    // Vertex normal buffer
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vn);
    this.gl.vertexAttribPointer(attribLocs.normalLoc, vnItemSize, this.gl.FLOAT, false, 0, 0);

    // Texture buffer, if we have one
    if (!mesh.textures.length) { // In case we don't have texture coordinates...
      this.gl.disableVertexAttribArray(attribLocs.texLoc);
      this.gl.vertexAttrib2f(attribLocs.texLoc, 0.0, 0.0);
    } else {
      this.gl.enableVertexAttribArray(attribLocs.texLoc);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, tx);
      this.gl.vertexAttribPointer(attribLocs.texLoc, txItemSize, this.gl.FLOAT, false, 0, 0);
    }

    // Bind index buffer as part of VAO state
    const ix: WebGLBuffer = (mesh as any).indexBuffer;
    if (ix) {
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, ix);
    }
  }

  // NOTE: Depends on the proper VAOs being bound outside of this
  drawMesh(name: string) {
    // Ensure we're valid and initialized
    if (!this.valid) {
      console.error("MeshManager not valid yet.");
      return;
    }

    // Get our mesh from the name
    const mesh = this.meshMap[name];
    if (!mesh) {
      console.error(`Could not find mesh ${name}.`)
      return;
    }

    // Get our runtime-created index buffer and check for errors
    const ix: WebGLBuffer = (mesh as any).indexBuffer;
    const ixLength: number = (ix as any).numItems;
    if (!ix || !ixLength) {
      throw Error("No index buffer to draw with on model.");
    }

    // Render - index buffer is already bound by VAO
    if (ixLength > 0) {
      this.gl.drawElements(this.gl.TRIANGLES, ixLength, this.gl.UNSIGNED_SHORT, 0);  
    }
  }

  getVaoForMesh(meshName: string) {
    return this.meshVaoMap[meshName];
  }

  constructor(gl: ExpoWebGLRenderingContext, vaoManager: VAOManager) {
    this.valid = false;
    this.meshMap = {};
    this.gl = gl;
    this.meshVaoMap = {};
    this.vaoManager = vaoManager;
  }
}

// Load all models and prepare them for rendering
async function sourceAllModels(): Promise<OBJ.MeshMap> {
  const meshUriMap: OBJ.NameAndUrls ={}; // store our name to URI pairs 
  for (const key in MESH_PATH_MAP) {
    const asset = Asset.fromModule(MESH_PATH_MAP[key]);
    await asset.downloadAsync();

    // Ensure we were successful
    if (!asset.localUri) {
      throw new URIError("Unable to find mesh.", MESH_PATH_MAP[key]);
    }

    // Set our name to uri map
    meshUriMap[key] = asset.localUri;
  }


  // Load the meshes into a MeshMap
  const meshMap = await new Promise<OBJ.MeshMap>((resolve, reject) => {
    OBJ.downloadMeshes(meshUriMap, (meshArray) => {
        // Set the final mesh map
        resolve(meshArray);
      }, {});
  });
  
  // Return the result
  console.log("Models loaded.");
  return meshMap;
}

// Get a feature type from its icon
export function getFeatureTypeFromIcon(icon: string): FeatureType {
    // Ensure that our icon is a valid icon for a feature
    const index = LOCATION_ICONS.find((i) => {return i === icon});
    if (!index) {
        // we know that our icon is not a valid icon
        console.error("Unable to convert icon type to feature type.");
        return FeatureType.UNDEFINED;
    }

    // Otherwise, convert to a FeatureType
    switch (icon) {
        case "bathtub":
            return FeatureType.BATHTUB;
        case "bed":
            return FeatureType.BED;
        case "sofa":
            return FeatureType.COUCH;
        case "desk":
            return FeatureType.DESK;
        case "tree":
            return FeatureType.TALL_PLANT;
        case "car-outline":
            return FeatureType.CAR;
        case "washing-machine":
            return FeatureType.WASHING_MACHINE;
        case "fridge":
            return FeatureType.FRIDGE;  
        case "flower":
          return FeatureType.FLOWER_POT;  
        case "faucet":
          return FeatureType.SINK;
        case "toilet":
          return FeatureType.TOILET;
        case "table-chair":
          return FeatureType.WOOD_CHAIR;
        case "rug":
          return FeatureType.SQUARE_RUG;
        case "":
        default:
            // Note: I think this should never be reached since "" is not in LOCATION_ICONS
            // However, we'll leave it in for future proofing
            return FeatureType.UNDEFINED;
    }
}

// ***********************************************************
//              General Graphics Utilities
// ***********************************************************

// This class is intended to manage Vertex Array Object (VAO) state
export class VAOManager {
  gl: ExpoWebGLRenderingContext; // The GL Context reference
  oesExt: OES_vertex_array_object | null; // A global way to access the OES extension for WebGL 1.0 support

  constructor(glRef: ExpoWebGLRenderingContext) {
    this.gl = glRef;

    // Get the OES Vertex Array Object extension
    // This is needed because these VAOs provide very useful functionality (we don't have to define vertex array attributes
    // every frame). However, since we need to support WebGL 1.0 (for older Raspberry Pis), we need to pull this in as an extension
    // as this functionality is only native in WebGL 2.0. To make things more annoying, often this functionality is NOT available in WebGL 2.0 
    // contexts. So, it's stupid, but we have to support both. This getExtension(...) call will either return an object or null.
    this.oesExt = glRef.getExtension('OES_vertex_array_object'); 
  }

  // Since WebGL 1.0 and 2.0 create vertex array objects (explained above) differently, we need a wrapper function. 
  createVAO() {
    // Ensure we have a WebGL context
    if (!this.gl) {
      console.error("No gl context.");
      return null;
    }

    if (!this.oesExt) {
      // WebGL 2.0 - we do not have the OES extension and support VAOs natively
      return this.gl.createVertexArray();
    } else {
      // WebGL 1.0 - we do have the OES extension to support VAOs but we do not have support for VAOs natively
      return this.oesExt.createVertexArrayOES();
    }
  }

  // Since WebGL 1.0 and 2.0 bind vertex array objects (explained above) differently, we need a wrapper function. 
  // Note that it is possible to bind a null VAO, this just clears whatever VAO is currently bound. 
  bindVAO(vao: VAO) {
    // Ensure we have a WebGL context
    if (!this.gl) {
      console.error("No gl context.");
      return null;
    }

    if (!this.oesExt) {
      // WebGL 2.0 - we do not have the OES extension and support VAOs natively
      return this.gl.bindVertexArray(vao);
    } else {
      // WebGL 1.0 - we do have the OES extension to support VAOs but we do not have support for VAOs natively
      return this.oesExt.bindVertexArrayOES(vao);
    }
  }
}

// ***********************************************************
//              Texture Utilities
// ***********************************************************

export function resizeFramebufferAttachments(gl: ExpoWebGLRenderingContext, tgtTexture: WebGLTexture, depthBuffer: WebGLRenderbuffer, width: number, height: number) {
  // Resize the texture parameters
  gl.bindTexture(gl.TEXTURE_2D, tgtTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
}

export function getPixelFromRaw(gl: ExpoWebGLRenderingContext, rawX: number, rawY: number, viewWidth: number, viewHeight: number, windowHeight: number) {
  // We need to convert from the raw coordinates given by react to coords scaled for the gl.drawingBuffer size
  // gl.readPixels expects a bottom-left centered coordinate system
  const drawWidth = gl.drawingBufferWidth;
  const drawHeight = gl.drawingBufferHeight;
  const pixelX = Math.floor(rawX * drawWidth / viewWidth);
  const pixelY = drawHeight - Math.floor((rawY * drawHeight / viewHeight) - (windowHeight - viewHeight) * drawHeight / viewHeight); // we need to account for the bar at the top of the screen
  return {pixelX, pixelY};
}

export function getPickedObjectFromPointOnScreen(gl: ExpoWebGLRenderingContext) {
  // See https://webglfundamentals.org/webgl/lessons/webgl-picking.html for more information
  const data = new Uint8Array(4);

  // Read one pixel at our provided position - we just want to know what color it is
  // We will have 8 bits of red, green, blue, and alpha
  // We can do this because we know we're only rendering to a 1x1 texture
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);

  // Get our color's object ID in reverse of the process we used to encode it
  const id: number = data[0] + (data[1] << 8) + (data[2] << 16) + (data[3] << 24);
  return id;
}

export function setPixelFrustrum(gl: ExpoWebGLRenderingContext, out: GLM.mat4, fovRadians: number, nearClip: number, farClip: number, pixelX: number, pixelY: number) {
  // Optimization: we only want to render the pixel our mouse is over. See https://webglfundamentals.org/webgl/lessons/webgl-picking.html
  // compute the near plane in a standard projection matrix
  const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
  const top = Math.tan(fovRadians * 0.5) * nearClip;
  const bottm = -top;
  const left = aspect * bottm;
  const right = aspect * top;
  const width = Math.abs(right - left);
  const height = Math.abs(top - bottm);

  // Now, compute the part of that near plane that covers the mouse pixel
  const subLeft = left + pixelX * width / gl.drawingBufferWidth;
  const subBottom = bottm + pixelY * height / gl.drawingBufferHeight;
  const subWidth = width / gl.drawingBufferWidth;
  const subHeight = height / gl.drawingBufferHeight;

  // Finally, make our 1 pixel frustrum
  GLM.mat4.frustum(out, subLeft, subLeft + subWidth, subBottom, subBottom + subHeight, nearClip, farClip);
}