/* PROLOGUE
File name: main.frag
Description: The primary fragment shader used in our graphics pipeline
Programmer: Jack Bauer
Creation date: 2/6/26
Revision date: 
  - 2/15/26: Add comments
Preconditions: conforming lighting and material structures, the camera's position, and the model-adjusted normal and position for each fragment.
Postconditions: the final color each fragment should be
Errors: None.
Side effects: None
Invariants: None
Known faults: None
*/

#version 100 // Since we use WebGL version 1.0
precision mediump float; // Use medium precision for floats

// Define the necessary information for a material to be used
struct Material {
    vec3 ambient;
    vec3 diffuse;
    vec3 specular;
    float shininess;
};

// Using the phong lighting model, these structure the type of lighting information used.
struct Light {
    vec3 position;
    vec3 ambient;
    vec3 diffuse;
    vec3 specular;
};

// Vertex information that may change for each running instance of the shader (originates from the vertex attributes)
// but are modified in the vertex shader and passed here
varying vec3 Normal;
varying vec3 FragPos;

// Variables that are the same for every instance of the shader being ran
// Lighting information, material information, and the view matrix. 
uniform vec3 uViewPos;
uniform Material uMaterial;
uniform Light uLight;

// See https://learnopengl.com for reference
void main() {
    // Note: for performance these (as is possible) should be moved to the vertex shader eventually

    // Ambient - the basic lighting that exists
    vec3 ambient = uLight.ambient * uMaterial.ambient;

    // Diffuse - scattered light from a source
    // Normalize the normal value, then normalize the difference of the lighting position and fragment position
    // to get the direction from the light, then get the max between either 0 or the dot product of the difference between 
    // the surface normal and light direction, then finally use the material to calculate a diffuse value for the fragment. 
    vec3 norm = normalize(Normal);
    vec3 lightDir = normalize(uLight.position - FragPos);
    float diff = max(dot(norm, lightDir), 0.0); 
    vec3 diffuse = uLight.diffuse * (diff * uMaterial.diffuse);

    // Specular - direct lighting from a source. We skip for performance reasons
    vec3 specular = vec3(0);

    // Calculate the final lighting result by adding all components together
    vec3 result = ambient + diffuse + specular;

    // Output our final color result for the fragment
    gl_FragColor = vec4(result, 1.0);
}