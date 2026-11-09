import * as THREE from "../vendor/three.module.js";

// Gustavson / Ashima simplex noise (MIT) and a curl of that field.
const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

vec3 snoise3(vec3 p) {
  return vec3(
    snoise(p),
    snoise(p + vec3(17.1, 9.2, 3.4)),
    snoise(p + vec3(4.7, 12.8, 8.3))
  );
}

vec3 curlNoise(vec3 p) {
  float e = 0.16;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  vec3 x0 = snoise3(p - dx);
  vec3 x1 = snoise3(p + dx);
  vec3 y0 = snoise3(p - dy);
  vec3 y1 = snoise3(p + dy);
  vec3 z0 = snoise3(p - dz);
  vec3 z1 = snoise3(p + dz);
  float cx = (y1.z - y0.z) - (z1.y - z0.y);
  float cy = (z1.x - z0.x) - (x1.z - x0.z);
  float cz = (x1.y - x0.y) - (y1.x - y0.x);
  return vec3(cx, cy, cz) / (2.0 * e);
}
`;

const FULLSCREEN_VERT = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy * 1.05, 0.0, 1.0);
}
`;

const INIT_FRAG = /* glsl */ `
uniform float uTexSize;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uTexSize;
  float n1 = hash12(uv);
  float n2 = hash12(uv + vec2(4.2, 1.3));
  float n3 = hash12(uv + vec2(8.1, 2.4));
  float n4 = hash12(uv + vec2(2.2, 9.7));
  float ang = n1 * 6.2831853;
  float rad = pow(n2, 0.58) * 0.98;
  float halo = step(0.92, n3);
  rad *= mix(1.0, 1.35, halo);
  float thick = mix(0.42, 1.05, halo);
  vec3 p = vec3(
    cos(ang) * rad,
    sin(ang) * rad * 0.28 + (n4 - 0.5) * thick,
    (hash12(uv + vec2(6.6, 3.1)) - 0.5) * (1.15 * (1.0 - clamp(rad, 0.0, 1.0)) + 0.28)
  );
  gl_FragColor = vec4(p, 1.0);
}
`;

const SIM_FRAG = /* glsl */ `
uniform sampler2D uPos;
uniform sampler2D uHome;
uniform float uTexSize;
uniform float uTime;
uniform float uDt;
uniform float uBass;
uniform float uMids;
uniform float uShock;
uniform float uShockRadius;
uniform float uMidPhase;

${NOISE}

void main() {
  vec2 uv = gl_FragCoord.xy / uTexSize;
  vec3 home = texture2D(uHome, uv).xyz;
  vec3 p = texture2D(uPos, uv).xyz;

  float ang = uMidPhase;
  float cs = cos(ang);
  float sn = sin(ang);
  vec3 q = p;
  q.x = cs * p.x - sn * p.z;
  q.z = sn * p.x + cs * p.z;

  float freq = mix(0.85, 1.7, clamp(uMids, 0.0, 1.0));
  vec3 c = curlNoise(q * freq + vec3(0.0, uTime * 0.04, 0.35));
  float cl = length(c);
  vec3 flow = cl > 0.0001 ? c / cl : vec3(0.0, 1.0, 0.0);
  // Stay near home so the disc reads as one cloud. Mids only stir inside it.
  float speed = 0.045 + uMids * 0.4;
  vec3 vel = flow * speed;

  float pr = max(length(p), 0.0008);
  vec3 outward = p / pr;
  float band = 1.0 - smoothstep(0.0, 0.45, abs(pr - uShockRadius));
  vel += outward * (uBass * 0.22 + uShock * (1.25 + band * 1.8));
  vel += (home - p) * (1.35 - uBass * 0.28);

  p += vel * clamp(uDt, 0.0, 0.04);

  float lim = 1.35 + uBass * 0.45 + uShock * 0.25;
  float d = length(p);
  if (d > lim) p *= lim / d;
  if (p.x != p.x || p.y != p.y || p.z != p.z) p = home;

  gl_FragColor = vec4(p, 1.0);
}
`;

