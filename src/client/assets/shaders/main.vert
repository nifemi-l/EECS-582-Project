#version 100
attribute vec3 aVertPos;
attribute vec3 aNormal;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;

varying vec3 Normal;
varying vec3 FragPos;

void main() {
    gl_Position = uProjection * uView * uModel * vec4(aVertPos, 1.0);
    Normal = mat3(uModel) * aNormal; // Since there is no non-uniform scaling, this is fine
    FragPos = vec3(uModel * vec4(aVertPos, 1.0));
}