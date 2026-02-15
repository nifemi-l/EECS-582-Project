import { Asset } from 'expo-asset';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import * as GLM from 'gl-matrix';
import { Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewToggle from "./components/ViewToggle";

export default function Index() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f0f2f5" }} edges={["top"]}>
      <ViewToggle active="3d" />
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <GLView style={{width: 300, height: 300}} onContextCreate={onContextCreate} />
      </View>
    </SafeAreaView>
  );
}

let glRef: ExpoWebGLRenderingContext | null = null;
let shaderProgram: WebGLProgram | null = null;
let lastFrameTime = 0;
let oesExt: OES_vertex_array_object | null = null;

class Household {
   blockVertices: Float32Array;
   modelMatrices: GLM.mat4[];
   modelLoc: WebGLUniformLocation | null;
   buffer: WebGLBuffer | null;
   vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null;

   constructor() {
    // Vertices + normal vectors o a cube
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

    this.modelMatrices = [GLM.mat4.create(), GLM.mat4.create(), GLM.mat4.create(), GLM.mat4.create()];
    this.modelLoc = null;
    this.buffer = null;
    this.vao = null;
   }
}
const house = new Household();

class Grid {
  gridVertices: Float32Array;
  modelMatrx: GLM.mat4;
  buffer: WebGLBuffer | null;
  vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null;

  constructor() {
    this.gridVertices = new Float32Array([
      -100.0, 0.0, 0.0,
      100.0, 0.0, 0.0,
    ]);
    
    this.modelMatrx = GLM.mat4.create();
    this.buffer = null;
    this.vao = null;
  }
}
const grid = new Grid();

async function onContextCreate(gl: ExpoWebGLRenderingContext) {
  const [vertData, fragData] = await readShaderData();

  // Get the OES Vertex Array Object extension
  // This is needed because these VAOs provide very useful functionality (we don't have to define vertex array attributes
  // every frame). However, since we need to support WebGL 1.0 (for older Raspberry Pis), we need to pull this in as an extension
  // as this functionality is only native in WebGL 2.0. To make things more annoying, often this functionality is NOT available in WebGL 2.0 
  // contexts. So, it's stupid, but we have to support both. This getExtension(...) call will either return an object or null.
  oesExt = gl.getExtension('OES_vertex_array_object'); 
  console.log("OES VAO Extension available:", oesExt);

  // Reset everything so it works when navigating back to this page
  glRef = gl;
  shaderProgram = null;
  lastFrameTime = 0;
  house.modelMatrices = [GLM.mat4.create(), GLM.mat4.create(), GLM.mat4.create(), GLM.mat4.create()];
  house.modelLoc = null;

  // See expo documentation here: https://docs.expo.dev/versions/latest/sdk/gl-view/#usage
  // See also: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Adding_2D_content_to_a_WebGL_context 

  // Setup initial parameters
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0.4, 0, 0.4, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  // Create vertex shader (shape & position)
  const vert: WebGLShader | null = gl.createShader(gl.VERTEX_SHADER);
  if (vert === null) {
    console.error("Error creating vertex shader.");
    gl.deleteShader(vert);
    return;
  } 
  gl.shaderSource(vert, vertData);
  gl.compileShader(vert);

  // Create fragment shader (color)
  const frag: WebGLShader | null = gl.createShader(gl.FRAGMENT_SHADER);
  if (frag === null) {
    console.error("Error creating fragment shader.");
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return;
  } 
  gl.shaderSource(frag, fragData);
  gl.compileShader(frag);

  // Ensure shaders are compiled correctly
  if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
    console.error("Shaders failed to compile - ", gl.getShaderInfoLog(vert), " - AND - ", gl.getShaderInfoLog(frag));
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return;
  }

  // Link together into a program
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  shaderProgram = program;

  // Get attribute and uniform location information fo the shader program
  const attribLocs = {
    // We need to figure out where these attributes are being stored on the GPU
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
    // These are used in lighting calculations
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
  house.modelLoc = matrixUniformLocs.modelMatrix;

  // Setup our vertex buffer and attribute informations. This is how we know what information is stored where
  house.buffer = gl.createBuffer();
  house.vao = createVAO();
  bindVAO(house.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, house.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, house.blockVertices, gl.STATIC_DRAW);
  gl.vertexAttribPointer(attribLocs.vertLoc, 3, gl.FLOAT, false, 6 * 4, 0); // using VAO 0 by default
  gl.enableVertexAttribArray(attribLocs.vertLoc);
  gl.vertexAttribPointer(attribLocs.normalLoc, 3, gl.FLOAT, false, 6 * 4, 4 * 3); // 4 bytes per float * 6 floats stored per vertex = 24 bytes per vertex
  gl.enableVertexAttribArray(attribLocs.normalLoc);  
  bindVAO(null);

  // Grid vertices
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

  // Select our shader program
  gl.useProgram(program);

  // Create our perspective matrix
  const projectionMatrix = GLM.mat4.create();
  const viewMatrix = GLM.mat4.create();
  GLM.mat4.perspective(projectionMatrix, (45 * Math.PI / 180), gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 100.0);
  GLM.mat4.translate(house.modelMatrices[0], house.modelMatrices[0], [0.0, 0.0, -5.0]);
  // GLM.mat4.rotateY(house.modelMatrices[0], house.modelMatrices[0], 15);
  // GLM.mat4.translate(house.modelMatrices[1], house.modelMatrices[1], [-1.0, -1.0, -5.0]);
  // GLM.mat4.translate(house.modelMatrices[2], house.modelMatrices[2], [1.0, 1.0, -5.0]);
  // GLM.mat4.translate(house.modelMatrices[3], house.modelMatrices[3], [-1.0, 1.0, -5.0]);
  gl.uniformMatrix4fv(matrixUniformLocs.projectionMatrix, false, projectionMatrix as Float32Array);
  gl.uniformMatrix4fv(matrixUniformLocs.modelMatrix, false, house.modelMatrices[0] as Float32Array);
  gl.uniformMatrix4fv(matrixUniformLocs.viewMatrix, false, viewMatrix as Float32Array);

  // Move the grid lines back
  GLM.mat4.translate(grid.modelMatrx, grid.modelMatrx, [0.0, 0.0, -5.0]);

  // Setup lighting
  gl.uniform3fv(lightUniformLocs.viewPosition, [0, 0, 0]);
  gl.uniform3fv(lightUniformLocs.material.ambient, [1.0, 0.5, 0.31]);
  gl.uniform3fv(lightUniformLocs.material.diffuse, [1.0, 0.5, 0.31]);
  gl.uniform3fv(lightUniformLocs.material.specular, [0.5, 0.5, 0.5]);
  gl.uniform1f(lightUniformLocs.material.shininess, 32.0);
  gl.uniform3fv(lightUniformLocs.light.position, [0.0, 0.0, 0.6]);
  gl.uniform3fv(lightUniformLocs.light.ambient, [1.0, 0.5, 0.31]);
  gl.uniform3fv(lightUniformLocs.light.diffuse, [1.0, 0.5, 0.31]);
  gl.uniform3fv(lightUniformLocs.light.specular, [1.0, 1.0, 1.0]);

  // Start drawing frames
  drawFrame(lastFrameTime);

  gl.deleteShader(vert); // not needed anymore
  gl.deleteShader(frag); // same here
}