const POINT_FRAG = /* glsl */ `
varying float vHash;
varying float vFlash;
varying float vDepthFade;
uniform float uHighs;

void main() {
  vec2 pc = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(pc, pc);
  if (r2 > 1.0) discard;

  float glow = exp(-r2 * 1.65);
  float core = exp(-r2 * 6.4);
  vec3 ice = vec3(0.22, 0.5, 1.0);
  vec3 white = vec3(0.75, 0.86, 1.0);
  vec3 col = mix(ice, white, 0.12 + 0.4 * vHash);
  col = mix(col, white, core * 0.4);
  col = mix(col, white, clamp(uHighs, 0.0, 1.0) * 0.7);
  col += white * vFlash * 0.35;
  col = max(col, vec3(0.0));

  float alpha = (glow * 0.42 + core * 0.38) * (0.22 + uHighs * 0.72);
  alpha *= mix(0.6, 1.0, vHash);
  alpha *= vDepthFade;
  alpha += vFlash * 0.18;
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;

const GPU_VERT = /* glsl */ `
attribute float aIndex;
uniform sampler2D uPos;
uniform sampler2D uHome;
uniform float uTexSize;
uniform float uBass;
uniform float uHighs;
uniform float uShock;
uniform float uShockRadius;
uniform float uTime;
uniform float uDpr;
uniform float uPointScale;
uniform float uStride;

varying float vHash;
varying float vFlash;
varying float vDepthFade;

