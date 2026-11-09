// GPU stable fluids. Velocity and dye live in half-float targets.
// Bands come from the same analyser as Particle Resonance 001:
// bass pushes dye out and a kick is one splash, mids steer the vortices,
// highs lift the glow and drop a few bright filaments.

const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 pos = vec2(-1.0, -1.0);
  if (gl_VertexID == 1) pos = vec2(3.0, -1.0);
  else if (gl_VertexID == 2) pos = vec2(-1.0, 3.0);
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const SPLAT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform float uAspect;
uniform float uSigma;
uniform float uAmount;
uniform vec3 uColor;
uniform float uMode;
void main() {
  vec4 base = texture(uTarget, vUv);
  vec2 d = vUv - uPoint;
  vec2 dp = vec2(d.x * uAspect, d.y);
  float r2 = dot(dp, dp);
  float sigma = max(uSigma, 0.0008);
  float g = exp(-r2 / (2.0 * sigma * sigma));
  if (uMode < 0.5) {
    fragColor = vec4(min(base.rgb + uColor * (uAmount * g), vec3(1.25)), 1.0);
    return;
  }
  float len = length(dp);
  vec2 add = vec2(0.0);
  if (uMode < 1.5) {
    vec2 dirp = len > 0.0001 ? dp / len : vec2(0.0);
    add = vec2(dirp.x / uAspect, dirp.y) * (uAmount * g);
  } else {
    vec2 tangp = len > 0.0001 ? vec2(-dp.y, dp.x) / len : vec2(0.0);
    float ring = smoothstep(0.0, sigma * 0.45, len) * g;
    add = vec2(tangp.x / uAspect, tangp.y) * (uAmount * ring);
  }
  vec2 vel = base.xy + add;
  float sp = length(vel);
  if (sp > 4.0) vel *= 4.0 / sp;
  fragColor = vec4(vel, 0.0, 1.0);
}
`;

const CURL = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  vec2 tx = vec2(uTexel.x, 0.0);
  vec2 ty = vec2(0.0, uTexel.y);
  float left = texture(uVelocity, vUv - tx).y;
  float right = texture(uVelocity, vUv + tx).y;
  float bottom = texture(uVelocity, vUv - ty).x;
  float top = texture(uVelocity, vUv + ty).x;
  float curl = (right - left) - (top - bottom);
  fragColor = vec4(curl * 0.5, 0.0, 0.0, 1.0);
}
`;

const VORTICITY = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uDt;
uniform float uCurlStrength;
void main() {
  vec2 tx = vec2(uTexel.x, 0.0);
  vec2 ty = vec2(0.0, uTexel.y);
  float left = texture(uCurl, vUv - tx).x;
  float right = texture(uCurl, vUv + tx).x;
  float bottom = texture(uCurl, vUv - ty).x;
  float top = texture(uCurl, vUv + ty).x;
  float curl = texture(uCurl, vUv).x;
  vec2 grad = vec2(right - left, top - bottom) * 0.5;
  float mag = length(grad);
  vec2 force = vec2(0.0);
  if (mag > 0.00001) {
    vec2 n = grad / mag;
    force = vec2(n.y, -n.x) * curl * uCurlStrength;
  }
  vec2 vel = texture(uVelocity, vUv).xy + force * uDt;
  float sp = length(vel);
  if (sp > 4.0) vel *= 4.0 / sp;
  fragColor = vec4(vel, 0.0, 1.0);
}
`;

const DIVERGENCE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  vec2 tx = vec2(uTexel.x, 0.0);
  vec2 ty = vec2(0.0, uTexel.y);
  vec2 c = texture(uVelocity, vUv).xy;
  float left = texture(uVelocity, vUv - tx).x;
  float right = texture(uVelocity, vUv + tx).x;
  float bottom = texture(uVelocity, vUv - ty).y;
  float top = texture(uVelocity, vUv + ty).y;
  if (vUv.x < uTexel.x) left = -c.x;
  if (vUv.x > 1.0 - uTexel.x) right = -c.x;
  if (vUv.y < uTexel.y) bottom = -c.y;
  if (vUv.y > 1.0 - uTexel.y) top = -c.y;
  float div = 0.5 * (right - left + top - bottom);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

const PRESSURE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
void main() {
  vec2 tx = vec2(uTexel.x, 0.0);
  vec2 ty = vec2(0.0, uTexel.y);
  float left = texture(uPressure, vUv - tx).x;
  float right = texture(uPressure, vUv + tx).x;
  float bottom = texture(uPressure, vUv - ty).x;
  float top = texture(uPressure, vUv + ty).x;
  float div = texture(uDivergence, vUv).x;
  float p = (left + right + bottom + top - div) * 0.25;
  fragColor = vec4(p, 0.0, 0.0, 1.0);
}
`;

const GRADIENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  vec2 tx = vec2(uTexel.x, 0.0);
  vec2 ty = vec2(0.0, uTexel.y);
  float left = texture(uPressure, vUv - tx).x;
  float right = texture(uPressure, vUv + tx).x;
  float bottom = texture(uPressure, vUv - ty).x;
  float top = texture(uPressure, vUv + ty).x;
  vec2 vel = texture(uVelocity, vUv).xy;
  vel -= vec2(right - left, top - bottom);
  float edge = smoothstep(0.0, 0.012, vUv.x) * smoothstep(0.0, 0.012, 1.0 - vUv.x);
  edge *= smoothstep(0.0, 0.012, vUv.y) * smoothstep(0.0, 0.012, 1.0 - vUv.y);
  vel *= edge;
  float sp = length(vel);
  if (sp > 4.0) vel *= 4.0 / sp;
  fragColor = vec4(vel, 0.0, 1.0);
}
`;

const ADVECT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSource;
uniform sampler2D uVelocity;
uniform float uDt;
uniform float uKeep;
uniform float uDye;
uniform float uBurn;
void main() {
  vec2 vel = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - vel * uDt;
  float inside = step(0.0, coord.x) * step(coord.x, 1.0) * step(0.0, coord.y) * step(coord.y, 1.0);
  vec4 sampleColor = texture(uSource, coord);
  if (uDye > 0.5) {
    vec3 dye = sampleColor.rgb * uKeep * inside;
    float lum = max(dye.r, max(dye.g, dye.b));
    dye *= exp(-uDt * lum * uBurn);
    fragColor = vec4(dye, 1.0);
  } else {
    fragColor = vec4(sampleColor.xy * uKeep * inside, 0.0, 1.0);
  }
}
`;

