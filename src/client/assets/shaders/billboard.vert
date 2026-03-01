/* PROLOGUE
File name: billboard.vert
Description: The billboard's vertex shader used in our graphics pipeline
Programmer: Jack Bauer
Creation date: 2/28/26
Revision date: None
Preconditions: Valid model, view, projection, matrices and vertex information
Postconditions: The final position of the vertex on the screen
Errors: None.
Side effects: None
Invariants: None
Known faults: None
*/

#version 100 // Since we use WebGL version 1.0
precision mediump float; // Use medium precision for floats

attribute vec3 aVertPos; // The vertex's position in local space to its own object

uniform mat4 uModel; // Model defined in its own terms transformed from model to world space
uniform mat4 uView; // Where the camera is
uniform mat4 uProjection; // Using a perspective projection

void main() {
    gl_Position = uProjection * uView * uModel * vec4(aVertPos, 1.0); // Output the position of the vertex after being transformed
}