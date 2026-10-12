import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  LinearMipmapLinearFilter,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Path,
  Scene,
  Shape,
  ShadowMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  VSMShadowMap,
  WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Drum order of the flaps. ">" is an authored arrow, not a font glyph. */
export const CHARSET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-–/:·'>";

export type BoardStatus = 'fixed' | 'flex' | 'swap' | 'unknown' | 'off';

export interface BoardRow {
  text: string;
  status: BoardStatus;
}

export interface BoardOptions {
  container: HTMLElement;
  columns: number;
  rows: number;
  fontFamily: string;
  fontWeight?: number;
  reducedMotion: boolean;
}

export interface BoardHandle {
  setRows(rows: BoardRow[], opts?: { stagger?: number; instant?: boolean }): Promise<void>;
  setPointer(x: number, y: number): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ */
/* Dimensions (world units; one module is 1 unit wide)                 */
/* ------------------------------------------------------------------ */

const CELL_W = 1;
const CELL_H = 1.5;
const SPLIT = CELL_H * 0.02;
const GAP_X = 0.08;
const ROW_GAP = 0.34;
const CH_PAD_X = 0.2;
const CH_PAD_Y = 0.15;
const LAMP_W = 1.3;
const FACE_MARGIN = 0.42;
const BEZEL_W = 0.5;
const CASE_D = 1.5;
const FACE_DEPTH = 0.6;
const BEZEL_RAISE = 0.12;
const HINGE_Z = 0.16;
const FLAP_EPS = 0.006;
const WALL_GAP = 0.6;

/* Fit targets: case width share of the canvas, max height share. */
const FIT_W = 0.94;
const FIT_H = 0.86;
const ASPECT_H = 0.8;

const BASE_PITCH = (5 * Math.PI) / 180;
const MAX_YAW = (2.5 * Math.PI) / 180;
const MAX_PITCH = (1.5 * Math.PI) / 180;

/* Flip timing. */
const MAX_STEPS = 10;
const FALL_MIN_MS = 55;
const FALL_MAX_MS = 75;
const REBOUND_MS = 45;
const REBOUND_RAD = (2.8 * Math.PI) / 180;
const LAMP_FADE_MS = 120;
const MIN_TILT = (0.25 * Math.PI) / 180;
const MAX_TILT = (1.3 * Math.PI) / 180;

/* Palette (sRGB). */
const CASE_COLOR = '#1f2226';
const CHANNEL_COLOR = '#121417';
const FLAP_COLOR = '#2a2d31';
const GLYPH_COLOR = '#f2f1ea';
const STATUS_HEX: Record<BoardStatus, string | null> = {
  fixed: '#3ccf6e',
  flex: '#ffb21a',
  swap: '#4fb3ff',
  unknown: '#ff5a4a',
  off: null,
};
const LENS_GAIN = 1.0;
const GLOW_GAIN = 0.5;
/* Flaps see a dimmer room so their satin finish stays near-black at rest. */
const FLAP_ENV = 0.22;

/* Atlas layout. */
const ATLAS_CELL_W = 136;
const ATLAS_CELL_H = Math.round((ATLAS_CELL_W * CELL_H) / CELL_W);
const ATLAS_GUTTER = 6;
const ATLAS_SLOT_W = ATLAS_CELL_W + ATLAS_GUTTER * 2;
const ATLAS_SLOT_H = ATLAS_CELL_H + ATLAS_GUTTER * 2;
const ATLAS_COLS = 8;

const GLYPHS = Array.from(CHARSET);
const GLYPH_INDEX = new Map<string, number>(GLYPHS.map((g, i) => [g, i]));
const CHAR_ALIASES: Record<string, string> = { '—': '–', '’': "'", '‘': "'", '•': '·' };

interface Layout {
  caseW: number;
  caseH: number;
  innerW: number;
  innerH: number;
  channelW: number;
  channelH: number;
  channelLeft: number;
  colX: number[];
  rowY: number[];
  lampX: number;
}

function computeLayout(columns: number, rows: number): Layout {
  const channelW = columns * CELL_W + (columns - 1) * GAP_X + CH_PAD_X * 2;
  const channelH = CELL_H + CH_PAD_Y * 2;
  const innerW = FACE_MARGIN * 2 + channelW + LAMP_W;
  const innerH = FACE_MARGIN * 2 + rows * channelH + (rows - 1) * ROW_GAP;
  const channelLeft = -innerW / 2 + FACE_MARGIN;
  const colX: number[] = [];
  for (let c = 0; c < columns; c++) {
    colX.push(channelLeft + CH_PAD_X + CELL_W / 2 + c * (CELL_W + GAP_X));
  }
  const rowY: number[] = [];
  for (let r = 0; r < rows; r++) {
    rowY.push(innerH / 2 - FACE_MARGIN - channelH / 2 - r * (channelH + ROW_GAP));
  }
  return {
    caseW: innerW + BEZEL_W * 2,
    caseH: innerH + BEZEL_W * 2,
    innerW,
    innerH,
    channelW,
    channelH,
    channelLeft,
    colX,
    rowY,
    lampX: channelLeft + channelW + LAMP_W / 2,
  };
}

/** Width / height ratio a container should use so the case, rods and shadow fit nicely. */
export function boardAspectRatio(columns: number, rows: number): number {
  const l = computeLayout(Math.max(1, Math.floor(columns)), Math.max(1, Math.floor(rows)));
  return l.caseW / FIT_W / (l.caseH / ASPECT_H);
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

function normalizeText(text: string, columns: number): number[] {
  const plain = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const out: number[] = [];
  for (const raw of plain) {
    if (out.length >= columns) break;
    const ch = CHAR_ALIASES[raw] ?? raw;
    out.push(GLYPH_INDEX.get(ch) ?? 0);
  }
  while (out.length < columns) out.push(0);
  return out;
}

/** Drum path from `from` to `to`, at most MAX_STEPS flaps, ending on `to`. */
function drumPath(from: number, to: number): number[] {
  const n = GLYPHS.length;
  const dist = (to - from + n) % n;
  const steps = Math.min(dist, MAX_STEPS);
  const path: number[] = [];
  for (let m = 1; m <= steps; m++) path.push((to - (steps - m) + n) % n);
  return path;
}

/* ------------------------------------------------------------------ */
/* Glyph atlas                                                         */
/* ------------------------------------------------------------------ */

interface Atlas {
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  rects: Float32Array; // u0, v0, du, dv per glyph
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function buildAtlas(fontFamily: string, weight: number, anisotropy: number): Promise<Atlas> {
  try {
    await document.fonts.load(`${weight} 100px ${fontFamily}`, CHARSET);
  } catch {
    // fall back to whatever the browser resolves
  }

  const rowsN = Math.ceil(GLYPHS.length / ATLAS_COLS);
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * ATLAS_SLOT_W;
  canvas.height = rowsN * ATLAS_SLOT_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  ctx.fillStyle = CHANNEL_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cw = ATLAS_CELL_W;
  const ch = ATLAS_CELL_H;
  const font = (px: number) => `${weight} ${px}px ${fontFamily}`;

  ctx.font = font(100);
  const capProbe = ctx.measureText('H').actualBoundingBoxAscent;
  const capRatio = capProbe > 1 ? capProbe / 100 : 0.7;
  const capPx = ch * 0.62;
  const fontPx = capPx / capRatio;
  const baseline = ch / 2 + capPx / 2;
  const maxInk = cw * 0.8;

  const splitPx = (SPLIT / CELL_H) * ch;
  const topH = ch / 2 - splitPx / 2;
  const botY = ch / 2 + splitPx / 2;
  const botH = ch - botY;
  const radius = cw * 0.045;

  const rects = new Float32Array(GLYPHS.length * 4);

  GLYPHS.forEach((glyph, i) => {
    const sx = (i % ATLAS_COLS) * ATLAS_SLOT_W + ATLAS_GUTTER;
    const sy = Math.floor(i / ATLAS_COLS) * ATLAS_SLOT_H + ATLAS_GUTTER;

    ctx.save();
    ctx.translate(sx, sy);

    // two flap cards with rounded corners
    ctx.beginPath();
    roundRectPath(ctx, 0, 0, cw, topH, radius);
    ctx.fillStyle = FLAP_COLOR;
    ctx.fill();
    roundRectPath(ctx, 0, botY, cw, botH, radius);
    ctx.fill();

    // clip to both cards
    ctx.beginPath();
    roundRectPath(ctx, 0, 0, cw, topH, radius);
    ctx.save();
    ctx.clip();
    drawGlyph(ctx, glyph, cw, baseline, capPx, fontPx, maxInk, font);
    shadeHalf(ctx, cw, 0, topH, true);
    ctx.restore();

    ctx.beginPath();
    roundRectPath(ctx, 0, botY, cw, botH, radius);
    ctx.save();
    ctx.clip();
    drawGlyph(ctx, glyph, cw, baseline, capPx, fontPx, maxInk, font);
    shadeHalf(ctx, cw, botY, botH, false);
    ctx.restore();

    ctx.restore();

    // texture v runs bottom-up (flipY)
    rects[i * 4] = sx / canvas.width;
    rects[i * 4 + 1] = 1 - (sy + ch) / canvas.height;
    rects[i * 4 + 2] = cw / canvas.width;
    rects[i * 4 + 3] = ch / canvas.height;
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.needsUpdate = true;

  return { canvas, texture, rects };
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: string,
  cw: number,
  baseline: number,
  capPx: number,
  fontPx: number,
  maxInk: number,
  font: (px: number) => string,
): void {
  if (glyph === ' ') return;
  ctx.fillStyle = GLYPH_COLOR;

  if (glyph === '>') {
    // authored arrow: shaft plus triangular head, stem weight close to the face
    const cy = baseline - capPx / 2;
    const w = cw * 0.72;
    const x0 = (cw - w) / 2;
    const x1 = x0 + w;
    const head = w * 0.46;
    const xh = x1 - head;
    const t = capPx * 0.085;
    const hh = capPx * 0.36;
    ctx.beginPath();
    ctx.moveTo(x0, cy - t);
    ctx.lineTo(xh, cy - t);
    ctx.lineTo(xh, cy - hh);
    ctx.lineTo(x1, cy);
    ctx.lineTo(xh, cy + hh);
    ctx.lineTo(xh, cy + t);
    ctx.lineTo(x0, cy + t);
    ctx.closePath();
    ctx.fill();
    return;
  }

  ctx.font = font(fontPx);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(glyph);
  const inkL = m.actualBoundingBoxLeft;
  const inkR = m.actualBoundingBoxRight;
  const ink = inkL + inkR;
  const scale = ink > maxInk ? maxInk / ink : 1;
  ctx.save();
  ctx.translate(cw / 2, 0);
  ctx.scale(scale, 1);
  ctx.fillText(glyph, -ink / 2 + inkL, baseline);
  ctx.restore();
}

function shadeHalf(ctx: CanvasRenderingContext2D, cw: number, y: number, h: number, top: boolean): void {
  // soft darkening toward the split line
  ctx.globalCompositeOperation = 'multiply';
  const g = top ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(0, y + h, 0, y);
  g.addColorStop(0, 'rgb(255,255,255)');
  g.addColorStop(0.5, 'rgb(246,246,246)');
  g.addColorStop(0.86, 'rgb(222,222,222)');
  g.addColorStop(1, 'rgb(190,190,190)');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, cw, h);
  ctx.globalCompositeOperation = 'source-over';
  // faint card edge
  ctx.fillStyle = top ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, top ? y : y + h - 2, cw, 2);
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

function quad(
  y0: number,
  y1: number,
  z: number,
  v0: number,
  v1: number,
  facing: 1 | -1,
): { pos: number[]; nrm: number[]; uv: number[]; idx: number[] } {
  const hw = CELL_W / 2;
  return {
    pos: [-hw, y0, z, hw, y0, z, hw, y1, z, -hw, y1, z],
    nrm: [0, 0, facing, 0, 0, facing, 0, 0, facing, 0, 0, facing],
    uv: [0, v0, 1, v0, 1, v1, 0, v1],
    idx: facing === 1 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2],
  };
}

function halfGeometry(top: boolean): BufferGeometry {
  const g = SPLIT / 2;
  const y0 = top ? g : -CELL_H / 2;
  const y1 = top ? CELL_H / 2 : -g;
  const q = quad(y0, y1, 0, 0.5 + y0 / CELL_H, 0.5 + y1 / CELL_H, 1);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(q.pos), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(q.nrm), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(q.uv), 2));
  geo.setIndex(q.idx);
  return geo;
}

/**
 * Falling flap: front quad = top half of the current glyph; back quad sits behind it
 * and, after the half-turn about the hinge, reads as the bottom half of the next glyph.
 */
function flapGeometry(): BufferGeometry {
  const g = SPLIT / 2;
  const y0 = g;
  const y1 = CELL_H / 2;
  const front = quad(y0, y1, FLAP_EPS, 0.5 + y0 / CELL_H, 0.5 + y1 / CELL_H, 1);
  // rotation by pi maps local y to -y, so v = 0.5 - y / H keeps the glyph upright
  const back = quad(y0, y1, -FLAP_EPS, 0.5 - y0 / CELL_H, 0.5 - y1 / CELL_H, -1);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array([...front.pos, ...back.pos]), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array([...front.nrm, ...back.nrm]), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array([...front.uv, ...back.uv]), 2));
  geo.setAttribute('aSide', new BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]), 1));
  geo.setIndex([...front.idx, ...back.idx.map((i) => i + 4)]);
  return geo;
}