void main() {
  vHash = fract(sin(aIndex * 127.1) * 43758.5453);
  vFlash = 0.0;
  vDepthFade = 1.0;
  if (uStride > 1.5 && mod(aIndex, uStride) > 0.5) {
    gl_Position = vec4(3.0, 3.0, 3.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  vec2 uv = (vec2(mod(aIndex, uTexSize), floor(aIndex / uTexSize)) + 0.5) / uTexSize;
  vec3 home = texture2D(uHome, uv).xyz;
  vec3 pos = texture2D(uPos, uv).xyz;
  pos += position * 0.0000002;

  float pr0 = max(length(pos), 0.0008);
  vec3 dir = pos / pr0;
  pos *= 1.0 + uBass * 0.62;
  pos += dir * uShock * 0.42;
  float band = 1.0 - smoothstep(0.0, 0.42, abs(length(pos) - uShockRadius));
  vFlash = uShock * band;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  vDepthFade = clamp(1.25 - (-mv.z) * 0.06, 0.34, 1.0);

  float twinkle = 0.78 + 0.22 * sin(uTime * (1.4 + vHash * 6.0) + vHash * 30.0);
  float spark = mix(0.88, twinkle, clamp(uHighs, 0.0, 1.0));
  float attenuation = 460.0 / max(2.0, -mv.z);
  float size = uPointScale * (0.85 + vHash * 0.55) * (0.62 + uHighs * 1.15) * spark * attenuation;
  gl_PointSize = clamp(size * uDpr, 1.6, 10.0 * uDpr);
}
`;

const STATELESS_VERT = /* glsl */ `
attribute float aIndex;
uniform float uBass;
uniform float uMids;
uniform float uHighs;
uniform float uShock;
uniform float uShockRadius;
uniform float uMidPhase;
uniform float uTime;
uniform float uDpr;
uniform float uPointScale;
uniform float uStride;

varying float vHash;
varying float vFlash;
varying float vDepthFade;

${NOISE}

void main() {
  vHash = fract(sin(aIndex * 127.1) * 43758.5453);
  vFlash = 0.0;
  vDepthFade = 1.0;
  if (uStride > 1.5 && mod(aIndex, uStride) > 0.5) {
    gl_Position = vec4(3.0, 3.0, 3.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  vec3 base = position;
  float ang = uMidPhase;
  float cs = cos(ang);
  float sn = sin(ang);
  vec3 q = base;
  q.x = cs * base.x - sn * base.z;
  q.z = sn * base.x + cs * base.z;
  float freq = mix(0.75, 1.6, clamp(uMids, 0.0, 1.0));
  vec3 c = curlNoise(q * freq + vec3(0.0, uTime * 0.05, 0.4));
  float cl = length(c);
  vec3 flow = cl > 0.0001 ? c / cl : vec3(0.0);
  vec3 pos = base + flow * (0.08 + uMids * 0.28);
  float pr0 = max(length(pos), 0.0008);
  vec3 dir = pos / pr0;
  pos *= 1.0 + uBass * 0.5;
  pos += dir * uShock * 0.36;
  float band = 1.0 - smoothstep(0.0, 0.42, abs(length(pos) - uShockRadius));
  vFlash = uShock * band;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  vDepthFade = clamp(1.25 - (-mv.z) * 0.06, 0.34, 1.0);

  float twinkle = 0.78 + 0.22 * sin(uTime * (1.4 + vHash * 6.0) + vHash * 30.0);
  float spark = mix(0.88, twinkle, clamp(uHighs, 0.0, 1.0));
  float attenuation = 460.0 / max(2.0, -mv.z);
  float size = uPointScale * (0.85 + vHash * 0.55) * (0.62 + uHighs * 1.15) * spark * attenuation;
  gl_PointSize = clamp(size * uDpr, 1.6, 10.0 * uDpr);
}
`;

function hash12(x, y) {
  const p3x = (x * 0.1031) % 1;
  const p3y = (y * 0.1031) % 1;
  const p3z = (x * 0.1031) % 1;
  const dot = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  const qx = (p3x + dot) % 1;
  const qy = (p3y + dot) % 1;
  const qz = (p3z + dot) % 1;
  return ((qx + qy) * qz) % 1;
}

function seedPosition(i, size) {
  const x = (i % size) + 0.5;
  const y = Math.floor(i / size) + 0.5;
  const uvx = x / size;
  const uvy = y / size;
  const n1 = hash12(uvx, uvy);
  const n2 = hash12(uvx + 4.2, uvy + 1.3);
  const n3 = hash12(uvx + 8.1, uvy + 2.4);
  const n4 = hash12(uvx + 2.2, uvy + 9.7);
  const n5 = hash12(uvx + 6.6, uvy + 3.1);
  const ang = n1 * Math.PI * 2;
  let rad = n2 ** 0.58 * 0.98;
  const halo = n3 > 0.92 ? 1 : 0;
  rad *= halo ? 1.35 : 1;
  const thick = halo ? 1.05 : 0.42;
  return [
    Math.cos(ang) * rad,
    Math.sin(ang) * rad * 0.28 + (n4 - 0.5) * thick,
    (n5 - 0.5) * (1.15 * (1 - Math.min(rad, 1)) + 0.28),
  ];
}

function halfToFloat(h) {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const f = h & 0x03ff;
  if (e === 0) return (s ? -1 : 1) * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : (s ? -1 : 1) * Infinity;
  return (s ? -1 : 1) * 2 ** (e - 15) * (1 + f / 1024);
}

export function chooseSimSize() {
  const touch = navigator.maxTouchPoints > 0;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) <= 820;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const mobile = coarse || (touch && small);
  if (saveData) return { size: 48, mobile: true };
  if (mobile) return { size: 80, mobile: true };
  const cores = navigator.hardwareConcurrency || 8;
  return { size: cores <= 4 ? 96 : 116, mobile: false };
}

function rtOptions(type) {
  return {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    format: THREE.RGBAFormat,
    type,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  };
}

function makeTarget(size, type) {
  const target = new THREE.WebGLRenderTarget(size, size, rtOptions(type));
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

function shaderMaterial(vertexShader, fragmentShader, uniforms) {
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    precision: "highp",
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
  return material;
}

export function createField(canvas, { capture = false, sim = null, particles = null } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
      preserveDrawingBuffer: capture,
      failIfMajorPerformanceCaveat: false,
    });
  } catch (error) {
    return { ok: false, error };
  }

  const gl = renderer.getContext();
  if (!gl) return { ok: false, error: new Error("WebGL2 を開始できませんでした") };

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 1);
  renderer.autoClear = true;

  const chosen = chooseSimSize();
  let size = chosen.size;
  if (Number.isFinite(particles) && particles >= 16 && particles <= 256) {
    size = Math.floor(particles);
  }
  const mobile = chosen.mobile;
  const count = size * size;

  gl.getExtension("EXT_color_buffer_float");
  gl.getExtension("EXT_color_buffer_half_float");

  const forceVertex = sim === "vertex";
  const forceGpu = sim === "gpu";
  let texType = null;
  let useGpu = false;

  function targetWorks(type) {
    const probe = makeTarget(4, type);
    renderer.setRenderTarget(probe);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    renderer.setRenderTarget(null);
    probe.dispose();
    return status === gl.FRAMEBUFFER_COMPLETE;
  }

  const vertexTextures = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) || 0;
  if (!forceVertex && vertexTextures >= 2) {
    if (targetWorks(THREE.HalfFloatType)) {
      texType = THREE.HalfFloatType;
      useGpu = true;
    } else if (targetWorks(THREE.FloatType)) {
      texType = THREE.FloatType;
      useGpu = true;
    }
  }
  if (forceGpu && !useGpu) {
    return { ok: false, error: new Error("浮動小数点バッファが使えません") };
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
  camera.position.set(0, 0, 6.35);
  let baseZ = 6.35;
  let dprCap = 2;

  const geometry = new THREE.BufferGeometry();
  const ids = new Float32Array(count);
  const bases = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    ids[i] = i;
    const p = seedPosition(i, size);
    bases[i * 3] = p[0];
    bases[i * 3 + 1] = p[1];
    bases[i * 3 + 2] = p[2];
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(bases, 3));
  geometry.setAttribute("aIndex", new THREE.BufferAttribute(ids, 1));

  const sharedUniforms = {
    uBass: { value: 0 },
    uMids: { value: 0.3 },
    uHighs: { value: 0.2 },
    uShock: { value: 0 },
    uShockRadius: { value: 0.05 },
    uMidPhase: { value: 0 },
    uTime: { value: 0 },
    uDpr: { value: 1 },
    uPointScale: { value: mobile ? 1.55 : 1.28 },
    uStride: { value: 1 },
  };

  let readTarget = null;
  let writeTarget = null;
  let homeTarget = null;
  let simUniforms = null;
  let points;

  if (useGpu) {
    homeTarget = makeTarget(size, texType);
    readTarget = makeTarget(size, texType);
    writeTarget = makeTarget(size, texType);

    const initUniforms = { uTexSize: { value: size } };
    const initMaterial = shaderMaterial(FULLSCREEN_VERT, INIT_FRAG, initUniforms);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), initMaterial);
    quad.frustumCulled = false;
    const simScene = new THREE.Scene();
    simScene.add(quad);
    const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    simCamera.position.z = 2;

    const paint = (target) => {
      renderer.setRenderTarget(target);
      renderer.render(simScene, simCamera);
    };
    paint(homeTarget);
    paint(readTarget);
    paint(writeTarget);

    simUniforms = {
      uPos: { value: readTarget.texture },
      uHome: { value: homeTarget.texture },
      uTexSize: { value: size },
      uTime: { value: 0 },
      uDt: { value: 0.016 },
      uBass: sharedUniforms.uBass,
      uMids: sharedUniforms.uMids,
      uShock: sharedUniforms.uShock,
      uShockRadius: sharedUniforms.uShockRadius,
      uMidPhase: sharedUniforms.uMidPhase,
    };
    quad.material = shaderMaterial(FULLSCREEN_VERT, SIM_FRAG, simUniforms);
    initMaterial.dispose();

    const gpuUniforms = {
      ...sharedUniforms,
      uPos: { value: readTarget.texture },
      uHome: { value: homeTarget.texture },
      uTexSize: { value: size },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: gpuUniforms,
      vertexShader: GPU_VERT,
      fragmentShader: POINT_FRAG,
      precision: "highp",
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);

    const stepSim = () => {
      simUniforms.uPos.value = readTarget.texture;
      renderer.setRenderTarget(writeTarget);
      renderer.render(simScene, simCamera);
      renderer.setRenderTarget(null);
      const swap = readTarget;
      readTarget = writeTarget;
      writeTarget = swap;
      gpuUniforms.uPos.value = readTarget.texture;
    };

    var step = stepSim;
  } else {
    const material = new THREE.ShaderMaterial({
      uniforms: sharedUniforms,
      vertexShader: STATELESS_VERT,
      fragmentShader: POINT_FRAG,
      precision: "highp",
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);
    var step = () => {};
  }

  const look = new THREE.Vector3(0, 0, 0);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const portrait = camera.aspect < 0.85;
    camera.fov = portrait ? 48 : 36;
    baseZ = portrait ? 9.05 : 7.05;
    sharedUniforms.uPointScale.value = portrait ? 1.62 : 1.28;
    sharedUniforms.uDpr.value = renderer.getPixelRatio();
    camera.updateProjectionMatrix();
  }

  function update(dt, time, bands) {
    const stepDt = Math.min(0.033, Math.max(0.001, dt || 0.016));
    sharedUniforms.uBass.value = bands.bass;
    sharedUniforms.uMids.value = bands.mids;
    sharedUniforms.uHighs.value = bands.highs;
    sharedUniforms.uShock.value = bands.shock;
    sharedUniforms.uShockRadius.value = bands.shockRadius;
    sharedUniforms.uMidPhase.value = bands.midPhase;
    sharedUniforms.uTime.value = time;
    if (simUniforms) {
      simUniforms.uTime.value = time;
      simUniforms.uDt.value = stepDt;
    }
    step();
    const z = baseZ + Math.sin(time * 0.05) * 0.12;
    camera.position.set(Math.sin(time * 0.07) * 0.16, Math.cos(time * 0.06) * 0.1, z);
    camera.lookAt(look);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }

  function sample() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const stepPx = 4;
    const row = new Uint8Array(w * 4);
    let count = 0;
    let sumL = 0;
    let sumR = 0;
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    for (let y = 0; y < h; y += stepPx) {
      gl.readPixels(0, y, w, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
      for (let x = 0; x < w; x += stepPx) {
        const i = x * 4;
        const lum = row[i] + row[i + 1] + row[i + 2];
        if (lum > 28) {
          count += 1;
          sumL += lum;
          const nx = (x - cx) / Math.max(1, cx);
          const ny = (y - cy) / Math.max(1, cy);
          sumR += Math.hypot(nx, ny) * lum;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return {
      count,
      mean: count ? sumL / count : 0,
      meanR: sumL > 0 ? sumR / sumL : 0,
      spanX: count ? (maxX - minX) / w : 0,
      spanY: count ? (maxY - minY) / h : 0,
      sim: readProbe(),
      w,
      h,
    };
  }

  function readProbe() {
    if (!readTarget) return null;
    const floatTex = texType === THREE.FloatType;
    const buf = floatTex ? new Float32Array(4) : new Uint16Array(4);
    const coords = [
      [4, 6],
      [18, 22],
      [40, 15],
      [27, 48],
    ];
    let sum = 0;
    let n = 0;
    try {
      for (const [x, y] of coords) {
        if (x >= size || y >= size) continue;
        renderer.readRenderTargetPixels(readTarget, x, y, 1, 1, buf);
        const xyz = floatTex
          ? [buf[0], buf[1], buf[2]]
          : [halfToFloat(buf[0]), halfToFloat(buf[1]), halfToFloat(buf[2])];
        const len = Math.hypot(xyz[0], xyz[1], xyz[2]);
        if (Number.isFinite(len)) {
          sum += len;
          n += 1;
        }
      }
    } catch (error) {
      return { error: String(error) };
    }
    return { len: n ? sum / n : null, n };
  }

  resize();

  return {
    ok: true,
    particles: count,
    sim: useGpu ? "gpu" : "vertex",
    mobile,
    get dpr() {
      return renderer.getPixelRatio();
    },
    resize,
    update,
    sample,
    setDprCap(next) {
      dprCap = next;
      resize();
    },
    setStride(next) {
      sharedUniforms.uStride.value = next;
    },
  };
}
