"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

// Adapted from StarKnightt/liquid-glass (MIT). Changes: two image textures instead of
// rendered text (the lens reveals the lit scene), rigid ball (no squash, wobble or
// ripples), cover-fit anchored on the mascot, window-level pointer so the lens keeps
// following while the cursor is over the auth card.
// https://github.com/StarKnightt/liquid-glass/blob/5ed54a1a2c38390034121a79e1b81afeaf709e53/src/components/ui/liquid-glass.tsx

// Served same-origin, not through assetUrl: the R2 bucket sends no CORS headers, so a
// texture loaded from it taints the WebGL context.
const SCENE = "/auth/scene.webp";
const XRAY = "/auth/scene-xray.webp";
const IMAGE_ASPECT = 16 / 9;
// Horizontal focus of the cover crop: keeps the mascot and board in frame on narrow screens.
const ANCHOR_X = 0.72;

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform sampler2D uXray;
uniform vec2 uRes;
uniform float uDpr;
uniform vec3 uLens;      // xy: center (device px, origin bottom-left), z: radius
uniform vec2 uScale;     // cover-fit scale per axis
uniform vec2 uAnchor;

out vec4 outColor;

vec2 coverUv(vec2 frag) {
  return clamp(uAnchor + (frag / uRes - uAnchor) * uScale, 0.0, 1.0);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 q = frag - uLens.xy;
  float R = uLens.z;
  float r = length(q);
  float d = r - R;
  float aa = 1.5 * uDpr;
  // smoothstep with edge0 > edge1 is undefined in GLSL ES 3.00, so falling edges invert.
  float inside = 1.0 - smoothstep(-aa, aa, d);

  vec2 shq = frag - (uLens.xy - vec2(0.0, R * 0.2));
  float shadow = (1.0 - smoothstep(R * 0.6, R * 1.3, length(shq))) * 0.35 * (1.0 - inside);
  vec3 col = texture(uScene, coverUv(frag)).rgb * (1.0 - shadow);

  if (inside > 0.0) {
    // Glass dome normal from the SDF. Near-flat centre; the rim samples outward, so the
    // scene around the ball wraps into its edge. Inward (upstream's sign) at this
    // strength crushed the outer ring into a 2x zoom of the centre.
    float r01 = clamp(r / R, 0.0, 1.0);
    float h = sqrt(max(1.0 - r01 * r01, 0.0));
    vec3 N = normalize(vec3(q / R, h * 1.1));
    vec2 mfrag = uLens.xy + q / 1.04;
    float bend = pow(1.0 - h, 1.6);
    vec2 refr = N.xy * bend * R * 0.45;
    float ca = 0.12;

    vec3 glass;
    glass.r = texture(uXray, coverUv(mfrag + refr * (1.0 + ca))).r;
    glass.g = texture(uXray, coverUv(mfrag + refr)).g;
    glass.b = texture(uXray, coverUv(mfrag + refr * (1.0 - ca))).b;

    vec3 L = normalize(vec3(-0.35, 0.55, 0.75));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float ndh = max(dot(N, H), 0.0);
    float spec = pow(ndh, 260.0) * 0.35 + pow(ndh, 24.0) * 0.03;
    float fres = pow(1.0 - max(N.z, 0.0), 3.0);

    glass += spec + fres * 0.12;
    glass += (1.0 - smoothstep(0.0, aa * 2.5, abs(d))) * 0.18;
    col = mix(col, glass, inside);
  }

  outColor = vec4(col, 1.0);
}`;

function compileProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("LensScene shader error:", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  };
  const vs = make(gl.VERTEX_SHADER, VERT);
  const fs = make(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("LensScene link error:", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

// Mirrors the 768px breakpoint in auth-visual.css that hides the scene: below it the
// canvas is not mounted, so no textures download and no frame loop runs.
const WIDE_QUERY = "(min-width: 769px)";
const isWide = () => window.matchMedia(WIDE_QUERY).matches;
function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/**
 * Full-bleed auth backdrop: the silhouetted mascot with a glass ball that follows the
 * pointer and shows the lit version of whatever it covers. The ball passes under the
 * auth card, which frosts it. Without WebGL2 the plain scene image shows.
 */
export function LensScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl2", { alpha: false, antialias: false, depth: false });
    if (!canvas || !gl) return;
    const program = compileProgram(gl);
    if (!program) return;
    gl.useProgram(program);

    const loc = (name: string) => gl.getUniformLocation(program, name);
    const uRes = loc("uRes");
    const uDpr = loc("uDpr");
    const uLens = loc("uLens");
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
    gl.uniform1i(loc("uScene"), 0);
    gl.uniform1i(loc("uXray"), 1);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = 1;
    let radius = 150;
    // Lens state in device px, origin bottom-left like gl_FragCoord.
    let px = 0;
    let py = 0;
    let vx = 0;
    let vy = 0;
    let tx = 0;
    let ty = 0;
    let lastMove = -10;
    let idleT = Math.random() * 100;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const [oldW, oldH] = [canvas.width, canvas.height];
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      // Keep the ball where it was relative to the scene instead of in stale pixels.
      const sx = canvas.width / oldW;
      const sy = canvas.height / oldH;
      [px, tx, py, ty] = [px * sx, tx * sx, py * sy, ty * sy];
      gl.viewport(0, 0, canvas.width, canvas.height);
      const aspect = rect.width / Math.max(rect.height, 1);
      gl.uniform2f(uScale, Math.min(1, aspect / IMAGE_ASPECT), Math.min(1, IMAGE_ASPECT / aspect));
      radius = Math.min(Math.max(rect.height * 0.2, 110), 200) * dpr;
    };
    resize();
    px = tx = canvas.width * 0.7;
    py = ty = canvas.height * 0.55;
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      tx = (e.clientX - rect.left) * dpr;
      ty = (rect.bottom - e.clientY) * dpr;
      lastMove = performance.now() / 1000;
    };
    window.addEventListener("pointermove", onMove);

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
        idleT += dt;
        tx = canvas.width * (0.64 + 0.24 * Math.sin(idleT * 0.37));
        ty = canvas.height * (0.55 + 0.2 * Math.sin(idleT * 0.53 + 1.3));
      }
      const cx = Math.min(Math.max(tx, radius * 0.6), canvas.width - radius * 0.6);
      const cy = Math.min(Math.max(ty, radius * 0.6), canvas.height - radius * 0.6);

      if (reducedMotion) {
        [px, py] = [cx, cy];
      } else {
        // Spring-follow with a heavier lag than upstream (130/14): reads as a solid ball.
        vx = (vx + (cx - px) * 70 * dt) * Math.exp(-11 * dt);
        vy = (vy + (cy - py) * 70 * dt) * Math.exp(-11 * dt);
        px += vx * dt;
        py += vy * dt;
      }

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uDpr, dpr);
      gl.uniform3f(uLens, px, py, radius);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);

    let disposed = false;
    Promise.all([loadImage(SCENE), loadImage(XRAY)])
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
      .catch((err) => console.error("LensScene texture load failed:", err));

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      textures.forEach((t) => gl.deleteTexture(t));
      gl.deleteProgram(program);
    };
  }, [wide]);

  return (
    <div className="lens-scene" aria-hidden>
      {wide && <canvas ref={canvasRef} className="lens-canvas" />}
    </div>
  );
}
