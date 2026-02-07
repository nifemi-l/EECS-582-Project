#version 100
precision mediump float; // Use medium precision for floats

struct Material {
    vec3 ambient;
    vec3 diffuse;
    vec3 specular;
    float shininess;
};

struct Light {
    vec3 position;
    vec3 ambient;
    vec3 diffuse;
    vec3 specular;
};

varying vec3 Normal;
varying vec3 FragPos;

uniform vec3 uViewPos;
uniform Material uMaterial;
uniform Light uLight;

void main() {
    // Note: for performance these (as is possible) should be moved to the vertex shader eventually

    // Ambient
    vec3 ambient = uLight.ambient * uMaterial.ambient;

    // Diffuse
    vec3 norm = normalize(Normal);
    vec3 lightDir = normalize(uLight.position - FragPos);
    float diff = max(dot(norm, lightDir), 0.0); 
    vec3 diffuse = uLight.diffuse * (diff * uMaterial.diffuse);

    // Specular
    // vec3 viewDir = normalize(uViewPos - FragPos);
    // vec3 reflectDir = reflect(-lightDir, norm); 
    // float spec = pow(max(dot(uViewPos, reflectDir), 0.00001), uMaterial.shininess);
    // vec3 specular = uLight.specular * (spec * uMaterial.specular);
    vec3 specular = vec3(0);

    vec3 result = ambient + diffuse + specular;
    gl_FragColor = vec4(result, 1.0);
}