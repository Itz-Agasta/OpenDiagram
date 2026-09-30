"use client";

import { useEffect, useRef } from "react";
import { assetUrl } from "@/lib/site";
import { compileProgram, loadImage } from "@/lib/webgl";

// Pixel-aligned pair: the dark layer is an edit-down of the lit one, so the beam can
// swap between them without the subject jumping. CORS caveat as in auth/lens-scene.tsx.
const LIT = assetUrl("/not-found/scene-lit.webp");
const DARK = assetUrl("/not-found/scene-dark.webp");
const IMAGE_ASPECT = 16 / 9;
// Cover-crop focus between the blueprint and the octopus, so a portrait crop keeps both.
const ANCHOR_X = 0.55;
// Points of interest in image UV (origin bottom-left, textures are flipped on upload).
const BLUEPRINT = [0.4, 0.2] as const;
const OCTOPUS = [0.69, 0.5] as const;

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

uniform sampler2D uLit;
uniform sampler2D uDark;
uniform vec2 uRes;
uniform vec3 uBeam;      // xy: center (device px, origin bottom-left), z: radius
uniform vec2 uScale;
uniform vec2 uAnchor;

out vec4 outColor;

vec2 coverUv(vec2 frag) {
  return clamp(uAnchor + (frag / uRes - uAnchor) * uScale, 0.0, 1.0);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = coverUv(frag);
  // Wider than tall: a torch pointed at the floor throws an ellipse.
  vec2 q = (frag - uBeam.xy) / vec2(1.25, 1.0);
  float r = length(q) / uBeam.z;
  float beam = 1.0 - smoothstep(0.25, 1.0, r);
  float core = 1.0 - smoothstep(0.0, 0.45, r);

  vec3 dark = texture(uDark, uv).rgb * 0.8;
  vec3 lit = texture(uLit, uv).rgb * vec3(1.06, 1.0, 0.9) * (1.0 + core * 0.18);
  outColor = vec4(mix(dark, lit, beam), 1.0);
}`;

/**
 * Full-bleed 404 backdrop: a dark room where the pointer is a flashlight that shows the
 * lit scene under it. Idles between the blueprint and the octopus when the pointer
 * rests; a tap moves it on touch screens. Without WebGL2 the dark image shows:
 * it is also the pre-texture frame, so the canvas fade-in never flashes the lit scene.
 */
export function FlashlightScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl2", { alpha: false, antialias: false, depth: false });
    if (!canvas || !gl) return;
    const program = compileProgram(gl, VERT, FRAG, "FlashlightScene");
    if (!program) return;
    gl.useProgram(program);

    const loc = (name: string) => gl.getUniformLocation(program, name);
    const uRes = loc("uRes");
    const uBeam = loc("uBeam");
    const uScale = loc("uScale");
    gl.uniform2f(loc("uAnchor"), ANCHOR_X, 0.5);

    const textures = [0, 1].map((unit) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    });
    gl.uniform1i(loc("uLit"), 0);
    gl.uniform1i(loc("uDark"), 1);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = 1;
    let radius = 200;
    let scale = [1, 1];
    // Beam state in device px, origin bottom-left like gl_FragCoord.
    let px = 0;
    let py = 0;
    let tx = 0;
    let ty = 0;
    let lastMove = -10;
    let idleT = 0;

    // Inverse of the shader's coverUv: image UV to canvas device px.
    const toCanvas = ([u, v]: readonly [number, number]) => [
      (ANCHOR_X + (u - ANCHOR_X) / scale[0]) * canvas.width,
      (0.5 + (v - 0.5) / scale[1]) * canvas.height,
    ];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const [oldW, oldH] = [canvas.width, canvas.height];
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const sx = canvas.width / oldW;
      const sy = canvas.height / oldH;
      [px, tx, py, ty] = [px * sx, tx * sx, py * sy, ty * sy];
      gl.viewport(0, 0, canvas.width, canvas.height);
      const aspect = rect.width / Math.max(rect.height, 1);
      scale = [Math.min(1, aspect / IMAGE_ASPECT), Math.min(1, IMAGE_ASPECT / aspect)];
      gl.uniform2f(uScale, scale[0], scale[1]);
      radius = Math.min(Math.max(Math.min(rect.width, rect.height) * 0.28, 120), 260) * dpr;
    };
    resize();
    [px, py] = [tx, ty] = toCanvas(BLUEPRINT);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const aim = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      // On phones the scene is a bottom band: taps on the copy above it must not aim
      // the beam off-canvas, where reduced motion (no idle sweep) would leave it.
      if (e.clientY < rect.top || e.clientY > rect.bottom) return;
      tx = (e.clientX - rect.left) * dpr;
      ty = (rect.bottom - e.clientY) * dpr;
      lastMove = performance.now() / 1000;
    };
    window.addEventListener("pointermove", aim);
    window.addEventListener("pointerdown", aim);

    let raf = 0;
    let ready = false;
    let prev = performance.now() / 1000;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now() / 1000;
      const dt = Math.min(Math.max(now - prev, 0.001), 0.05);
      prev = now;
      if (!ready || canvas.width < 2) return;

      if (now - lastMove > 3 && !reducedMotion) {
        // Ease back and forth between the two things worth finding.
        idleT += dt;
        const k = 0.5 - 0.5 * Math.cos(idleT * 0.45);
        const [bx, by] = toCanvas(BLUEPRINT);
        const [ox, oy] = toCanvas(OCTOPUS);
        tx = bx + (ox - bx) * k;
        ty = by + (oy - by) * k + Math.sin(idleT * 0.9) * radius * 0.25;
      }

      if (reducedMotion) {
        [px, py] = [tx, ty];
      } else {
        // Critically damped-ish lag: a torch in a hand, not a cursor.
        const f = 1 - Math.exp(-8 * dt);
        px += (tx - px) * f;
        py += (ty - py) * f;
      }

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform3f(uBeam, px, py, radius);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);

    let disposed = false;
    Promise.all([loadImage(LIT), loadImage(DARK)])
      .then((imgs) => {
        if (disposed) return;
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        imgs.forEach((img, unit) => {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          gl.generateMipmap(gl.TEXTURE_2D);
        });
        ready = true;
        canvas.dataset.ready = "true";
      })
      .catch((err) => console.error("FlashlightScene texture load failed:", err));

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", aim);
      window.removeEventListener("pointerdown", aim);
      textures.forEach((t) => gl.deleteTexture(t));
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <div className="nf-scene" aria-hidden>
      {/* See lens-scene.tsx: an <img> so the fallback and the texture share a CORS cache entry. */}
      <img src={DARK} crossOrigin="anonymous" alt="" className="scene-fallback" />
      <canvas ref={canvasRef} className="nf-canvas" />
    </div>
  );
}
