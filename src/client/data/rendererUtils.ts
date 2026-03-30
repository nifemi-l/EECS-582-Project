/* PROLOGUE
File name: rendererUtils.ts
Description: Provide renderer functionality to the application.
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

// GL & Library imports 
import * as GLM from 'gl-matrix';

// Import server classes
import Task from "./task";
import Feature from "./feature";
import Household from "./household";

// Import graphics utilities
import {
  MoveDirection, Material, genGrid,
  FEATURE_ORANGE, FEATURE_GREY,
  checkCellInBounds, checkValidCell
} from "./graphicsUtils" 

// ***********************************************************
//                       Renderer Classes
// ***********************************************************

// Store details needed for a functional renderer
export class Renderer {

}

// A class to represent the camera object. This manages the world view matrix
export class Camera {
  viewMatrix: GLM.mat4; // The view matrix used to setup the projection
  viewLoc: WebGLUniformLocation | null; // The location to access and provide the view matrix data for the shaders to use
  projectionMatrix: GLM.mat4;
  projectionLoc: WebGLUniformLocation | null; // same as above but for the projection matrix

  // Billboard values
  bbViewLoc: WebGLUniformLocation | null; // The location to access and provide the view matrix data for the shaders to use
  bbProjectionLoc: WebGLUniformLocation | null; // same as above but for the projection matrix
  bbInverseViewLoc: WebGLUniformLocation | null; // for the inverse of the view

  // Constructor. Initialize the viewLocation to null since we have no gl context yet, and create an identity view matrix
  constructor() {
    this.viewMatrix = GLM.mat4.create();

    // We cannot determine these without a GL context
    this.viewLoc = null;
    this.projectionLoc = null;
    this.bbViewLoc = null;
    this.bbProjectionLoc = null;
    this.bbInverseViewLoc = null;

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
   modelLoc: WebGLUniformLocation | null; // The location to access and provide the model matrix data for the shaders to use
   ambientLoc: WebGLUniformLocation | null; // The location to access and provide the color material data for the shaders to use
   diffuseLoc: WebGLUniformLocation | null; // The location to access and provide the color material data for the shaders to use
   specularLoc: WebGLUniformLocation | null; // The location to access and provide the color material data for the shaders to use
   shininessLoc: WebGLUniformLocation | null; // The location to access and provide the color material data for the shaders to use

   // Billboard related values
   bbBuffer: WebGLBuffer | null; // A way to access the buffer storing cube vertex data on the GPU
   bbVertices: Float32Array; // The vertices of the billboard quad
   bbVao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null; // A single object to store the vertex attribute data and which buffer to bind for the household
   bbModelLoc: WebGLUniformLocation | null; // The location to access and provide the model matrix data for the shaders to use
   bbHeightOffsetLoc: WebGLUniformLocation | null; // access to the height offset uniform
   bbHealthPercentLoc: WebGLUniformLocation | null; // access to the healthbar's health percent uniform

   // change the size of the floor feature to match the grid
   resizeFloorFeature() {
    // floor feature is always the first feature in the features array
    const floorMatrix = GLM.mat4.create();
    GLM.mat4.scale(floorMatrix, floorMatrix, [grid.width, 0.5, grid.height]);
    GLM.mat4.translate(floorMatrix, floorMatrix, [0, -0.51, 0]); // The 0.5s account for the difference between the cell center and edges
    const floorFeature = new RenderableFeature("Floor", this.household_id, floorMatrix, FEATURE_GREY, 0, -1, 0); // Set to one below for now (does not coorespond to model matrix) so we don't accidentally delete it
    floorFeature.tasks = []; // reset tasks so no healthbar
    this.renderableFeatures[0] = floorFeature;
   }
   
   // Moves the selected edit feature one cell over based on the input direction
   moveSelectedFeatureByOne(dir: MoveDirection) {
    // Ensure we have a feature selected
    if (!selectedEditFeature) {
      console.error("Attempting to move null feature.");
      return;
    }

    // Apply movement. First, check if the proposed move would be within bounds. Then, apply updates to the model matrices and XYZ values.
    switch (dir) {
      case MoveDirection.POS_X:
        if (checkValidCell(selectedEditFeature.x_pos + 1, selectedEditFeature.y_pos, selectedEditFeature.z_pos)) {
          selectedEditFeature.x_pos += 1;
          GLM.mat4.translate(selectedEditFeature.modelMatrix, selectedEditFeature.modelMatrix, [1, 0, 0]);
        }
        break;
      case MoveDirection.NEG_X:
        if (checkValidCell(selectedEditFeature.x_pos - 1, selectedEditFeature.y_pos, selectedEditFeature.z_pos)) {
          selectedEditFeature.x_pos -= 1;
          GLM.mat4.translate(selectedEditFeature.modelMatrix, selectedEditFeature.modelMatrix, [-1, 0, 0]);
        }
        break;
      case MoveDirection.POS_Z:
        if (checkValidCell(selectedEditFeature.x_pos, selectedEditFeature.y_pos, selectedEditFeature.z_pos + 1)) {
          selectedEditFeature.z_pos += 1;
          GLM.mat4.translate(selectedEditFeature.modelMatrix, selectedEditFeature.modelMatrix, [0, 0, 1]);
        }
        break;
      case MoveDirection.NEG_Z:
        if (checkValidCell(selectedEditFeature.x_pos, selectedEditFeature.y_pos, selectedEditFeature.z_pos - 1)) {
          selectedEditFeature.z_pos -= 1;
          GLM.mat4.translate(selectedEditFeature.modelMatrix, selectedEditFeature.modelMatrix, [0, 0, -1]);
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

   constructor(name: string) {
    super(name);

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
    this.modelLoc = null;
    this.ambientLoc = null;
    this.diffuseLoc = null;
    this.specularLoc = null;
    this.shininessLoc = null;
    this.bbModelLoc = null;
    this.bbHeightOffsetLoc = null;
    this.bbHealthPercentLoc = null;
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

  // For cases where we want to resize the grid
  resize(w: number, h: number) {
    if (w <= 1 || h <= 1) {
      console.error("Invalid grid size given.");
      return;
    }

    // Note: this function should not be called in the render loop
    if (!glRef) {
      console.error("Cannot resize grid without OpenGL context.");
      return;
    }

    // Set member data
    this.width = w;
    this.height = h;
    this.gridVertices = genGrid(this.width, this.height);

    bindVAO(this.vao);
    glRef.bindBuffer(glRef.ARRAY_BUFFER, this.buffer);
    glRef.bufferData(glRef.ARRAY_BUFFER, grid.gridVertices, glRef.STATIC_DRAW); 
    bindVAO(null);
  }

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

// ***********************************************************
//                    Renderer Utilities
// ***********************************************************

// Since WebGL 1.0 and 2.0 create vertex array objects (explained above) differently, we need a wrapper function. 
export function createVAO() {
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
export function bindVAO(vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null) {
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

// A function to add a block to the household at a certain position
export function addBlock(cellX: number, cellY: number, cellZ: number) {
  // Ensure our cell position is in bounds
  if (!checkCellInBounds(cellX, cellY, cellZ)) {
    return;
  }

  // Ensure we haven't already placed a block here. If we have, remove it 
  if (!checkValidBlockAndRemove(cellX, cellY, cellZ)) {
    return;
  }

  const newModelMatrix = GLM.mat4.create(); // create a new transform 
  GLM.mat4.translate(newModelMatrix, newModelMatrix, [cellX + 0.5, cellY + 0.5, cellZ + 0.5]); // The 0.5s account for the difference between the cell center and edges
  const newMaterial: Material = currentDrawingColor;
  const newFeature = new RenderableFeature("f:" + cellX + cellY + cellZ, house.household_id, newModelMatrix, newMaterial, cellX, cellY, cellZ); // this is the new feature object we're adding
  // randomly add a second chore for demo purposes
  if (Math.round(Math.random()) == 0) {
    newFeature.addTask(new Task("Test Task", newFeature.id, 1));
  }
  house.renderableFeatures.push(newFeature); // add the feature to the house
}

// A function to convert screen clicks / taps from screen coordinates to world coordinates in the renderer
export function screenToWorldCoords(screenX: number, screenY: number) {
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
    console.error("Failing, unable to calculate a ray.")
    return null;
  }  
  const t = -1.0 * front[1] / dir[1];
  const finalPos = GLM.vec3.fromValues(front[0] + dir[0] * t, 0, front[2] + dir[2] * t);

  return finalPos;
}