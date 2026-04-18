/* PROLOGUE
File name: billboard.frag
Description: The billboard's fragment shader used in our graphics pipeline
Programmer: Jack Bauer
Creation date: 2/28/26
Revision date: 
  - 4/18/26: Highlight selected task and health bar
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
uniform vec4 uFillColor; // color for health bar fill (i.e. green)
uniform vec4 uBackgroundColor; // color for health bar background (i.e. red)
uniform vec4 uHighlightColor; // color for health bar highlight on select
uniform bool uSelected; // If the current feature is selected or not

varying vec2 vLocalQuadCoords; // the position of the billboard vertex in local space to the billboard interpolated across the fragment

void main() {
    // Adjust coords from NDC [-1, 1] to [0, 1] to match the health percent
    float adjX = (vLocalQuadCoords.x + 1.0) * 0.5;
    float adjY = (vLocalQuadCoords.y + 1.0) * 0.5;

    // Set the starting color
    // If our position is past the current health percent, then show red. Otherwise, show green 
    vec4 startColor = adjX > uHealthPercent ? uBackgroundColor : uFillColor;

    // Calculate the distance from our fragment to the edge of the billboard
    // minimum distance is therefore bounded in the range [0.0, 0.5]
    float distX = min(adjX, 1.0 - adjX);
    float distY = min(adjY, 1.0 - adjY);

    // Calculate the edge between the highlight and the main part of the healthabr
    float highlightThresholdY = 0.45;
    float highlightThresholdX = 0.04;

    // Return 1 if val > threshold, otherwise 0. So, invert that: 
    // if our position is within the threshold, return 1 else 0
    float resultX = 1.0 - step(highlightThresholdX, distX); // 1.0 if within x threshold, else 0.0
    float resultY = 1.0 - step(highlightThresholdY, distY); // 1.0 if within y threshold, else 0.0
    float inBounds = step(1.0, resultX + resultY); // returns 1.0 if within bounds (i.e. x + y result >= 1.0, otherwise 0.0)

    // If in bounds, use the highlight color
    gl_FragColor = uSelected ? mix(startColor, uHighlightColor, inBounds) : startColor;
}