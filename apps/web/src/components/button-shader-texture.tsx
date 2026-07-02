"use client";

import { createElement } from "react";
import { MediaShaderScript } from "./media-shader-script";

const BUTTON_GRAIN_FRAGMENT_SHADER = `#version 300 es
precision highp float;

out vec4 glFragColor;

uniform vec2 u_resolution;
uniform vec3 u_color;
uniform bool u_tone[3];
uniform float u_size;
uniform bool u_fade[3];
uniform vec2 u_fade_position[2];
uniform float u_fade_amount;
uniform float u_amount;
uniform bool u_opacity_random;
uniform bool u_shape[7];
uniform float u_random_seed;

highp float rand(vec2 co) {
  highp float dt = dot(co.xy, vec2(12.9898, 78.233));
  highp float sn = mod(dt, 3.14);
  return fract(sin(sn) * 43758.5453);
}

vec3 hash3D(vec2 x) {
  uvec3 v = uvec3(x.xyx * 65536.0) * 1664525u + 1013904223u;
  v += v.yzx * v.zxy;
  v ^= v >> 16u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  return vec3(v) * (1.0 / float(0xffffffffu));
}

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution.xy;
  st *= u_resolution / u_size;
  vec2 ipos = floor(st);
  float opacity = u_opacity_random ? rand(ipos * u_random_seed) : 1.0;
  float amount = hash3D(hash3D(ipos).xy).x;
  vec3 color = u_color;
  vec2 grid = vec2(u_resolution / u_size);
  float fade = 1.0;

  if (u_fade[1]) {
    vec2 dir = u_fade_position[1] - u_fade_position[0];
    vec2 pos = ipos / grid - u_fade_position[0];
    float t = dot(pos, dir) / dot(dir, dir);
    fade = 1.0 - (clamp(t, 0.0, 1.0) + u_fade_amount);
  } else if (u_fade[2]) {
    float dist = distance(ipos / grid, u_fade_position[1]);
    float maxDist = distance(u_fade_position[0], u_fade_position[1]);
    fade = 1.0 - (clamp(dist / maxDist, 0.0, 1.0) + u_fade_amount);
  }

  if (u_tone[1] && hash3D(ipos).r > 0.5) {
    color = 1.0 - color;
  } else if (u_tone[2]) {
    color = hash3D(ipos);
  }

  float shape = u_shape[0] ? 1.0 : 0.0;
  glFragColor = vec4(color, step(1.0 - u_amount, amount) * opacity * shape * fade);
}`;

const BUTTON_GRAIN_UNIFORMS = JSON.stringify({
  u_tone: [false, true, false],
  u_color: [1, 1, 1],
  u_size: 1,
  u_amount: 1,
  u_fade: [false, true, false],
  u_fade_position: [
    [0.5, 1],
    [0.5, 0.5],
  ],
  u_fade_amount: 0,
  u_opacity_random: true,
  u_shape: [true, false, false, false, false, false, false],
  u_shape_image: null,
  u_random_seed: 0.7435033519488669,
});

export function ButtonShaderTexture() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] opacity-35"
    >
      <MediaShaderScript />
      {createElement("media-shader", {
        className: "block h-full w-full",
        width: "1024px",
        height: "1024px",
        "fragment-shader": BUTTON_GRAIN_FRAGMENT_SHADER,
        uniforms: BUTTON_GRAIN_UNIFORMS,
      })}
    </span>
  );
}