function roundedRectShape<T extends Path>(p: T, cx: number, cy: number, w: number, h: number, r: number): T {
  const x = cx - w / 2;
  const y = cy - h / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
  return p;
}

/* ------------------------------------------------------------------ */
/* Shader patches                                                      */
/* ------------------------------------------------------------------ */

function patchStaticRect(mat: MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = aRect.xy + uv * aRect.zw;');
  };
  mat.customProgramCacheKey = () => 'splitflap-static';
}

function patchFlapRect(mat: MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRectFront;\nattribute vec4 aRectBack;\nattribute float aSide;')
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nvec4 flapRect = mix(aRectFront, aRectBack, aSide);\nvMapUv = flapRect.xy + uv * flapRect.zw;',
      );
  };
  mat.customProgramCacheKey = () => 'splitflap-flap';
}

function patchLens(mat: MeshPhysicalMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aLamp;\nvarying vec3 vLamp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLamp = aLamp;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLamp;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\nfloat lampCore = pow(clamp(normal.z, 0.0, 1.0), 6.0);\ntotalEmissiveRadiance += vLamp * (0.62 + 0.5 * lampCore) + vLamp * vLamp * 0.25 * lampCore;',
      );
  };
  mat.customProgramCacheKey = () => 'splitflap-lens';
}

