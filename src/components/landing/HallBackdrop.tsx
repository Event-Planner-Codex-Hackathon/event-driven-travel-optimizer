"use client";

import { useEffect, useRef } from "react";
import styles from "./Landing.module.css";

type Rgb = [number, number, number];
type Palette = { top: Rgb; bottom: Rgb; glow: Rgb };

// One sky per story step (sRGB, converted from the OKLCH ramp in landing.css).
const PALETTES: Palette[] = [
  { top: [0.019, 0.071, 0.181], bottom: [0.0, 0.203, 0.423], glow: [0.145, 0.567, 0.767] },
  { top: [0.008, 0.089, 0.218], bottom: [0.0, 0.241, 0.472], glow: [0.103, 0.63, 0.789] },
  { top: [0.0, 0.106, 0.231], bottom: [0.0, 0.296, 0.476], glow: [0.211, 0.722, 0.773] },
  { top: [0.039, 0.058, 0.198], bottom: [0.094, 0.182, 0.447], glow: [0.498, 0.475, 0.818] },
  { top: [0.0, 0.122, 0.264], bottom: [0.0, 0.324, 0.529], glow: [0.371, 0.753, 0.867] },
];

const VERTEX = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPointer;
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uGlow;
uniform float uPulse;
uniform float uDrift;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = r * p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 ptr = vec2((uPointer.x * 0.5 + 0.5) * aspect, 0.5 - uPointer.y * 0.5);

  // Sky: deep overhead, brighter toward the horizon.
  vec3 col = mix(uBottom, uTop, pow(smoothstep(0.0, 1.0, uv.y), 0.85));
  col += uGlow * 0.16 * exp(-uv.y * 5.0);

  // Low cloud banks drifting past the glass, with pointer parallax.
  vec2 cp = vec2(p.x * 0.9, p.y * 2.6);
  cp += vec2(uTime * 0.012 + uPointer.x * 0.05, uDrift * 0.4 - uPointer.y * 0.03);
  float c = fbm(cp * 1.6) * 0.75 + fbm(cp * 3.1 + 4.0) * 0.35;
  float cloud = smoothstep(0.52, 0.86, c) * smoothstep(0.0, 0.35, uv.y);
  col = mix(col, mix(uTop, uGlow, 0.35) + 0.04, cloud * 0.28);

  // Soft reflection of light that follows the pointer.
  float d = length((p - ptr) * vec2(0.8, 1.0));
  col += uGlow * 0.09 * exp(-d * d * 5.0);

  // A sweep of light across the glass each time the board flips.
  if (uPulse >= 0.0) {
    float x = uv.x + (uv.y - 0.5) * 0.35;
    float band = exp(-pow((x - mix(-0.4, 1.4, uPulse)) * 5.0, 2.0));
    col += uGlow * band * sin(3.14159 * uPulse) * 0.16;
  }

  // Out-of-focus curtain-wall frames in front of the sky.
  float mx = uv.x * aspect * 1.4 + uPointer.x * 0.03 + 0.18;
  float mullion = 1.0 - smoothstep(0.004, 0.022, 0.5 - abs(fract(mx) - 0.5));
  float transom = 1.0 - smoothstep(0.003, 0.016, abs(uv.y - 0.2 + uPointer.y * 0.01));
  col = mix(col, uTop * 0.55, max(mullion, transom) * 0.55);

  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

const RENDER_SCALE = 0.6;
const PULSE_MS = 1400;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function lerp(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

type Props = { step: number; reducedMotion: boolean };

export function HallBackdrop({ step, reducedMotion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(step);
  const pulseStartRef = useRef(-Infinity);
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (targetRef.current === step) return;
    targetRef.current = step;
    pulseStartRef.current = performance.now();
    wakeRef.current();
  }, [step]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const u = {
      res: gl.getUniformLocation(program, "uRes"),
      time: gl.getUniformLocation(program, "uTime"),
      pointer: gl.getUniformLocation(program, "uPointer"),
      top: gl.getUniformLocation(program, "uTop"),
      bottom: gl.getUniformLocation(program, "uBottom"),
      glow: gl.getUniformLocation(program, "uGlow"),
      pulse: gl.getUniformLocation(program, "uPulse"),
      drift: gl.getUniformLocation(program, "uDrift"),
    };

    let palette: Palette = { ...PALETTES[targetRef.current] };
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;

    const resize = () => {
      const width = Math.max(1, Math.round(window.innerWidth * RENDER_SCALE));
      const height = Math.max(1, Math.round(window.innerHeight * RENDER_SCALE));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    };

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reducedMotion) elapsed += dt;

      const target = PALETTES[targetRef.current] ?? PALETTES[0];
      const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.6);
      palette = {
        top: lerp(palette.top, target.top, k),
        bottom: lerp(palette.bottom, target.bottom, k),
        glow: lerp(palette.glow, target.glow, k),
      };
      const ease = reducedMotion ? 1 : 1 - Math.exp(-dt * 3);
      pointer.x += (pointer.tx - pointer.x) * ease;
      pointer.y += (pointer.ty - pointer.y) * ease;

      const sincePulse = now - pulseStartRef.current;
      const pulse = !reducedMotion && sincePulse < PULSE_MS ? sincePulse / PULSE_MS : -1;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const drift = scrollable > 0 ? window.scrollY / scrollable : 0;

      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, elapsed);
      gl.uniform2f(u.pointer, pointer.x, pointer.y);
      gl.uniform3fv(u.top, palette.top);
      gl.uniform3fv(u.bottom, palette.bottom);
      gl.uniform3fv(u.glow, palette.glow);
      gl.uniform1f(u.pulse, pulse);
      gl.uniform1f(u.drift, drift);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now: number) => {
      draw(now);
      raf = reducedMotion || document.hidden ? 0 : requestAnimationFrame(loop);
    };

    const wake = () => {
      if (raf) return;
      if (reducedMotion) {
        draw(performance.now());
        return;
      }
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    wakeRef.current = wake;

    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
    };
    const onResize = () => {
      resize();
      if (reducedMotion) draw(performance.now());
    };
    const onScroll = () => {
      if (reducedMotion) draw(performance.now());
    };
    const onVisibility = () => {
      if (!document.hidden) wake();
    };

    resize();
    draw(performance.now());
    wake();
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    canvas.dataset.ready = "true";

    return () => {
      cancelAnimationFrame(raf);
      wakeRef.current = () => {};
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      delete canvas.dataset.ready;
    };
  }, [reducedMotion]);

  return <canvas ref={canvasRef} className={styles.backdrop} aria-hidden="true" />;
}
