/* PROLOGUE
File name: billboard.vert
Description: The billboard's vertex shader used in our graphics pipeline
Programmer: Jack Bauer
Creation date: 2/28/26
Revision date: None
Preconditions: Valid model, view, inverse view, projection, matrices, height offsets, and vertex information
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
uniform mat4 uInverseView; // the inverse view matrix (view is world->camera space, so this is camera->world space)
uniform mat4 uProjection; // Using a perspective projection
uniform float uHeightOffset; // for cases where there are multiple stacked healthbars

varying vec2 vLocalQuadCoords; // Pass the local coords of the 2D box to the fragment shader

void main() {
    vec3 bbCenter = uModel[3].xyz; // get the world translation of the billboard to find the center
    vec3 camRight = uInverseView[0].xyz; // camera right is in first column of the inverse view matrix
    vec3 camUp = uInverseView[1].xyz; // up is in the second column
    vec3 worldPos = bbCenter + camRight * aVertPos.x + camUp * aVertPos.y; // get the world position of the vertex after offsets
    worldPos.y += uHeightOffset; // adjust height 
    gl_Position = uProjection * uView * vec4(worldPos, 1.0); // Output the position of the vertex after being transformed
    vLocalQuadCoords = aVertPos.xy; // Since the billboard will always face the camera, we just pass along the local 2D coordinates
}