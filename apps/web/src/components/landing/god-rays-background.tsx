"use client";

import { createElement } from "react";
import { MediaShaderScript } from "../media-shader-script";

const GOD_RAYS_FRAGMENT_SHADER = `#version 300 es
precision highp float;

out vec4 glFragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec4 u_colors[2];
uniform float u_intensity;
uniform float u_rays;
uniform float u_reach;

float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord, float seedA, float seedB, float speed)
{
  vec2 sourceToCoord = coord - raySource;
  float cosAngle = dot(normalize(sourceToCoord), rayRefDirection);
  return clamp(
    (.45 + 0.15 * sin(cosAngle * seedA + u_time * speed)) +
    (0.3 + 0.2 * cos(-cosAngle * seedB + u_time * speed)),
    u_reach, 1.0) *
    clamp((u_resolution.x - length(sourceToCoord)) / u_resolution.x, u_reach, 1.0);
}

void main()
{
  vec2 coord = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  float speed = u_rays * 10.0;

  vec2 rayPos1 = vec2(u_resolution.x * 0.7, u_resolution.y * -0.4);
  vec2 rayRefDir1 = normalize(vec2(1.0, -0.116));
  float raySeedA1 = 36.2214 * speed;
  float raySeedB1 = 21.11349 * speed;
  float raySpeed1 = 1.5 * speed;

  vec2 rayPos2 = vec2(u_resolution.x * 0.8, u_resolution.y * -0.6);
  vec2 rayRefDir2 = normalize(vec2(1.0, 0.241));
  float raySeedA2 = 22.39910 * speed;
  float raySeedB2 = 18.0234 * speed;
  float raySpeed2 = 1.1 * speed;

  vec4 rays1 = vec4(0., 0., 0., .0) +
    rayStrength(rayPos1, rayRefDir1, coord, raySeedA1, raySeedB1, raySpeed1) * u_colors[0];
  vec4 rays2 = vec4(0., 0., 0., .0) +
    rayStrength(rayPos2, rayRefDir2, coord, raySeedA2, raySeedB2, raySpeed2) * u_colors[1];

  vec4 fragColor = rays1 + rays2;
  float brightness = 1.0 * u_reach - (coord.y / u_resolution.y);
  fragColor *= (brightness + (0.5 + u_intensity));
  glFragColor = fragColor;
}`;

const GOD_RAYS_UNIFORMS = JSON.stringify({
  u_colors: [
    [1, 1, 1, 1],
    [1, 1, 1, 1],
  ],
  u_intensity: 0.946,
  u_rays: 0.094,
  u_reach: 0.211,
});

export function GodRaysBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1] overflow-hidden opacity-60 mix-blend-screen"
    >
      <MediaShaderScript />
      {createElement("media-shader", {
        className: "block h-full w-full",
        width: "100%",
        height: "100%",
        "fragment-shader": GOD_RAYS_FRAGMENT_SHADER,
        uniforms: GOD_RAYS_UNIFORMS,
      })}
    </div>
  );
}
