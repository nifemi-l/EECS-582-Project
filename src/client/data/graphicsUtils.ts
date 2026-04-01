/* PROLOGUE
File name: graphicsUtils.ts
Description: Provide support and organization for a variety of graphics-related utility functions.
Programmer: Jack Bauer
Creation date: 3/29/26
Revision date: 
  - No revisions yet
Preconditions: Shader paths must also be added to app.json
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

// ***********************************************************
//                 Shader constants & interfaces
// ***********************************************************

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
function getGlType(gl: ExpoWebGLRenderingContext, type: ShaderType) {
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
  const shader: WebGLShader | null = gl.createShader(getGlType(gl, shaderData.type));
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

// Load all models and prepare them for rendering
export async function sourceModels(): Promise<OBJ.MeshMap> {
  // Load our mesh file
  const [suzanneMesh] = await Asset.loadAsync([
    require("../assets/models/Monkey.obj"),
  ]);

  // Ensure we were successful
  if (!suzanneMesh.localUri) {
    throw new URIError("Unable to find suzanne mesh.");
  }

  // Load the meshes into a MeshMap
  const meshMap = await new Promise<OBJ.MeshMap>((resolve, reject) => {
    OBJ.downloadMeshes({
        'suzanne': suzanneMesh.localUri!,
      }, (meshArray) => {
        // Set the final mesh map
        resolve(meshArray);
      }, {});
  });
  
  // Return the result
  console.log("Models loaded.");
  return meshMap;
}

export function loadModels(gl: WebGLRenderingContext, mm: OBJ.MeshMap | null, attribLocs: ShaderAttributebLocations) {
  // Ensure we have stuff to load
  if (!mm) {
    console.log("Skipping model load, no models to draw.");
    return;
  }

  // Enable needed attrs
  gl.enableVertexAttribArray(attribLocs.vertLoc);
  gl.enableVertexAttribArray(attribLocs.normalLoc);
  gl.enableVertexAttribArray(attribLocs.texLoc);

  //Initialize our buffers
  // Note: We assume a very rigid structure of 3-3-2 floats for vertex-vertexNormal-texCoord
  OBJ.initMeshBuffers(gl, mm.suzanne);
  const mesh = mm.suzanne;

  // Now, prep needed runtime-created variables
  // Get our runtime-created buffers and check for errors
  const vb: WebGLBuffer = (mesh as any).vertexBuffer;
  const vbItemSize: number = (vb as any).itemSize;
  const vn: WebGLBuffer = (mesh as any).normalBuffer;
  const vnItemSize: number = (vb as any).itemSize;
  const tx: WebGLBuffer = (mesh as any).textureBuffer;
  const txItemSize: number = (tx as any).itemSize;
  const ix: WebGLBuffer = (mesh as any).indexBuffer;
  const ixItemSize: number = (ix as any).itemSize;
  const ixLength: number = (ix as any).numItems;
  if (!vb || !vn || !ix || !vbItemSize || !vnItemSize || !ixItemSize || !ixLength) {
    throw Error("No buffers to draw with on model.");
  }

  // Prep buffers
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.vertexAttribPointer(attribLocs.vertLoc, vbItemSize, gl.FLOAT, false, 0, 0);
  if (!mesh.textures.length) { // In case we don't have texture coordinates...
    gl.disableVertexAttribArray(attribLocs.texLoc);
  } else {
    gl.enableVertexAttribArray(attribLocs.texLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, tx);
    gl.vertexAttribPointer(attribLocs.texLoc, txItemSize, gl.FLOAT, false, 0, 0);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, vn);
  gl.vertexAttribPointer(attribLocs.normalLoc, vnItemSize, gl.FLOAT, false, 0, 0);
}

export function drawModels(gl: WebGLRenderingContext, mm: OBJ.MeshMap | null) {
  // Ensure we have stuff to draw
  if (!mm) {
    console.log("Skipping model draw, no models to draw.");
    return;
  }

  // Get our runtime-created buffers and check for errors
  const vb: WebGLBuffer = (mm.suzanne as any).vertexBuffer;
  const vn: WebGLBuffer = (mm.suzanne as any).normalBuffer;
  const ix: WebGLBuffer = (mm.suzanne as any).indexBuffer;
  const ixLength: number = (ix as any).numItems;
  if (!vb || !vn || !ix || !ixLength) {
    throw Error("No buffers to draw with on model.");
  }

  // Render
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ix);
  if (ixLength > 0) {
    gl.drawElements(gl.TRIANGLES, ixLength, gl.UNSIGNED_SHORT, 0);  
  }
}