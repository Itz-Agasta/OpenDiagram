/** Compiles and links a vertex + fragment pair; logs and returns null on failure. */
export function compileProgram(
  gl: WebGL2RenderingContext,
  vert: string,
  frag: string,
  label: string,
): WebGLProgram | null {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(`${label} shader error:`, gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  };
  const vs = make(gl.VERTEX_SHADER, vert);
  const fs = make(gl.FRAGMENT_SHADER, frag);
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
    console.error(`${label} link error:`, gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

/**
 * Decodes an image for texImage2D. Requests it with CORS: a cross-origin image without
 * an Access-Control-Allow-Origin match taints the context and texImage2D throws.
 */
export async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  return img;
}
