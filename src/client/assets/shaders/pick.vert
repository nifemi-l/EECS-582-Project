/* PROLOGUE
File name: pick.vert
Description: A shader used to "pick" an object based on color
Programmer: Jack Bauer
Creation date: 4/6/26
Revision date: None
Preconditions: None
Postconditions: None
Errors: None.
Side effects: None
Invariants: None
Known faults: None
*/

#version 100 // Since we use WebGL version 1.0
precision mediump float; // Use medium precision for floats

attribute vec3 aPosition;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjMatrix;

void main() {
    // We only care about position in this shader. Apply the same model view projection process as the main shader.
    gl_Position = uProjMatrix * uViewMatrix * uModelMatrix * vec4(aPosition, 1.0);
}