/* PROLOGUE
File name: main.vert
Description: The primary vertex shader used in our graphics pipeline
Programmer: Jack Bauer
Creation date: 2/6/26
Revision date: 
  - 2/15/26: Add comments
Preconditions: Vector3s for vertex attributes and 4D Matrices for transformations
Postconditions: the position of each vertex, its model adjusted normal, and the adjusted model position of each vertex used by the fragment shader.
Errors: None.
Side effects: None
Invariants: None
Known faults: None
*/

#version 100 // WebGL version 1.0

// The specific vertex attributes. In our case we use a series of 3 position values
// and 3 normal values for each vertex. 
attribute vec3 aVertPos;
attribute vec3 aNormal;

// The values that are the same for each instance of a shader being run during one frame.
// These are the matrices used to transform model space to the final space shown on the screen. 
uniform mat4 uModel; // Model defined in its own terms transformed from model to world space
uniform mat4 uView; // Where the camera is
uniform mat4 uProjection; // Using a perspective projection

// Output the final calculated model-adjusted normal values and vertex position values used by the fragment shader
varying vec3 Normal;
varying vec3 FragPos;

// See https://learnopengl.com for reference
void main() {
    gl_Position = uProjection * uView * uModel * vec4(aVertPos, 1.0); // Output the position of the vertex after being transformed
    Normal = mat3(uModel) * aNormal; // Since there is no non-uniform scaling, this is fine to calculate the vertex's normal (allowing for model transformations)
    FragPos = vec3(uModel * vec4(aVertPos, 1.0)); // Output the position of the resulting fragment after the model transformation
}