const DISPLAY = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uDye;
uniform float uAspect;
uniform float uHighs;
void main() {
  vec3 dye = texture(uDye, vUv).rgb;
  vec2 px = vec2(0.011 / max(uAspect, 0.4), 0.011);
  vec2 qx = vec2(0.022 / max(uAspect, 0.4), 0.022);
  vec3 glow = texture(uDye, vUv + vec2(px.x, 0.0)).rgb;
  glow += texture(uDye, vUv - vec2(px.x, 0.0)).rgb;
  glow += texture(uDye, vUv + vec2(0.0, px.y)).rgb;
  glow += texture(uDye, vUv - vec2(0.0, px.y)).rgb;
  glow += texture(uDye, vUv + qx).rgb;
  glow += texture(uDye, vUv - qx).rgb;
  glow += texture(uDye, vUv + vec2(qx.x, -qx.y)).rgb;
  glow += texture(uDye, vUv + vec2(-qx.x, qx.y)).rgb;
  glow *= 0.125;

  float core = max(dye.r, max(dye.g, dye.b));
  float halo = max(glow.r, max(glow.g, glow.b));
  float fine = max(0.0, core - halo);

  vec3 ice = vec3(0.58, 0.74, 1.0);
  vec3 paper = vec3(0.94, 0.96, 1.0);
  vec3 col = mix(ice, paper, smoothstep(0.08, 0.72, core));
  col = mix(col, paper, clamp(uHighs, 0.0, 1.0) * 0.72);
  col = mix(col, paper, fine * (0.25 + uHighs * 0.9));

  float light = core * 1.05 + halo * (0.34 + uHighs * 0.95) + fine * (0.16 + uHighs * 0.65);
  light = max(0.0, light - 0.02);
  vec3 rgb = vec3(1.0) - exp(-col * light * 2.25);
  fragColor = vec4(rgb, 1.0);
}
`;

function chooseQuality() {
  const touch = navigator.maxTouchPoints > 0;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) <= 820;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const mobile = coarse || (touch && small) || saveData;
  if (mobile) {
    return { sim: 128, dye: 224, pressure: 10, dpr: 1.5, mobile: true };
  }
  const cores = navigator.hardwareConcurrency || 8;
  const modest = cores <= 4;
  return {
    sim: modest ? 144 : 176,
    dye: modest ? 280 : 360,
    pressure: modest ? 12 : 16,
    dpr: 2,
    mobile: false,
  };
}

function compile(gl, type, source, label) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "";
    gl.deleteShader(shader);
    throw new Error(`${label} のコンパイルに失敗しました: ${log}`);
  }
  return shader;
}

function link(gl, fragmentSource, label) {
  const program = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, VERT, `${label} vertex`);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource, label);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || "";
    gl.deleteProgram(program);
    throw new Error(`${label} のリンクに失敗しました: ${log}`);
  }
  return program;
}

function makeTarget(gl, width, height, internal, type, filter) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, gl.RGBA, type, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`浮動小数点バッファを作れませんでした (${status})`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, fb, width, height };
}

export function createFluid(canvas, { capture = false } = {}) {
  let gl;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: capture,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
  } catch (error) {
    return { ok: false, error };
  }
  if (!gl) return { ok: false, error: new Error("WebGL2 を開始できませんでした") };

  gl.getExtension("EXT_color_buffer_float");
  gl.getExtension("OES_texture_float_linear");

  const filter = gl.LINEAR;
  const quality = chooseQuality();
  let internal = gl.RGBA16F;
  let texType = gl.HALF_FLOAT;
  let formatName = "half";

  try {
    const probe = makeTarget(gl, 4, 4, internal, texType, filter);
    gl.deleteTexture(probe.texture);
    gl.deleteFramebuffer(probe.fb);
  } catch {
    internal = gl.RGBA32F;
    texType = gl.FLOAT;
    formatName = "float";
    try {
      const probe = makeTarget(gl, 4, 4, internal, texType, filter);
      gl.deleteTexture(probe.texture);
      gl.deleteFramebuffer(probe.fb);
    } catch (error) {
      return { ok: false, error };
    }
  }

  let programs;
  try {
    programs = {
      splat: link(gl, SPLAT, "splat"),
      curl: link(gl, CURL, "curl"),
      vorticity: link(gl, VORTICITY, "vorticity"),
      divergence: link(gl, DIVERGENCE, "divergence"),
      pressure: link(gl, PRESSURE, "pressure"),
      gradient: link(gl, GRADIENT, "gradient"),
      advect: link(gl, ADVECT, "advect"),
      display: link(gl, DISPLAY, "display"),
    };
  } catch (error) {
    return { ok: false, error };
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);

  const sim = quality.sim;
  const dyeRes = quality.dye;
  let pressureIterations = quality.pressure;
  let dprCap = quality.dpr;

  let velocity;
  let dye;
  let curl;
  let divergence;
  let pressureRead;
  let pressureWrite;
  let aspect = 1;

  function alloc() {
    velocity = {
      read: makeTarget(gl, sim, sim, internal, texType, filter),
      write: makeTarget(gl, sim, sim, internal, texType, filter),
    };
    dye = {
      read: makeTarget(gl, dyeRes, dyeRes, internal, texType, filter),
      write: makeTarget(gl, dyeRes, dyeRes, internal, texType, filter),
    };
    curl = makeTarget(gl, sim, sim, internal, texType, filter);
    divergence = makeTarget(gl, sim, sim, internal, texType, filter);
    pressureRead = makeTarget(gl, sim, sim, internal, texType, filter);
    pressureWrite = makeTarget(gl, sim, sim, internal, texType, filter);
  }

  try {
    alloc();
  } catch (error) {
    return { ok: false, error };
  }

  const simTexel = [1 / sim, 1 / sim];
  let lastShock = 0;
  let speck = 0;

  function bind(unit, texture) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  function draw(program, target) {
    gl.useProgram(program);
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0, 0, target.width, target.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
  }

  function uniform1f(program, name, value) {
    gl.uniform1f(gl.getUniformLocation(program, name), value);
  }
  function uniform2f(program, name, a, b) {
    gl.uniform2f(gl.getUniformLocation(program, name), a, b);
  }
  function uniform3f(program, name, a, b, c) {
    gl.uniform3f(gl.getUniformLocation(program, name), a, b, c);
  }
  function uniform1i(program, name, unit) {
    gl.uniform1i(gl.getUniformLocation(program, name), unit);
  }

  function splat(pair, mode, x, y, sigma, amount, color) {
    const program = programs.splat;
    bind(0, pair.read.texture);
    draw(program, pair.write);
    uniform1i(program, "uTarget", 0);
    uniform2f(program, "uPoint", x, y);
    uniform1f(program, "uAspect", aspect);
    uniform1f(program, "uSigma", sigma);
    uniform1f(program, "uAmount", amount);
    uniform3f(program, "uColor", color[0], color[1], color[2]);
    uniform1f(program, "uMode", mode);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const swap = pair.read;
    pair.read = pair.write;
    pair.write = swap;
  }

  function seed() {
    const ice = [0.62, 0.78, 1];
    const paper = [0.9, 0.94, 1];
    splat(dye, 0, 0.46, 0.54, 0.12, 0.2, ice);
    splat(dye, 0, 0.6, 0.46, 0.08, 0.1, paper);
    splat(velocity, 2, 0.42, 0.58, 0.18, 0.35, [0, 0, 0]);
    splat(velocity, 2, 0.62, 0.42, 0.14, -0.28, [0, 0, 0]);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    aspect = width / height;
  }

  function step(dt, time, bands) {
    const bass = bands.bass || 0;
    const mids = bands.mids || 0;
    const highs = bands.highs || 0;
    const shock = bands.shock || 0;
    const phase = bands.midPhase || time * 0.2;
    const energy = Math.min(1, bass * 0.8 + mids * 0.55 + (shock > 0.45 ? 0.35 : 0));
    const stepDt = Math.min(0.033, Math.max(0.001, dt || 0.016));

    const orbit = 0.15 + mids * 0.07;
    const ax = 0.5 + Math.cos(phase) * orbit;
    const ay = 0.5 + Math.sin(phase * 0.92) * orbit * 0.78;
    const bx = 0.5 - Math.cos(phase) * orbit;
    const by = 0.5 - Math.sin(phase * 0.92) * orbit * 0.78;
    const spin = (0.5 + mids * 1.55) * stepDt;
    splat(velocity, 2, ax, ay, 0.2, spin, [0, 0, 0]);
    splat(velocity, 2, bx, by, 0.16, -spin * 0.72, [0, 0, 0]);

    const push = bass * bass * 1.15 * stepDt;
    if (push > 0.0001) splat(velocity, 1, 0.5, 0.5, 0.22, push, [0, 0, 0]);

    const breath = (0.11 + mids * 0.24) * stepDt;
    const ice = [0.6, 0.76, 1];
    splat(dye, 0, ax, ay, 0.15, breath, ice);
    splat(dye, 0, bx, by, 0.12, breath * 0.4, [0.78, 0.86, 1]);
    const bassInk = bass * bass * 0.08 * stepDt;
    if (bassInk > 0.0001) splat(dye, 0, 0.5, 0.5, 0.12 + bass * 0.04, bassInk, [0.86, 0.92, 1]);

    const kick = shock > 0.52 && lastShock <= 0.52;
    lastShock = shock;
    if (kick) {
      const power = 1.05 + shock * 1.25;
      splat(velocity, 1, 0.5, 0.5, 0.16, power, [0, 0, 0]);
      splat(velocity, 2, 0.5, 0.5, 0.22, (0.4 + mids * 0.55) * (phase % 2 > 1 ? -1 : 1), [0, 0, 0]);
      splat(dye, 0, 0.5, 0.5, 0.07, 0.26 + shock * 0.22, [0.95, 0.97, 1]);
      for (let i = 0; i < 3; i += 1) {
        const ang = phase + i * 2.094 + shock;
        const rad = 0.1 + i * 0.035;
        const px = 0.5 + (Math.cos(ang) * rad) / Math.max(aspect, 0.4);
        const py = 0.5 + Math.sin(ang) * rad;
        splat(velocity, 1, px, py, 0.07, power * 0.42, [0, 0, 0]);
        splat(dye, 0, px, py, 0.05, 0.08 + shock * 0.07, i === 1 ? [0.95, 0.97, 1] : ice);
      }
    }

    speck -= stepDt;
    if (highs > 0.38 && speck <= 0) {
      speck = 0.11 + (1 - highs) * 0.16;
      const ang = phase * 1.7 + highs * 6.0;
      const rad = 0.08 + highs * 0.2;
      const px = 0.5 + (Math.cos(ang) * rad) / Math.max(aspect, 0.4);
      const py = 0.5 + Math.sin(ang * 1.3) * rad * 0.85;
      splat(dye, 0, px, py, 0.02 + highs * 0.012, 0.12 + highs * 0.28, [1, 1, 1]);
    }

    const velTexel = simTexel;
    bind(0, velocity.read.texture);
    draw(programs.curl, curl);
    uniform1i(programs.curl, "uVelocity", 0);
    uniform2f(programs.curl, "uTexel", velTexel[0], velTexel[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    bind(0, velocity.read.texture);
    bind(1, curl.texture);
    draw(programs.vorticity, velocity.write);
    uniform1i(programs.vorticity, "uVelocity", 0);
    uniform1i(programs.vorticity, "uCurl", 1);
    uniform2f(programs.vorticity, "uTexel", velTexel[0], velTexel[1]);
    uniform1f(programs.vorticity, "uDt", stepDt);
    uniform1f(programs.vorticity, "uCurlStrength", 14 + mids * 42);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    {
      const swap = velocity.read;
      velocity.read = velocity.write;
      velocity.write = swap;
    }

    bind(0, velocity.read.texture);
    draw(programs.divergence, divergence);
    uniform1i(programs.divergence, "uVelocity", 0);
    uniform2f(programs.divergence, "uTexel", velTexel[0], velTexel[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    for (let i = 0; i < pressureIterations; i += 1) {
      bind(0, pressureRead.texture);
      bind(1, divergence.texture);
      draw(programs.pressure, pressureWrite);
      uniform1i(programs.pressure, "uPressure", 0);
      uniform1i(programs.pressure, "uDivergence", 1);
      uniform2f(programs.pressure, "uTexel", velTexel[0], velTexel[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const swap = pressureRead;
      pressureRead = pressureWrite;
      pressureWrite = swap;
    }

    bind(0, pressureRead.texture);
    bind(1, velocity.read.texture);
    draw(programs.gradient, velocity.write);
    uniform1i(programs.gradient, "uPressure", 0);
    uniform1i(programs.gradient, "uVelocity", 1);
    uniform2f(programs.gradient, "uTexel", velTexel[0], velTexel[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    {
      const swap = velocity.read;
      velocity.read = velocity.write;
      velocity.write = swap;
    }

    const velKeep = Math.exp(-stepDt / (0.42 + mids * 0.35));
    const dyeTau = 0.58 + energy * 0.85;
    const dyeKeep = Math.exp(-stepDt / dyeTau);
    const burn = 1.35 - energy * 0.45;

    bind(0, velocity.read.texture);
    bind(1, velocity.read.texture);
    draw(programs.advect, velocity.write);
    uniform1i(programs.advect, "uSource", 0);
    uniform1i(programs.advect, "uVelocity", 1);
    uniform1f(programs.advect, "uDt", stepDt);
    uniform1f(programs.advect, "uKeep", velKeep);
    uniform1f(programs.advect, "uDye", 0);
    uniform1f(programs.advect, "uBurn", 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    {
      const swap = velocity.read;
      velocity.read = velocity.write;
      velocity.write = swap;
    }

    bind(0, dye.read.texture);
    bind(1, velocity.read.texture);
    draw(programs.advect, dye.write);
    uniform1i(programs.advect, "uSource", 0);
    uniform1i(programs.advect, "uVelocity", 1);
    uniform1f(programs.advect, "uDt", stepDt);
    uniform1f(programs.advect, "uKeep", dyeKeep);
    uniform1f(programs.advect, "uDye", 1);
    uniform1f(programs.advect, "uBurn", burn);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    {
      const swap = dye.read;
      dye.read = dye.write;
      dye.write = swap;
    }

    bind(0, dye.read.texture);
    draw(programs.display, null);
    uniform1i(programs.display, "uDye", 0);
    uniform1f(programs.display, "uAspect", aspect);
    uniform1f(programs.display, "uHighs", highs);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  resize();
  try {
    seed();
  } catch (error) {
    return { ok: false, error };
  }

  return {
    ok: true,
    sim: formatName === "half" ? "fluid-half" : "fluid-float",
    simSize: sim,
    dyeSize: dyeRes,
    mobile: quality.mobile,
    pressureIterations,
    get dpr() {
      return Math.min(window.devicePixelRatio || 1, dprCap);
    },
    resize,
    update: step,
    setDprCap(next) {
      dprCap = next;
      resize();
    },
    setPressureIterations(next) {
      pressureIterations = next;
    },
  };
}
