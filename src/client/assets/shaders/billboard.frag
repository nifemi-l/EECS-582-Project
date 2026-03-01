/* PROLOGUE
File name: billboard.frag
Description: The billboard's fragment shader used in our graphics pipeline
Programmer: Jack Bauer
Creation date: 2/28/26
Revision date: None
Preconditions: None
Postconditions: The final fragment's color
Errors: None.
Side effects: None
Invariants: None
Known faults: None
*/

#version 100 // Since we use WebGL version 1.0
precision mediump float; // Use medium precision for floats

void main() {
    // Output our final color result for the fragment
    gl_FragColor = vec4(1.0);
}