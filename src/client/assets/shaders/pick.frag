/* PROLOGUE
File name: pick.frag
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

uniform vec4 objectID;

void main() {
    // Only the object ID should determine the final color.
    gl_FragColor = objectID;
}