function patchShadowFade(mat: ShadowMaterial, viewport: { value: Vector2 }): void {
  // fades the drop shadow toward the canvas edges so it never ends in a hard line
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uViewport = viewport;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uViewport;')
      .replace(
        '#include <tonemapping_fragment>',
        [
          'vec2 sp = gl_FragCoord.xy / uViewport;',
          'float edgeFade = smoothstep(0.0, 0.07, sp.x) * smoothstep(0.0, 0.07, 1.0 - sp.x)',
          '  * smoothstep(0.0, 0.14, sp.y) * smoothstep(0.0, 0.05, 1.0 - sp.y);',
          'gl_FragColor.a *= edgeFade;',
          '#include <tonemapping_fragment>',
        ].join('\n'),
      );
  };
  mat.customProgramCacheKey = () => 'splitflap-shadow';
}

function glowTexture(): CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/* Cell state                                                          */
/* ------------------------------------------------------------------ */

interface Cell {
  col: number;
  row: number;
  shown: number;
  queue: number[];
  nextStart: number;
  active: boolean;
  stepFrom: number;
  stepTo: number;
  stepStart: number;
  stepDur: number;
  rebounding: boolean;
  rbStart: number;
  rbFrom: number;
  rbTo: number;
  topDrawn: number;
  bottomDrawn: number;
  slotAVisible: boolean;
  slotBVisible: boolean;
}

interface Lamp {
  from: Color;
  to: Color;
  current: Color;
  start: number;
  fading: boolean;
  status: BoardStatus;
}

const easeFall = (t: number) => 0.06 * t + 0.94 * t * t;
const rebound = (u: number) => REBOUND_RAD * 1.9 * Math.exp(-3 * u) * Math.abs(Math.sin(2 * Math.PI * u));

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

