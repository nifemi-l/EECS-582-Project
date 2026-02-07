import { Asset } from 'expo-asset';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import * as GLM from 'gl-matrix';
import { Platform, View } from "react-native";

export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <GLView style={{width: 300, height: 300}} onContextCreate={onContextCreate} />
    </View>
  );
}

let glRef: ExpoWebGLRenderingContext | null = null;
let shaderProgram: WebGLProgram | null = null;
let lastFrameTime = 0;

class Cube {
   vertices: Float32Array;
   modelMatrices: GLM.mat4[];
   modelLoc: WebGLUniformLocation | null;

   constructor() {
    // Vertices + normal vectors o a cube
    this.vertices = new Float32Array([
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
   }
}
const box = new Cube();

async function onContextCreate(gl: ExpoWebGLRenderingContext) {
  const [vertData, fragData] = await readShaderData();

  // Set our reference
  if (!glRef) {
    glRef = gl;
  }

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
  box.modelLoc = matrixUniformLocs.modelMatrix;

  // Setup our vertex buffer and attribute informations. This is how we know what information is stored where
  const boxBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, boxBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, box.vertices, gl.STATIC_DRAW);
  gl.vertexAttribPointer(attribLocs.vertLoc, 3, gl.FLOAT, false, 6 * 4, 0); // using VAO 0 by default
  gl.enableVertexAttribArray(attribLocs.vertLoc);
  gl.vertexAttribPointer(attribLocs.normalLoc, 3, gl.FLOAT, false, 6 * 4, 4 * 3); // 4 bytes per float * 6 floats stored per vertex = 24 bytes per vertex
  gl.enableVertexAttribArray(attribLocs.normalLoc);  
  gl.useProgram(program);

  // Create our perspective matrix
  const projectionMatrix = GLM.mat4.create();
  const viewMatrix = GLM.mat4.create();
  GLM.mat4.perspective(projectionMatrix, (45 * Math.PI / 180), gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 100.0);
  GLM.mat4.translate(box.modelMatrices[0], box.modelMatrices[0], [1.0, -1.0, -5.0]);
  GLM.mat4.rotateY(box.modelMatrices[0], box.modelMatrices[0], 15);
  GLM.mat4.translate(box.modelMatrices[1], box.modelMatrices[1], [-1.0, -1.0, -5.0]);
  GLM.mat4.translate(box.modelMatrices[2], box.modelMatrices[2], [1.0, 1.0, -5.0]);
  GLM.mat4.translate(box.modelMatrices[3], box.modelMatrices[3], [-1.0, 1.0, -5.0]);
  gl.uniformMatrix4fv(matrixUniformLocs.projectionMatrix, false, projectionMatrix as Float32Array);
  gl.uniformMatrix4fv(matrixUniformLocs.modelMatrix, false, box.modelMatrices[0] as Float32Array);
  gl.uniformMatrix4fv(matrixUniformLocs.viewMatrix, false, viewMatrix as Float32Array);

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
    if (!box.modelLoc) {
      console.error("No model matrix location");
      return;
    }

    // Check time
    const delta = (time - lastFrameTime) / 1000;
    lastFrameTime = time;

    // Prepare draw
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Box 1
    GLM.mat4.rotateY(box.modelMatrices[0], box.modelMatrices[0], delta);
    gl.uniformMatrix4fv(box.modelLoc, false, box.modelMatrices[0] as Float32Array);
    gl.drawArrays(gl.TRIANGLES, 0, 36);

    // Box 2
    GLM.mat4.rotateX(box.modelMatrices[1], box.modelMatrices[1], delta * 2);
    gl.uniformMatrix4fv(box.modelLoc, false, box.modelMatrices[1] as Float32Array);
    gl.drawArrays(gl.TRIANGLES, 0, 36);

    // Box 3
    GLM.mat4.rotateZ(box.modelMatrices[2], box.modelMatrices[2], delta * 3);
    gl.uniformMatrix4fv(box.modelLoc, false, box.modelMatrices[2] as Float32Array);
    gl.drawArrays(gl.TRIANGLES, 0, 36);

    // Box 4
    GLM.mat4.rotateY(box.modelMatrices[3], box.modelMatrices[3], delta * -1);
    gl.uniformMatrix4fv(box.modelLoc, false, box.modelMatrices[3] as Float32Array);
    gl.drawArrays(gl.TRIANGLES, 0, 36);

    // End frame
    gl.flush();
    gl.endFrameEXP();
    window.requestAnimationFrame(drawFrame);
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