function drawFrame(time: number) {
    // Ensure we have an OpenGL context
    if (!glRef) {
      console.error("Frame drawn without a WebGL context");
      return;
    }
    const gl = glRef;

    // Ensure we have a valid shader program
    if (!shaderProgram) {
      console.error("Frame drawn without a shader program");
      return;
    }
    const program = shaderProgram;

    // Ensure we have a valid location for the model matrix uniform
    if (!house.modelLoc) {
      console.error("No model matrix location");
      return;
    }

    // Ensure we have proper house and grid buffers
    if (!house.buffer || !grid.buffer) {
      console.error("Invalid buffers.");
      return;
    }

    // Ensure we have proper house and grid vertex array objects (VAOs)
    if (!house.vao || !grid.vao) {
      console.error("Invalid VAOs.");
      return;
    }

    // Check time
    const delta = (time - lastFrameTime) / 1000;
    lastFrameTime = time;

    // Prepare draw
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Cube draw calls
    bindVAO(house.vao);

    // Cube 1
    GLM.mat4.rotateY(house.modelMatrices[0], house.modelMatrices[0], delta);
    gl.uniformMatrix4fv(house.modelLoc, false, house.modelMatrices[0] as Float32Array);
    gl.drawArrays(gl.TRIANGLES, 0, 36);

    // // Cube 2
    // GLM.mat4.rotateX(house.modelMatrices[1], house.modelMatrices[1], delta * 2);
    // gl.uniformMatrix4fv(house.modelLoc, false, house.modelMatrices[1] as Float32Array);
    // gl.drawArrays(gl.TRIANGLES, 0, 36);

    // // Cube 3
    // GLM.mat4.rotateZ(house.modelMatrices[2], house.modelMatrices[2], delta * 3);
    // gl.uniformMatrix4fv(house.modelLoc, false, house.modelMatrices[2] as Float32Array);
    // gl.drawArrays(gl.TRIANGLES, 0, 36);

    // // Cube 4
    // GLM.mat4.rotateY(house.modelMatrices[3], house.modelMatrices[3], delta * -1);
    // gl.uniformMatrix4fv(house.modelLoc, false, house.modelMatrices[3] as Float32Array);
    // gl.drawArrays(gl.TRIANGLES, 0, 36);

    // Grid
    bindVAO(grid.vao);
    gl.uniformMatrix4fv(house.modelLoc, false, grid.modelMatrx as Float32Array);
    gl.drawArrays(gl.LINES, 0, 2);

    // End frame
    gl.flush();
    gl.endFrameEXP();
    window.requestAnimationFrame(drawFrame);
}

function createVAO() {
  // Ensure we have a WebGL context
  if (!glRef) {
    console.error("No gl context.");
    return null;
  }

  if (!oesExt) {
    // WebGL 2.0
    return glRef.createVertexArray();
  } else {
    // WebGL 1.0
    return oesExt.createVertexArrayOES();
  }
}

function bindVAO(vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null) {
  // Ensure we have a WebGL context
  if (!glRef) {
    console.error("No gl context.");
    return null;
  }

  if (!oesExt) {
    // WebGL 2.0
    return glRef.bindVertexArray(vao);
  } else {
    // WebGL 1.0
    return oesExt.bindVertexArrayOES(vao);
  }
}

async function readShaderData() {
  const [vertFile, fragFile] = await Asset.loadAsync([
    require("../assets/shaders/main.vert"),
    require("../assets/shaders/main.frag"),
  ]);

  if (!vertFile.localUri) {
    throw new URIError("Unable to find vertex shader.");
  }

  if (!fragFile.localUri) {
    throw new URIError("Unable to find fragment shader.");
  }

  if (Platform.OS === 'web') {
    const vertSrc = await (await fetch(vertFile.localUri)).text();
    const fragSrc = await (await fetch(fragFile.localUri)).text();
    return [vertSrc, fragSrc]
  } else {
    const vertSrc = await readAsStringAsync(vertFile.localUri);
    const fragSrc = await readAsStringAsync(fragFile.localUri);
    return [vertSrc, fragSrc];
  }
}