export async function createSplitFlapBoard(opts: BoardOptions): Promise<BoardHandle> {
  const columns = Math.max(1, Math.floor(opts.columns));
  const rows = Math.max(1, Math.floor(opts.rows));
  const weight = opts.fontWeight ?? 600;
  const reducedMotion = opts.reducedMotion;
  const container = opts.container;

  if (typeof window === 'undefined' || typeof WebGL2RenderingContext === 'undefined') {
    throw new Error('WebGL is unavailable');
  }

  // out of flow so the drawing buffer size never feeds back into the container's layout
  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.setAttribute('aria-hidden', 'true');

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    throw new Error('WebGL is unavailable');
  }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;

  let atlas: Atlas;
  try {
    atlas = await buildAtlas(opts.fontFamily, weight, renderer.capabilities.getMaxAnisotropy());
  } catch (err) {
    renderer.dispose();
    throw err;
  }

  const prevPosition = container.style.position;
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(canvas);

  const layout = computeLayout(columns, rows);
  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 1, 1, 400);

  /* environment */
  let pmrem = new PMREMGenerator(renderer);
  let envTexture: Texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.6;
  // turn the room so its bright panels sit overhead and behind; flaps facing the viewer stay dark
  scene.environmentRotation.set(0, Math.PI, 0);

  /* materials */
  const caseMat = new MeshPhysicalMaterial({
    color: CASE_COLOR,
    roughness: 0.6,
    metalness: 0.5,
    clearcoat: 0.18,
    clearcoatRoughness: 0.45,
  });
  const channelMat = new MeshStandardMaterial({ color: CHANNEL_COLOR, roughness: 0.82, metalness: 0.2 });
  const flapProps = { map: atlas.texture, roughness: 0.42, metalness: 0, envMap: envTexture, envMapIntensity: FLAP_ENV };
  const staticMat = new MeshStandardMaterial(flapProps);
  patchStaticRect(staticMat);
  const flapMat = new MeshStandardMaterial(flapProps);
  patchFlapRect(flapMat);
  staticMat.envMapRotation.copy(scene.environmentRotation);
  flapMat.envMapRotation.copy(scene.environmentRotation);
  const axleMat = new MeshStandardMaterial({ color: '#34373c', roughness: 0.32, metalness: 0.9 });
  const steelMat = new MeshPhysicalMaterial({
    color: '#c9ccd1',
    metalness: 1,
    roughness: 0.3,
    anisotropy: 0.65,
    anisotropyRotation: Math.PI / 2,
  });
  const screwMat = new MeshStandardMaterial({ color: '#5d6168', metalness: 0.9, roughness: 0.38 });
  const bezelRingMat = new MeshPhysicalMaterial({
    color: '#0c0d0f',
    roughness: 0.22,
    metalness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    side: DoubleSide,
  });
  const lensMat = new MeshPhysicalMaterial({
    color: '#111315',
    roughness: 0.14,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });
  patchLens(lensMat);
  const glowTex = glowTexture();
  const glowMat = new MeshBasicMaterial({
    map: glowTex,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  const viewportUniform = { value: new Vector2(1, 1) };
  const wallMat = new ShadowMaterial({ opacity: 0.15 });
  patchShadowFade(wallMat, viewportUniform);

  /* housing: rounded case body merged with the raised bezel frame */
  const caseGeo = new RoundedBoxGeometry(layout.caseW, layout.caseH, CASE_D, 6, 0.24).toNonIndexed();
  caseGeo.translate(0, 0, -CASE_D / 2);
  const bevel = 0.04;
  const bezelShape = roundedRectShape(new Shape(), 0, 0, layout.caseW - 0.03, layout.caseH - 0.03, 0.22);
  bezelShape.holes.push(roundedRectShape(new Path(), 0, 0, layout.innerW, layout.innerH, 0.06));
  const bezelGeo = new ExtrudeGeometry(bezelShape, {
    depth: FACE_DEPTH + BEZEL_RAISE - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 4,
    curveSegments: 10,
  });
  bezelGeo.translate(0, 0, bevel);
  const housingGeo = mergeGeometries([caseGeo, bezelGeo]);
  caseGeo.dispose();
  bezelGeo.dispose();
  if (!housingGeo) throw new Error('Housing geometry merge failed');
  const housing = new Mesh(housingGeo, caseMat);
  housing.castShadow = true;
  scene.add(housing);

  /* faceplate with one recessed channel per row; side walls use the channel material */
  const faceShape = roundedRectShape(new Shape(), 0, 0, layout.innerW + 0.04, layout.innerH + 0.04, 0.06);
  const channelCx = layout.channelLeft + layout.channelW / 2;
  for (let r = 0; r < rows; r++) {
    faceShape.holes.push(roundedRectShape(new Path(), channelCx, layout.rowY[r], layout.channelW, layout.channelH, 0.05));
  }
  const faceGeo = new ExtrudeGeometry(faceShape, { depth: FACE_DEPTH, bevelEnabled: false, curveSegments: 6 });
  const faceplate = new Mesh(faceGeo, [caseMat, channelMat]);
  scene.add(faceplate);

  const floor = new Mesh(new PlaneGeometry(layout.innerW, layout.innerH), channelMat);
  floor.position.z = 0.004;
  scene.add(floor);

  /* character modules */
  const cellCount = rows * columns;
  const topGeo = halfGeometry(true);
  const bottomGeo = halfGeometry(false);
  const topRect = new InstancedBufferAttribute(new Float32Array(cellCount * 4), 4);
  const bottomRect = new InstancedBufferAttribute(new Float32Array(cellCount * 4), 4);
  topRect.setUsage(DynamicDrawUsage);
  bottomRect.setUsage(DynamicDrawUsage);
  topGeo.setAttribute('aRect', topRect);
  bottomGeo.setAttribute('aRect', bottomRect);
  const tops = new InstancedMesh(topGeo, staticMat, cellCount);
  const bottoms = new InstancedMesh(bottomGeo, staticMat, cellCount);

  const flapGeo = flapGeometry();
  const flapCount = cellCount * 2;
  const flapFront = new InstancedBufferAttribute(new Float32Array(flapCount * 4), 4);
  const flapBack = new InstancedBufferAttribute(new Float32Array(flapCount * 4), 4);
  flapFront.setUsage(DynamicDrawUsage);
  flapBack.setUsage(DynamicDrawUsage);
  flapGeo.setAttribute('aRectFront', flapFront);
  flapGeo.setAttribute('aRectBack', flapBack);
  const flaps = new InstancedMesh(flapGeo, flapMat, flapCount);
  flaps.instanceMatrix.setUsage(DynamicDrawUsage);

  const axleGeo = new CylinderGeometry(0.02, 0.02, CELL_W + GAP_X * 0.7, 10, 1);
  axleGeo.rotateZ(Math.PI / 2);
  const axles = new InstancedMesh(axleGeo, axleMat, cellCount);

  // each resting bottom flap leans forward by a slightly different amount, like a worn board
  const tilts = new Float32Array(cellCount);
  for (let i = 0; i < cellCount; i++) tilts[i] = MIN_TILT + Math.random() * (MAX_TILT - MIN_TILT);

  const m4 = new Matrix4();
  const hidden = new Matrix4().makeScale(0, 0, 0);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const i = r * columns + c;
      m4.makeTranslation(layout.colX[c], layout.rowY[r], HINGE_Z);
      tops.setMatrixAt(i, m4);
      m4.makeRotationX(-tilts[i]).setPosition(layout.colX[c], layout.rowY[r], HINGE_Z);
      bottoms.setMatrixAt(i, m4);
      m4.makeTranslation(layout.colX[c], layout.rowY[r], HINGE_Z - 0.03);
      axles.setMatrixAt(i, m4);
      flaps.setMatrixAt(i * 2, hidden);
      flaps.setMatrixAt(i * 2 + 1, hidden);
    }
  }
  for (const mesh of [tops, bottoms, flaps, axles]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  /* status lamps */
  const lampZ = FACE_DEPTH;
  const ringGeo = new LatheGeometry(
    [
      new Vector2(0.25, 0),
      new Vector2(0.37, 0),
      new Vector2(0.395, 0.03),
      new Vector2(0.395, 0.07),
      new Vector2(0.365, 0.1),
      new Vector2(0.31, 0.11),
      new Vector2(0.27, 0.085),
      new Vector2(0.255, 0.03),
    ],
    48,
  );
  ringGeo.rotateX(Math.PI / 2);
  const lensGeo = new SphereGeometry(0.27, 40, 20);
  lensGeo.scale(1, 1, 0.42);
  const lampAttr = new InstancedBufferAttribute(new Float32Array(rows * 3), 3);
  lampAttr.setUsage(DynamicDrawUsage);
  lensGeo.setAttribute('aLamp', lampAttr);
  const rings = new InstancedMesh(ringGeo, bezelRingMat, rows);
  const lenses = new InstancedMesh(lensGeo, lensMat, rows);
  const glows = new InstancedMesh(new PlaneGeometry(1.9, 1.9), glowMat, rows);
  const black = new Color(0, 0, 0);
  for (let r = 0; r < rows; r++) {
    m4.makeTranslation(layout.lampX, layout.rowY[r], lampZ);
    rings.setMatrixAt(r, m4);
    m4.makeTranslation(layout.lampX, layout.rowY[r], lampZ + 0.04);
    lenses.setMatrixAt(r, m4);
    m4.makeTranslation(layout.lampX, layout.rowY[r], lampZ + 0.16);
    glows.setMatrixAt(r, m4);
    glows.setColorAt(r, black);
  }
  glows.renderOrder = 2;
  for (const mesh of [rings, lenses, glows]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  /* bezel screws */
  const screwGeo = new SphereGeometry(0.075, 16, 8);
  screwGeo.scale(1, 1, 0.45);
  const sx = layout.caseW / 2 - BEZEL_W / 2;
  const sy = layout.caseH / 2 - BEZEL_W / 2;
  const screwPos: Array<[number, number]> = [
    [-sx, sy],
    [sx, sy],
    [-sx, -sy],
    [sx, -sy],
    [0, sy],
    [0, -sy],
  ];
  const screws = new InstancedMesh(screwGeo, screwMat, screwPos.length);
  screwPos.forEach(([x, y], i) => {
    m4.makeTranslation(x, y, FACE_DEPTH + BEZEL_RAISE);
    screws.setMatrixAt(i, m4);
  });
  scene.add(screws);

  /* hanging rods with collars, rising out of frame */
  const rodLen = 120;
  const rodGeoA = new CylinderGeometry(0.085, 0.085, rodLen, 20, 1, true);
  rodGeoA.translate(0, rodLen / 2, 0);
  const collarGeo = new CylinderGeometry(0.2, 0.22, 0.28, 28, 1);
  collarGeo.translate(0, 0.14, 0);
  const capGeo = new CylinderGeometry(0.13, 0.2, 0.12, 28, 1);
  capGeo.translate(0, 0.34, 0);
  const rodParts = [rodGeoA, collarGeo, capGeo].map((g) => g.toNonIndexed());
  const rodGeo = mergeGeometries(rodParts);
  [rodGeoA, collarGeo, capGeo, ...rodParts].forEach((g) => g.dispose());
  if (!rodGeo) throw new Error('Rod geometry merge failed');
  const rods = new InstancedMesh(rodGeo, steelMat, 2);
  const rodX = layout.caseW * 0.31;
  [-rodX, rodX].forEach((x, i) => {
    m4.makeTranslation(x, layout.caseH / 2 - 0.02, -CASE_D / 2);
    rods.setMatrixAt(i, m4);
  });
  rods.castShadow = true;
  rods.frustumCulled = false;
  scene.add(rods);

  /* wall that only receives the drop shadow */
  const wall = new Mesh(new PlaneGeometry(600, 600), wallMat);
  wall.position.z = -CASE_D - WALL_GAP;
  wall.receiveShadow = true;
  scene.add(wall);

  /* key light from upper-left-front */
  // high enough that its specular lobe lands below the board instead of washing the flaps
  const key = new DirectionalLight(0xffffff, 2.8);
  key.target.position.set(0, 0, -CASE_D / 2);
  key.position.copy(new Vector3(-0.4, 0.85, 0.75).normalize().multiplyScalar(70)).add(key.target.position);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const sc = key.shadow.camera;
  sc.left = -layout.caseW / 2 - 5;
  sc.right = layout.caseW / 2 + 5;
  sc.top = layout.caseH / 2 + 7;
  sc.bottom = -layout.caseH / 2 - 6;
  sc.near = 20;
  sc.far = 130;
  sc.updateProjectionMatrix();
  key.shadow.radius = 14;
  key.shadow.blurSamples = 24;
  key.shadow.bias = -0.0004;
  scene.add(key, key.target);

  const fill = new DirectionalLight(0xdfe6ff, 0.35);
  fill.position.set(30, 6, 40);
  scene.add(fill);

  /* ---------------------------------------------------------------- */
  /* State                                                            */
  /* ---------------------------------------------------------------- */

  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      cells.push({
        col: c,
        row: r,
        shown: 0,
        queue: [],
        nextStart: 0,
        active: false,
        stepFrom: 0,
        stepTo: 0,
        stepStart: 0,
        stepDur: 0,
        rebounding: false,
        rbStart: 0,
        rbFrom: 0,
        rbTo: 0,
        topDrawn: -1,
        bottomDrawn: -1,
        slotAVisible: false,
        slotBVisible: false,
      });
    }
  }
  const lamps: Lamp[] = [];
  for (let r = 0; r < rows; r++) {
    lamps.push({ from: new Color(), to: new Color(), current: new Color(), start: 0, fading: false, status: 'off' });
  }

  let raf = 0;
  let paused = false;
  let lost = false;
  let disposed = false;
  let lastFrame = 0;
  let waiters: Array<() => void> = [];

  let dist = 30;
  let aimY = 0;
  const frontZ = FACE_DEPTH + BEZEL_RAISE;
  const yaw = { cur: 0, target: 0 };
  const pitch = { cur: 0, target: 0 };

  const writeRect = (attr: InstancedBufferAttribute, slot: number, glyph: number) => {
    const a = attr.array as Float32Array;
    a[slot * 4] = atlas.rects[glyph * 4];
    a[slot * 4 + 1] = atlas.rects[glyph * 4 + 1];
    a[slot * 4 + 2] = atlas.rects[glyph * 4 + 2];
    a[slot * 4 + 3] = atlas.rects[glyph * 4 + 3];
  };

  const setFlap = (slot: number, cell: Cell, angle: number, from: number, to: number) => {
    m4.makeRotationX(angle);
    m4.setPosition(layout.colX[cell.col], layout.rowY[cell.row], HINGE_Z);
    flaps.setMatrixAt(slot, m4);
    writeRect(flapFront, slot, from);
    writeRect(flapBack, slot, to);
  };

  const lampTmp = new Color();
  const writeLamp = (r: number) => {
    const l = lamps[r];
    const la = lampAttr.array as Float32Array;
    la[r * 3] = l.current.r * LENS_GAIN;
    la[r * 3 + 1] = l.current.g * LENS_GAIN;
    la[r * 3 + 2] = l.current.b * LENS_GAIN;
    glows.setColorAt(r, lampTmp.copy(l.current).multiplyScalar(GLOW_GAIN));
  };
  const flushLamps = () => {
    lampAttr.needsUpdate = true;
    if (glows.instanceColor) glows.instanceColor.needsUpdate = true;
  };

  const cellBusy = (c: Cell) => c.active || c.queue.length > 0 || c.rebounding;

  const beginStep = (c: Cell, at: number) => {
    const next = c.queue.shift();
    if (next === undefined) return;
    c.active = true;
    c.stepFrom = c.shown;
    c.stepTo = next;
    c.stepStart = at;
    c.stepDur = FALL_MIN_MS + Math.random() * (FALL_MAX_MS - FALL_MIN_MS);
  };

  const snapCell = (c: Cell, glyph: number) => {
    c.shown = glyph;
    c.queue = [];
    c.active = false;
    c.rebounding = false;
  };

  const finalGlyph = (c: Cell) => (c.queue.length > 0 ? c.queue[c.queue.length - 1] : c.active ? c.stepTo : c.shown);

  const lampTarget = (status: BoardStatus, out: Color) => {
    const hex = STATUS_HEX[status];
    if (hex === null) out.setRGB(0, 0, 0);
    else out.set(hex);
    return out;
  };

  /** Advances all animation state; returns true while anything still moves. */
  const update = (now: number): boolean => {
    let busy = false;
    let staticDirty = false;
    let flapDirty = false;

    for (let i = 0; i < cellCount; i++) {
      const c = cells[i];
      if (!c.active && c.queue.length > 0 && now >= c.nextStart) beginStep(c, c.nextStart);
      while (c.active && now >= c.stepStart + c.stepDur) {
        const land = c.stepStart + c.stepDur;
        c.shown = c.stepTo;
        c.active = false;
        c.rebounding = true;
        c.rbStart = land;
        c.rbFrom = c.stepFrom;
        c.rbTo = c.stepTo;
        if (c.queue.length > 0) beginStep(c, land);
      }

      const slotA = i * 2;
      if (c.active) {
        const t = Math.min(1, Math.max(0, (now - c.stepStart) / c.stepDur));
        setFlap(slotA, c, easeFall(t) * (Math.PI - tilts[i]), c.stepFrom, c.stepTo);
        c.slotAVisible = true;
        flapDirty = true;
      } else if (c.slotAVisible) {
        flaps.setMatrixAt(slotA, hidden);
        c.slotAVisible = false;
        flapDirty = true;
      }

      const slotB = slotA + 1;
      if (c.rebounding) {
        const u = (now - c.rbStart) / REBOUND_MS;
        if (u >= 1 || reducedMotion) {
          c.rebounding = false;
        } else {
          setFlap(slotB, c, Math.PI - tilts[i] - rebound(u), c.rbFrom, c.rbTo);
          c.slotBVisible = true;
          flapDirty = true;
        }
      }
      if (!c.rebounding && c.slotBVisible) {
        flaps.setMatrixAt(slotB, hidden);
        c.slotBVisible = false;
        flapDirty = true;
      }

      const top = c.active ? c.stepTo : c.shown;
      const bottom = c.shown;
      if (top !== c.topDrawn) {
        writeRect(topRect, i, top);
        c.topDrawn = top;
        staticDirty = true;
      }
      if (bottom !== c.bottomDrawn) {
        writeRect(bottomRect, i, bottom);
        c.bottomDrawn = bottom;
        staticDirty = true;
      }
      if (cellBusy(c)) busy = true;
    }

    if (staticDirty) {
      topRect.needsUpdate = true;
      bottomRect.needsUpdate = true;
    }
    if (flapDirty) {
      flaps.instanceMatrix.needsUpdate = true;
      flapFront.needsUpdate = true;
      flapBack.needsUpdate = true;
    }

    // lamps
    let lampBusy = false;
    let lampDirty = false;
    lamps.forEach((l, r) => {
      if (!l.fading) return;
      const k = Math.min(1, (now - l.start) / LAMP_FADE_MS);
      l.current.copy(l.from).lerp(l.to, k);
      if (k >= 1) l.fading = false;
      else lampBusy = true;
      writeLamp(r);
      lampDirty = true;
    });
    if (lampDirty) flushLamps();

    // parallax easing
    const dt = lastFrame > 0 ? Math.min(64, Math.max(0, now - lastFrame)) : 16;
    lastFrame = now;
    const k = 1 - Math.exp(-dt / 160);
    let camBusy = false;
    for (const p of [yaw, pitch]) {
      const d = p.target - p.cur;
      if (Math.abs(d) > 1e-5) {
        p.cur += d * k;
        camBusy = true;
      } else {
        p.cur = p.target;
      }
    }
    if (camBusy) placeCamera(dist, aimY, BASE_PITCH + pitch.cur, yaw.cur);

    if (!busy && waiters.length > 0) {
      const list = waiters;
      waiters = [];
      queueMicrotask(() => list.forEach((fn) => fn()));
    }
    return busy || lampBusy || camBusy;
  };

  /* ---------------------------------------------------------------- */
  /* Camera fit                                                       */
  /* ---------------------------------------------------------------- */

  const target = new Vector3();
  const placeCamera = (d: number, ay: number, ptch: number, yw: number) => {
    target.set(0, ay, frontZ);
    camera.position.set(
      target.x + d * Math.sin(yw) * Math.cos(ptch),
      target.y - d * Math.sin(ptch),
      target.z + d * Math.cos(yw) * Math.cos(ptch),
    );
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };

  const corners: Vector3[] = [];
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-CASE_D, frontZ]) corners.push(new Vector3((x * layout.caseW) / 2, (y * layout.caseH) / 2, z));
    }
  }
  const proj = new Vector3();

  const fit = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w < 2 || h < 2) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    const buf = renderer.getDrawingBufferSize(new Vector2());
    viewportUniform.value.copy(buf);

    camera.aspect = w / h;
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const tanH = tanV * camera.aspect;
    dist = layout.caseW / (2 * FIT_W * tanH);
    aimY = 0;
    camera.near = Math.max(0.5, dist * 0.2);
    camera.far = dist + 260;
    camera.updateProjectionMatrix();

    for (let it = 0; it < 8; it++) {
      placeCamera(dist, aimY, BASE_PITCH, 0);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const c of corners) {
        proj.copy(c).project(camera);
        minX = Math.min(minX, proj.x);
        maxX = Math.max(maxX, proj.x);
        minY = Math.min(minY, proj.y);
        maxY = Math.max(maxY, proj.y);
      }
      const wFrac = (maxX - minX) / 2;
      const hFrac = (maxY - minY) / 2;
      const s = Math.max(wFrac / FIT_W, hFrac / FIT_H);
      dist *= s;
      const hNew = hFrac / s;
      const spare = 1 - hNew;
      const wantMinY = -1 + 2 * spare * 0.42;
      const delta = wantMinY - minY / s;
      aimY -= delta * dist * tanV;
    }
    camera.near = Math.max(0.5, dist * 0.2);
    camera.far = dist + 260;
    camera.updateProjectionMatrix();
    placeCamera(dist, aimY, BASE_PITCH + pitch.cur, yaw.cur);
    requestFrame();
  };

  /* ---------------------------------------------------------------- */
  /* Loop                                                             */
  /* ---------------------------------------------------------------- */

  let lastCalls = '';
  const render = () => {
    renderer.render(scene, camera);
    const calls = String(renderer.info.render.calls);
    if (calls !== lastCalls) {
      lastCalls = calls;
      canvas.dataset.drawCalls = calls;
    }
  };

  const frame = (now: number) => {
    raf = 0;
    if (paused || lost || disposed) return;
    const moving = update(now);
    render();
    if (moving) raf = requestAnimationFrame(frame);
    else lastFrame = 0;
  };

  function requestFrame() {
    if (raf || paused || lost || disposed) return;
    raf = requestAnimationFrame(frame);
  }

  const cancelFrame = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastFrame = 0;
  };

  /** Jumps every cell and lamp to its final state and settles pending promises. */
  const snapAll = () => {
    for (const c of cells) {
      if (cellBusy(c)) snapCell(c, finalGlyph(c));
    }
    for (const l of lamps) {
      if (l.fading) {
        l.current.copy(l.to);
        l.fading = false;
      }
    }
    yaw.cur = yaw.target;
    pitch.cur = pitch.target;
    update(performance.now());
    lamps.forEach((_, r) => writeLamp(r));
    flushLamps();
    placeCamera(dist, aimY, BASE_PITCH + pitch.cur, yaw.cur);
  };

  /* ---------------------------------------------------------------- */
  /* Context loss                                                     */
  /* ---------------------------------------------------------------- */

  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    cancelFrame();
    snapAll();
  };
  const onRestored = () => {
    lost = false;
    try {
      pmrem.dispose();
      envTexture.dispose();
      pmrem = new PMREMGenerator(renderer);
      envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTexture;
      staticMat.envMap = envTexture;
      flapMat.envMap = envTexture;
      atlas.texture.needsUpdate = true;
      glowTex.needsUpdate = true;
      renderer.shadowMap.needsUpdate = true;
      requestFrame();
    } catch {
      lost = true;
    }
  };
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);

  const ro = new ResizeObserver(() => fit());
  ro.observe(container);

  // initial blank state
  update(performance.now());
  renderer.shadowMap.needsUpdate = true;
  fit();
  if (!paused && !lost) {
    try {
      render();
    } catch {
      // a lost context during start-up must not throw
    }
  }

  /* ---------------------------------------------------------------- */
  /* Handle                                                           */
  /* ---------------------------------------------------------------- */

  const handle: BoardHandle = {
    setRows(input, options) {
      if (disposed) return Promise.resolve();
      const now = performance.now();
      const instant = options?.instant === true || reducedMotion || paused || lost;
      const stagger = Math.max(0, options?.stagger ?? 500);
      const tmp = new Color();

      for (let r = 0; r < rows; r++) {
        const row = input[r] ?? { text: '', status: 'off' as BoardStatus };
        const glyphs = normalizeText(row.text ?? '', columns);

        const l = lamps[r];
        const status: BoardStatus = STATUS_HEX[row.status] !== undefined ? row.status : 'off';
        if (status !== l.status) {
          l.status = status;
          lampTarget(status, tmp);
          if (paused || lost) {
            l.current.copy(tmp);
            l.to.copy(tmp);
            l.fading = false;
          } else {
            l.from.copy(l.current);
            l.to.copy(tmp);
            l.start = now;
            l.fading = true;
          }
        }

        for (let c = 0; c < columns; c++) {
          const cell = cells[r * columns + c];
          const goal = glyphs[c];
          if (instant) {
            snapCell(cell, goal);
            continue;
          }
          const base = cell.active ? cell.stepTo : cell.shown;
          cell.queue = drumPath(base, goal);
          if (!cell.active && cell.queue.length > 0) {
            const bias = columns > 1 ? (c / (columns - 1)) * stagger * 0.35 : 0;
            cell.nextStart = now + Math.random() * stagger + bias;
          }
        }
      }

      if (paused || lost) {
        snapAll();
        return Promise.resolve();
      }
      const pending = cells.some(cellBusy);
      requestFrame();
      if (!pending) return Promise.resolve();
      return new Promise<void>((resolve) => {
        waiters.push(resolve);
      });
    },

    setPointer(x, y) {
      if (disposed || reducedMotion) return;
      const cx = Math.max(-1, Math.min(1, Number.isFinite(x) ? x : 0));
      const cy = Math.max(-1, Math.min(1, Number.isFinite(y) ? y : 0));
      yaw.target = cx * MAX_YAW;
      pitch.target = cy * MAX_PITCH;
      requestFrame();
    },

    pause() {
      if (disposed || paused) return;
      paused = true;
      cancelFrame();
      snapAll();
    },

    resume() {
      if (disposed || !paused) return;
      paused = false;
      requestFrame();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      cancelFrame();
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost, false);
      canvas.removeEventListener('webglcontextrestored', onRestored, false);
      const list = waiters;
      waiters = [];
      list.forEach((fn) => fn());

      const mats = new Set<Material>();
      scene.traverse((obj) => {
        if (obj instanceof Mesh) {
          (obj.geometry as BufferGeometry).dispose();
          const m = obj.material as Material | Material[];
          (Array.isArray(m) ? m : [m]).forEach((mm) => mats.add(mm));
        }
        if (obj instanceof InstancedMesh) obj.dispose();
      });
      mats.forEach((m) => m.dispose());
      atlas.texture.dispose();
      glowTex.dispose();
      envTexture.dispose();
      pmrem.dispose();
      key.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      container.style.position = prevPosition;
    },
  };

  return handle;
}
