/* PROLOGUE
File name: billboard.frag
Description: The billboard's fragment shader used in our graphics pipeline
Programmer: Jack Bauer
Creation date: 2/28/26
Revision date: None
Preconditions: The position of the buildboard vertex in local space (it gets automatically interpolated across all the fragments)
Postconditions: The final fragment's color
Errors: None.
Side effects: None
Invariants: None
Known faults: None
*/

#version 100 // Since we use WebGL version 1.0
precision mediump float; // Use medium precision for floats

uniform float uHealthPercent; // the current health percentage of the chore

varying vec2 vLocalQuadCoords; // the position of the billboard vertex in local space to the billboard interpolated across the fragment

void main() {
    // Adjust coords from NDC [-1, 1] to [0, 1] to match the health percent
    // If our position is past the current health percent, then show red. Otherwise, show green
    if ((vLocalQuadCoords.x + 1.0) * 0.5 > uHealthPercent) {
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    } else {
        gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
    }
}