"use client";

import { createElement } from "react";
import Script from "next/script";

const FOOTER_TEXTURE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

out vec4 glFragColor;

uniform vec2 u_resolution;
uniform vec3 u_color;
uniform float u_size;
uniform float u_factor;
uniform float u_gain;
uniform int u_octaves;
uniform float u_phase;
uniform float u_lacunarity;
uniform float u_width;
uniform float u_aa_passes;

uint ihash1D(uint q)
{
  q = (q << 13u) ^ q;
  return q * (q * q * 15731u + 789221u) + 1376312589u;
}

uvec4 ihash1D(uvec4 q)
{
  q = (q << 13u) ^ q;
  return q * (q * q * 15731u + 789221u) + 1376312589u;
}

void betterHash2D(vec4 cell, out vec4 hashX, out vec4 hashY)
{
  uvec4 i = uvec4(cell) + 101323u;
  uvec4 hash0 = ihash1D(ihash1D(i.xzxz) + i.yyww);
  uvec4 hash1 = ihash1D(hash0 ^ 1933247u);
  hashX = vec4(hash0) * (1.0 / float(0xffffffffu));
  hashY = vec4(hash1) * (1.0 / float(0xffffffffu));
}

float perlinNoise(vec2 pos, vec2 scale, mat2 transform, float seed)
{
  pos *= scale;
  vec4 i = floor(pos).xyxy + vec2(0.0, 1.0).xxyy;
  vec4 f = (pos.xyxy - i.xyxy) - vec2(0.0, 1.0).xxyy;
  i = mod(i, scale.xyxy) + seed;

  vec4 gradientX, gradientY;
  betterHash2D(i, gradientX, gradientY);
  gradientX -= 0.49999;
  gradientY -= 0.49999;

  vec4 m = vec4(transform);
  vec4 rg = vec4(gradientX.x, gradientY.x, gradientX.y, gradientY.y);
  rg = rg.xxzz * m.xyxy + rg.yyww * m.zwzw;
  gradientX.xy = rg.xz;
  gradientY.xy = rg.yw;

  rg = vec4(gradientX.z, gradientY.z, gradientX.w, gradientY.w);
  rg = rg.xxzz * m.xyxy + rg.yyww * m.zwzw;
  gradientX.zw = rg.xz;
  gradientY.zw = rg.yw;

  vec4 gradients = inversesqrt(gradientX * gradientX + gradientY * gradientY) * (gradientX * f.xzxz + gradientY * f.yyww);
  gradients *= 2.3703703703703703703703703703704;
  f = f * f;
  f = f.xzxz + f.yyww;
  vec4 xSq = 1.0 - min(vec4(1.0), f);
  return dot(xSq * xSq * xSq, gradients);
}

float perlinNoise(vec2 pos, vec2 scale, float rotation, float seed)
{
  vec2 sinCos = vec2(sin(rotation), cos(rotation));
  return perlinNoise(pos, scale, mat2(sinCos.y, sinCos.x, sinCos.x, sinCos.y), seed);
}

float fbmPerlin(vec2 pos, vec2 scale, int octaves, float shift, float axialShift, float gain, float lacunarity, uint mode, float factor, float offset, float seed)
{
  float amplitude = gain;
  vec2 frequency = floor(scale);
  float angle = axialShift;
  float n = 1.0;
  vec2 p = fract(pos) * frequency;
  float value = 0.0;

  for (int i = 0; i < octaves; i++)
  {
    float pn = perlinNoise(p / frequency, frequency, angle, seed) + offset;
    if (mode == 0u) {
      n *= abs(pn);
    } else if (mode == 1u) {
      n = abs(pn);
    } else if (mode == 2u) {
      n = pn;
    } else if (mode == 3u) {
      n *= pn;
    } else if (mode == 4u) {
      n = pn * 0.5 + 0.5;
    } else {
      n *= pn * 0.5 + 0.5;
    }
    n = pow(n < 0.0 ? 0.0 : n, factor);
    value += amplitude * n;
    p = p * lacunarity + shift;
    frequency *= lacunarity;
    amplitude *= gain;
    angle += axialShift;
  }

  return value;
}

vec4 fragmentColor(in vec2 fragCoord)
{
  vec2 uv = fragCoord.xy / u_resolution.xy;
  vec2 p = fract(uv);
  vec2 scale = vec2(int(u_resolution.x / u_size / 8.0), int(u_resolution.y / u_size / 8.0));
  float value = fbmPerlin(p, scale, int(u_octaves), u_phase * 100.0, u_phase, u_gain * 2.0, floor(u_lacunarity), 4u, u_factor, 0.0, 0.0);
  float f = fract(value * 10.0);
  value = step(1.0 - u_width, f);
  return vec4(u_color, value);
}

void main()
{
  vec4 fragColor = vec4(0.0);
  float A = u_aa_passes;
  float s = 1.0 / A;

  for (float x = -0.5; x < 0.5; x += s) {
    for (float y = -0.5; y < 0.5; y += s) {
      fragColor += min(fragmentColor(vec2(x, y) + gl_FragCoord.xy), 1.0);
    }
  }

  fragColor /= A * A;
  glFragColor = fragColor;
}`;

const FOOTER_TEXTURE_UNIFORMS = JSON.stringify({
  u_color: [1, 1, 1],
  u_size: 16,
  u_phase: 0,
  u_gain: 0.4,
  u_octaves: 1,
  u_lacunarity: 1,
  u_factor: 1,
  u_width: 0.1,
  u_aa_passes: 2,
});

export function FooterTextureBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden opacity-15 mix-blend-screen">
      <Script src="https://unpkg.com/media-shader@latest/media-shader.js" strategy="afterInteractive" />
      {createElement("media-shader", {
        className: "block h-full w-full",
        width: "100%",
        height: "100%",
        "fragment-shader": FOOTER_TEXTURE_FRAGMENT_SHADER,
        uniforms: FOOTER_TEXTURE_UNIFORMS,
      })}
    </div>
  );
}
