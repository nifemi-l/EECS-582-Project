/* PROLOGUE
File name: graphicsUtils.ts
Description: Provide support and organization for a variety of graphics-related utility functions.
Programmer: Jack Bauer
Creation date: 3/29/26
Revision date: 
  - No revisions yet
Preconditions: None
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
import { Platform } from 'react-native'

// ***********************************************************
//  Constants, Enums, and Interfaces (and related functions)
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

// This needs to be a function so that we can dynamically change the tool in gestures
export function isUsingEditTool(currentTool: Tool) {
  return currentTool === Tool.TOOL_EDIT_FEATURE;
}

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

// Given coordinates, select the feature in the house lists
export function findAndSetSelectedFeature(cellX: number, cellY: number, cellZ: number) {
  // iterate through house features. We do it in the order x, z, y since y should always be constant so far (we only support the xz plane)
  // There should also only ever be one feature that matches
  for (let i = 0; i < house.renderableFeatures.length; i++) {
    if (house.renderableFeatures[i].x_pos != cellX || house.renderableFeatures[i].z_pos != cellZ || house.renderableFeatures[i].y_pos != cellY) {
      continue;
    } else {
      // if this is already selected, deselect. Otherwise, select it
      if (selectedEditFeature === house.renderableFeatures[i]) {
        setSelectedEditFeature(null);
      } else {
        setSelectedEditFeature(house.renderableFeatures[i]);
      }
    }
  }
}

// Check if a block already exists on the cell - check against all existing cells. If it does, remove what's there
export function checkValidBlockAndRemove(cellX: number, cellY: number, cellZ: number) {
  // copy array to new array, without the removed element. We'll do this as we iterate. If we find one to remove, set the result bool
  let success = true;
  let copyArray = []; 
  for (let i = 0; i < house.renderableFeatures.length; i++) {
    if (house.renderableFeatures[i].x_pos == cellX && house.renderableFeatures[i].y_pos == cellY && house.renderableFeatures[i].z_pos == cellZ) {
      // We've found a feature not to keep
      success = false;
    } else {
      // We've found a feature we want to keep
      copyArray.push(house.renderableFeatures[i]);
    }
  }
  // update house array and return success or not
  house.renderableFeatures = copyArray;
  return success;
}

// Check if a block already exists in a cell without removing
export function checkCellFree(cellX: number, cellY: number, cellZ: number) {
  // Iterate over the features and see if something is in the provided cell. If so, we know it is not free
  for (let i = 0; i < house.renderableFeatures.length; i++) {
    if (house.renderableFeatures[i].x_pos == cellX && house.renderableFeatures[i].y_pos == cellY && house.renderableFeatures[i].z_pos == cellZ) {
      return false;
    } 
  }
  return true;
}

// See if a cell is within the bounds of the grid
export function checkCellInBounds(cellX: number, cellY: number, cellZ: number) {
  // Disallow invalid block positions. For a grid of size 10,10 we allow range [-5, 4] in the xz directions. We lock to the xz plane (y=0)
  const halfGridWidth = Math.floor(grid.width / 2);
  const halfGridHeight = Math.floor(grid.height / 2);
  if ((cellX < 0 - halfGridWidth || cellX >= halfGridWidth) || Math.abs(cellY) > 0 || (cellZ < 0 - halfGridHeight || cellZ >= halfGridHeight)) {
    return false;
  }
  return true;
}

// A wrapper function to check if a cell is both free and within the grid
export function checkValidCell(cellX: number, cellY: number, cellZ: number) {
  return checkCellInBounds(cellX, cellY, cellZ) && checkCellFree(cellX, cellY, cellZ);
}

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
//                  File IO Utilities
// ***********************************************************

// Read shader data from a .vert or .frag file (for vertex or fragment shaders), then return that file
// as a single string for later use in WebGL. I have no idea why they designed it this way, but WebGL wants
// a string. 
export async function readShaderData() {
  // Load our vertex and fragment files. 
  const [vertFile, fragFile, bbVertFile, bbFragFile] = await Asset.loadAsync([
    require("../../../assets/shaders/main.vert"),
    require("../../../assets/shaders/main.frag"),
    require("../../../assets/shaders/billboard.vert"),
    require("../../../assets/shaders/billboard.frag"),
  ]);

  // Ensure we have a vertex shader (at least one is required), if not throw an error
  if (!vertFile.localUri) {
    throw new URIError("Unable to find vertex shader.");
  }

  // Ensure we have a fragment shader (at least one is required), if not throw an error
  if (!fragFile.localUri) {
    throw new URIError("Unable to find fragment shader.");
  }

  // Ensure we have out billboard vertex shader, if not throw an error
  if (!bbVertFile.localUri) {
    throw new URIError("Unable to find billboard vertex shader.");
  }

  // Ensure we have out billboard fragment shader, if not throw an error
  if (!bbFragFile.localUri) {
    throw new URIError("Unable to find billboard fragment shader.");
  }

  // Web and mobile bundle files differently. On web, we fetch it using a URL as if we were fetching an external resource.
  // On mobile, we can just read the file since it is bundled with the application. Once read, return the file data as text / string data.
  if (Platform.OS === 'web') {
    const vertSrc = await (await fetch(vertFile.localUri)).text(); // .text() is a promise, like fetch, hence the double await
    const fragSrc = await (await fetch(fragFile.localUri)).text();
    const bbVertSrc = await (await fetch(bbVertFile.localUri)).text();
    const bbFragSrc = await (await fetch(bbFragFile.localUri)).text();
    return [vertSrc, fragSrc, bbVertSrc, bbFragSrc]
  } else {
    const vertSrc = await readAsStringAsync(vertFile.localUri);
    const fragSrc = await readAsStringAsync(fragFile.localUri);
    const bbVertSrc = await readAsStringAsync(bbVertFile.localUri);
    const bbFragSrc = await readAsStringAsync(bbFragFile.localUri);
    return [vertSrc, fragSrc, bbVertSrc, bbFragSrc];
  }
}