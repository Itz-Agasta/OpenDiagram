"use client";

import { ShaderMount } from "@paper-design/shaders";
import { useEffect, useRef } from "react";

// Sampled left to right across the top band of /auth/scene.webp, so the reset page reads
// as the same lit wall as sign in, minus the mascot.
const WALL = [
  [29, 15, 22],
  [44, 17, 23],
  [73, 20, 27],
  [115, 28, 30],
  [173, 49, 38],
  [212, 93, 47],
  [207, 135, 69],
  [144, 153, 110],
  [72, 132, 145],
  [83, 82, 138],
  [72, 47, 86],
  [28, 27, 42],
];

// Frame the animation starts from, and holds on under reduced motion.
const START_FRAME = 4000;

// Domain-warped spectrum: fbm pushes each pixel's lookup sideways so the bands drift like
// light on a wall, then the scene's dark floor, edge falloff and animated grain.
const FRAG = `#version 300 es
precision highp float;
// mediump to match Paper's vertex shader: mixed precisions fail to link on real GPUs.
uniform mediump float u_time;
uniform mediump vec2 u_resolution;
out vec4 fragColor;

const vec3 WALL[${WALL.length}] = vec3[](${WALL.map((c) => `vec3(${c.join(",")})`).join(",")});

vec3 wall(float x) {
  float f = clamp(x, 0.0, 1.0) * ${WALL.length - 1}.0;
  int i = int(floor(f));
  return mix(WALL[i], WALL[min(i + 1, ${WALL.length - 1})], smoothstep(0.0, 1.0, fract(f))) / 255.0;
}

// Hoskins' sin-free hash: the usual fract(sin(dot)) hatches diagonally at pixel-scale inputs.
// https://www.shadertoy.com/view/4djSRW
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int k = 0; k < 4; k++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  uv.y = 1.0 - uv.y;
  float t = u_time * 0.05;
  // Noise in aspect-corrected space, normalised to 16:9 so desktop keeps its look and a
  // portrait phone gets round warps instead of vertical streaks.
  vec2 p = vec2(uv.x * u_resolution.x / u_resolution.y / 1.7778, uv.y);
  vec2 q = vec2(fbm(p * 2.0 + vec2(t, 0.0)), fbm(p * 2.0 + vec2(5.2, 1.3) - t));
  vec3 col = wall(uv.x + 0.35 * (fbm(p * 1.5 + q * 1.8 + t) - 0.5)) * 1.25;
  col *= mix(0.03, 1.0, 1.0 - smoothstep(0.15, 0.95, uv.y));
  col *= 1.0 - 0.35 * pow(abs(uv.x - 0.45) * 1.8, 2.0);
  col += (hash(gl_FragCoord.xy + fract(u_time) * 100.0) - 0.5) * 0.06;
  fragColor = vec4(col, 1.0);
}`;

/**
 * Animated spectrum backdrop for the centred auth layout (password reset). The inline
 * gradient under the canvas is what shows when WebGL2 is missing or the shader fails.
 * https://github.com/paper-design/shaders/tree/v0.0.81
 */
export function SpectrumBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let mount: ShaderMount | undefined;
    try {
      // Pixel ratio 1 and a 1080p pixel cap: a soft gradient gains nothing from retina
      // density, and minPixelRatio only raises resolution, so the cap is what trims 2x screens.
      mount = new ShaderMount(
        el,
        FRAG,
        {},
        undefined,
        reduce.matches ? 0 : 1,
        START_FRAME,
        1,
        1920 * 1080,
      );
    } catch (err) {
      console.warn("Spectrum backdrop fell back to the static gradient", err);
    }
    const onMotion = () => mount?.setSpeed(reduce.matches ? 0 : 1);
    reduce.addEventListener("change", onMotion);
    return () => {
      reduce.removeEventListener("change", onMotion);
      mount?.dispose();
    };
  }, []);

  return (
    <div
      ref={ref}
      className="spectrum"
      aria-hidden
      style={{
        backgroundImage: `linear-gradient(180deg, transparent 20%, #050505 90%), linear-gradient(90deg, ${WALL.map((c) => `rgb(${c.join(" ")})`).join(", ")})`,
      }}
    />
  );
}
