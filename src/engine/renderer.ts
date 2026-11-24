import {
  AnimatedStroke,
  BackgroundImage,
  CanvasConfig,
  LoopBehavior,
  StrokePoint,
  StrokeShape,
  WORLD_REF_HEIGHT,
} from '../types/studio';
import { hashSigned, mapProgressToArcU, smoothNoise1D } from './geometry';

export interface SceneRenderState {
  strokes: AnimatedStroke[];
  activeDraftPoints?: StrokePoint[];
  activeDraftColor?: string;
  activeDraftWidth?: number;
  activeDraftOpacity?: number;
  backgroundImage: BackgroundImage | null;
  loadedImageElement: HTMLImageElement | null;
  canvasConfig: CanvasConfig;
  selectedStrokeId?: string | null;
}

export interface RenderOptions {
  /** Exclude selection halos and interactive guides during export */
  isExport?: boolean;
  /** Zero-based loop index for multi-loop video export (used by 'once' behavior) */
  loopIndex?: number;
}

interface ComputedPoint {
  x: number;
  y: number;
  width: number;
  /** Per-point alpha multiplier 0..1 for silky soft fade-in / fade-out */
  alpha: number;
  /** Arc distance in world units (used for dots/chalk/pencil/spray spacing) */
  dist: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Smooth edge-softening factor at open stroke endpoints so lines never clip or stop abruptly.
 */
function openEdgeEnvelope(u: number, isClosed: boolean, softEdges: boolean): number {
  if (!softEdges || isClosed) return 1;
  const fadeZone = 0.14;
  return smoothstep(0, fadeZone, u) * smoothstep(0, fadeZone, 1 - u);
}

/**
 * Computes unit normal vector at sample index i along a polyline.
 */
function getPointNormal(points: { x: number; y: number }[], i: number): { nx: number; ny: number } {
  const prev = points[Math.max(0, i - 1)];
  const next = points[Math.min(points.length - 1, i + 1)];
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return { nx: 0, ny: 1 };
  return { nx: -dy / len, ny: dx / len };
}

/**
 * Parametric symmetric taper factor along a full stroke [0..1].
 */
function symmetricTaper(t: number, taperAmount: number): number {
  if (taperAmount <= 0.01) return 1;
  const arch = Math.pow(Math.sin(Math.PI * clamp01(t)), 0.62);
  return 1 - taperAmount + taperAmount * arch;
}

/**
 * Directional comet/ink profile for moving ribbons:
 * fuller leading head arriving toward the direction of motion + longer trailing tail behind,
 * making forward travel (1st point -> last point) unmistakably clear to the eye.
 */
function directionalRibbonProfile(
  ribbonT: number,
  taperAmount: number,
  isReversed: boolean
): { widthMul: number; alphaMul: number } {
  // pos = 0 at trailing tail, pos = 1 at leading head
  const pos = isReversed ? 1 - clamp01(ribbonT) : clamp01(ribbonT);

  // Leading head rises crisply over the final 18%, trailing tail tapers gracefully over 75%
  const headCap = smoothstep(1.0, 0.8, pos);
  const tailTaper = Math.pow(smoothstep(0.0, 0.72, pos), 0.85);
  const profile = headCap * tailTaper;

  const widthMul = 1 - taperAmount + taperAmount * profile;
  const alphaMul = smoothstep(0.0, 0.45, pos) * smoothstep(1.0, 0.88, pos);
  return { widthMul, alphaMul };
}

/**
 * Maps raw loop phase ∈ [0, 1) through offset, speed, loopBehavior, direction, and repeatDelay.
 * Always moves strictly from 1st point (progress 0) to last point (progress 1) when reverse === false.
 */
function evaluateCycleClock(
  rawPhase: number,
  speed: number,
  reverse: boolean,
  loopBehavior: LoopBehavior,
  repeatDelay: number,
  phaseOffset: number,
  loopIndex = 0
): { active: boolean; progress: number; finishedOnce: boolean; movingBackward: boolean } {
  const offsetNorm = (phaseOffset % 100) / 100;
  const delayNorm = clamp01(repeatDelay / 100) * 0.78;
  const activeSpan = Math.max(0.18, 1 - delayNorm);

  if (loopBehavior === 'once') {
    const totalLinear = loopIndex + rawPhase - offsetNorm;
    if (totalLinear < 0) {
      return {
        active: false,
        progress: reverse ? 1 : 0,
        finishedOnce: false,
        movingBackward: reverse,
      };
    }
    const scaled = totalLinear * speed;
    if (scaled >= activeSpan) {
      return {
        active: false,
        progress: reverse ? 0 : 1,
        finishedOnce: true,
        movingBackward: reverse,
      };
    }
    const p = clamp01(scaled / activeSpan);
    return {
      active: true,
      progress: reverse ? 1 - p : p,
      finishedOnce: false,
      movingBackward: reverse,
    };
  }

  const shifted = ((rawPhase - offsetNorm) % 1 + 1) % 1;
  const cyclePos = (shifted * speed) % 1;

  if (cyclePos >= activeSpan) {
    return {
      active: false,
      progress: reverse ? 0 : 1,
      finishedOnce: false,
      movingBackward: reverse,
    };
  }

  let p = clamp01(cyclePos / activeSpan);
  let movingBackward = reverse;
  if (loopBehavior === 'pingpong') {
    if (p < 0.5) {
      p = p * 2;
    } else {
      p = (1 - p) * 2;
      movingBackward = !reverse;
    }
  }
  if (reverse) {
    p = 1 - p;
  }
  return { active: true, progress: p, finishedOnce: false, movingBackward };
}

/**
 * Renders a smooth variable-width ribbon supporting per-point opacity fading.
 */
function drawRibbonWithSoftAlpha(
  ctx: CanvasRenderingContext2D,
  pts: ComputedPoint[],
  color: string,
  baseOpacity: number,
  capStyle: 'round' | 'taper' | 'square'
): void {
  if (pts.length < 2) return;

  let minA = 1;
  let maxA = 0;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].alpha < minA) minA = pts[i].alpha;
    if (pts[i].alpha > maxA) maxA = pts[i].alpha;
  }
  if (maxA <= 0.005) return;

  const leftSide: { x: number; y: number }[] = [];
  const rightSide: { x: number; y: number }[] = [];

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const { nx, ny } = getPointNormal(pts, i);
    const halfW = Math.max(0.22, p.width * 0.5);
    leftSide.push({ x: p.x + nx * halfW, y: p.y + ny * halfW });
    rightSide.push({ x: p.x - nx * halfW, y: p.y - ny * halfW });
  }

  ctx.save();
  ctx.fillStyle = color;

  if (maxA - minA < 0.04) {
    ctx.globalAlpha = baseOpacity * maxA;
    ctx.beginPath();
    ctx.moveTo(leftSide[0].x, leftSide[0].y);
    for (let i = 1; i < leftSide.length; i++) {
      ctx.lineTo(leftSide[i].x, leftSide[i].y);
    }
    for (let i = rightSide.length - 1; i >= 0; i--) {
      ctx.lineTo(rightSide[i].x, rightSide[i].y);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    for (let i = 0; i < pts.length - 1; i++) {
      const segAlpha = (pts[i].alpha + pts[i + 1].alpha) * 0.5;
      if (segAlpha <= 0.008) continue;
      ctx.globalAlpha = baseOpacity * segAlpha;
      ctx.beginPath();
      ctx.moveTo(leftSide[i].x, leftSide[i].y);
      ctx.lineTo(leftSide[i + 1].x, leftSide[i + 1].y);
      ctx.lineTo(rightSide[i + 1].x, rightSide[i + 1].y);
      ctx.lineTo(rightSide[i].x, rightSide[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (capStyle === 'round') {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first.width > 1 && first.alpha > 0.02) {
      ctx.globalAlpha = baseOpacity * first.alpha;
      ctx.beginPath();
      ctx.arc(first.x, first.y, first.width * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (last.width > 1 && last.alpha > 0.02) {
      ctx.globalAlpha = baseOpacity * last.alpha;
      ctx.beginPath();
      ctx.arc(last.x, last.y, last.width * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Realistic multi-bristle ink/gouache brush (`brush`).
 */
function drawBristleBrushShape(
  ctx: CanvasRenderingContext2D,
  pts: ComputedPoint[],
  color: string,
  baseOpacity: number,
  textureNorm: number,
  seed: number
): void {
  if (pts.length < 2) return;

  // Soft translucent ink core for rich continuity
  const corePts = pts.map((p) => ({
    ...p,
    width: p.width * (0.85 - textureNorm * 0.25),
    alpha: p.alpha * (0.62 - textureNorm * 0.22),
  }));
  drawRibbonWithSoftAlpha(ctx, corePts, color, baseOpacity, 'taper');

  // Parallel organic bristles following stroke normals
  const bristleCount = 5 + Math.round(textureNorm * 4);
  const spreadFactor = 0.34 + textureNorm * 0.24;

  for (let b = 0; b < bristleCount; b++) {
    const normPos = bristleCount > 1 ? (b / (bristleCount - 1)) * 2 - 1 : 0; // -1..1
    const bristleSeed = seed + b * 37.3;
    const widthFactor = 0.16 + Math.abs(hashSigned(bristleSeed * 1.7)) * 0.16;
    const opacityFactor = 0.45 + Math.abs(hashSigned(bristleSeed * 2.9)) * 0.55;
    const offsetJitter = hashSigned(bristleSeed * 4.1) * 0.12;

    const strand: ComputedPoint[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const { nx, ny } = getPointNormal(pts, i);
      const dryBreak = smoothNoise1D(p.dist * 0.035, bristleSeed);
      // Outer bristles subtly break into dry-brush streaks when texture is high
      const edgeDryness = Math.abs(normPos) * textureNorm;
      const dryAlpha = dryBreak < -0.35 + edgeDryness * 0.45 ? 0.12 : 1;
      const lateral = (normPos + offsetJitter + dryBreak * 0.08) * p.width * spreadFactor;

      strand.push({
        x: p.x + nx * lateral,
        y: p.y + ny * lateral,
        width: Math.max(0.6, p.width * widthFactor),
        alpha: p.alpha * opacityFactor * dryAlpha,
        dist: p.dist,
      });
    }

    drawRibbonWithSoftAlpha(ctx, strand, color, baseOpacity, 'taper');
  }
}

/**
 * Realistic graphite pencil (`pencil`) with fine dark core + paper-tooth micro-grain.
 */
function drawPencilShape(
  ctx: CanvasRenderingContext2D,
  pts: ComputedPoint[],
  color: string,
  baseOpacity: number,
  textureNorm: number,
  seed: number
): void {
  if (pts.length < 2) return;

  // Fine crisp graphite core
  const corePts = pts.map((p, i) => {
    const grain = smoothNoise1D(p.dist * 0.22, seed + i * 0.01);
    return {
      ...p,
      width: Math.max(0.7, p.width * (0.48 + grain * 0.1)),
      alpha: p.alpha * (0.65 - textureNorm * 0.18 + Math.abs(grain) * 0.25),
    };
  });
  drawRibbonWithSoftAlpha(ctx, corePts, color, baseOpacity, 'round');

  // Paper tooth speckles along the stroke
  ctx.save();
  ctx.fillStyle = color;
  const grainsPerSample = 2 + Math.round(textureNorm * 4);

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.alpha <= 0.01 || p.width <= 0.4) continue;
    const { nx, ny } = getPointNormal(pts, i);
    const idx = Math.floor(p.dist * 0.85);
    const radius = p.width * (0.42 + textureNorm * 0.2);

    for (let g = 0; g < grainsPerSample; g++) {
      const h1 = hashSigned(idx * 9.7 + g * 23.3 + seed * 0.19);
      const h2 = hashSigned(idx * 13.1 + g * 37.7 + seed * 0.31);
      const h3 = Math.abs(hashSigned(idx * 5.9 + g * 17.3 + seed * 0.11));
      if (h3 < 0.25) continue;

      const gx = p.x + nx * h1 * radius + h2 * radius * 0.25;
      const gy = p.y + ny * h1 * radius - h2 * radius * 0.25;
      const dab = Math.max(0.55, p.width * (0.07 + h3 * 0.1));

      ctx.globalAlpha = baseOpacity * p.alpha * (0.28 + h3 * 0.55);
      ctx.fillRect(gx - dab * 0.5, gy - dab * 0.5, dab, dab);
    }
  }
  ctx.restore();
}

/**
 * Realistic dry pastel / charcoal (`chalk`) with rich toothy paper coverage.
 */
function drawChalkShape(
  ctx: CanvasRenderingContext2D,
  pts: ComputedPoint[],
  color: string,
  baseOpacity: number,
  textureNorm: number,
  seed: number
): void {
  if (pts.length < 2) return;

  ctx.save();
  ctx.fillStyle = color;
  const dabs = 4 + Math.round(textureNorm * 4);

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.alpha <= 0.01 || p.width <= 0.4) continue;
    const { nx, ny } = getPointNormal(pts, i);
    const grainIndex = Math.floor(p.dist * 0.55);
    const radius = p.width * (0.48 + textureNorm * 0.16);

    for (let g = 0; g < dabs; g++) {
      const h1 = hashSigned(grainIndex * 7.3 + g * 19.1 + seed * 0.13);
      const h2 = hashSigned(grainIndex * 11.7 + g * 31.4 + seed * 0.29);
      const h3 = Math.abs(hashSigned(grainIndex * 5.1 + g * 13.7 + seed * 0.07));
      if (h3 < 0.14 + textureNorm * 0.12) continue;

      const gx = p.x + nx * h1 * radius + h2 * radius * 0.38;
      const gy = p.y + ny * h1 * radius - h2 * radius * 0.38;
      const dabSize = Math.max(0.9, p.width * (0.1 + h3 * 0.18));

      ctx.globalAlpha = baseOpacity * p.alpha * (0.3 + h3 * 0.58);
      ctx.beginPath();
      ctx.arc(gx, gy, dabSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Realistic translucent watercolor wash (`watercolor`) with soft wet-edge pigment blooms.
 */
function drawWatercolorShape(
  ctx: CanvasRenderingContext2D,
  pts: ComputedPoint[],
  color: string,
  baseOpacity: number,
  textureNorm: number,
  seed: number
): void {
  if (pts.length < 2) return;

  // 3 stacked organic slightly-wobbled translucent wash layers
  for (let layer = 0; layer < 3; layer++) {
    const scaleW = layer === 0 ? 1.18 : layer === 1 ? 0.96 : 0.72;
    const layerAlpha = layer === 0 ? 0.22 : layer === 1 ? 0.32 : 0.28;
    const wobbleAmp = (0.08 + textureNorm * 0.16) * (layer + 1) * 0.45;

    const washPts: ComputedPoint[] = pts.map((p, i) => {
      const { nx, ny } = getPointNormal(pts, i);
      const n = smoothNoise1D(p.dist * 0.028, seed + layer * 43.1);
      const wJitter = 1 + n * wobbleAmp;
      return {
        x: p.x + nx * n * p.width * wobbleAmp * 0.5,
        y: p.y + ny * n * p.width * wobbleAmp * 0.5,
        width: Math.max(0.8, p.width * scaleW * wJitter),
        alpha: p.alpha * layerAlpha,
        dist: p.dist,
      };
    });

    drawRibbonWithSoftAlpha(ctx, washPts, color, baseOpacity, 'round');
  }

  // Subtle darker wet-edge pigment rims along outer borders
  if (textureNorm > 0.15) {
    const leftRim: ComputedPoint[] = [];
    const rightRim: ComputedPoint[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const { nx, ny } = getPointNormal(pts, i);
      const n = smoothNoise1D(p.dist * 0.032, seed + 91.7);
      const edgeOffset = p.width * (0.52 + n * 0.06);
      const rimW = Math.max(0.9, p.width * 0.13);
      const rimA = p.alpha * (0.18 + textureNorm * 0.22);
      leftRim.push({ x: p.x + nx * edgeOffset, y: p.y + ny * edgeOffset, width: rimW, alpha: rimA, dist: p.dist });
      rightRim.push({ x: p.x - nx * edgeOffset, y: p.y - ny * edgeOffset, width: rimW, alpha: rimA, dist: p.dist });
    }
    drawRibbonWithSoftAlpha(ctx, leftRim, color, baseOpacity, 'round');
    drawRibbonWithSoftAlpha(ctx, rightRim, color, baseOpacity, 'round');
  }
}

/**
 * Chisel-tip felt marker (`marker`) with fixed calligraphic nib angle (~38°).
 */
function drawMarkerShape(
  ctx: CanvasRenderingContext2D,
  pts: ComputedPoint[],
  color: string,
  baseOpacity: number
): void {
  if (pts.length < 2) return;

  const nibAngle = (38 * Math.PI) / 180;
  const nibX = Math.cos(nibAngle);
  const nibY = Math.sin(nibAngle);

  ctx.save();
  ctx.fillStyle = color;

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segAlpha = (a.alpha + b.alpha) * 0.5;
    if (segAlpha <= 0.008) continue;

    const ha = Math.max(0.4, a.width * 0.52);
    const hb = Math.max(0.4, b.width * 0.52);

    ctx.globalAlpha = baseOpacity * segAlpha;
    ctx.beginPath();
    ctx.moveTo(a.x - nibX * ha, a.y - nibY * ha);
    ctx.lineTo(a.x + nibX * ha, a.y + nibY * ha);
    ctx.lineTo(b.x + nibX * hb, b.y + nibY * hb);
    ctx.lineTo(b.x - nibX * hb, b.y - nibY * hb);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Deterministic airbrush / ink spray (`spray`) with soft Gaussian-like core distribution.
 */
function drawSprayShape(
  ctx: CanvasRenderingContext2D,
  pts: ComputedPoint[],
  color: string,
  baseOpacity: number,
  textureNorm: number,
  seed: number
): void {
  if (pts.length < 2) return;

  ctx.save();
  ctx.fillStyle = color;
  const particlesPerPoint = 5 + Math.round(textureNorm * 7);

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.alpha <= 0.01 || p.width <= 0.4) continue;
    const idx = Math.floor(p.dist * 0.6);
    const maxRadius = p.width * (0.65 + textureNorm * 0.65);

    for (let k = 0; k < particlesPerPoint; k++) {
      const a = hashSigned(idx * 13.7 + k * 29.1 + seed * 0.17) * Math.PI;
      // Multiply two randoms to concentrate particles gently toward the center
      const r1 = Math.abs(hashSigned(idx * 7.1 + k * 41.3 + seed * 0.23));
      const r2 = Math.abs(hashSigned(idx * 19.3 + k * 11.7 + seed * 0.37));
      const distR = r1 * r2 * maxRadius;
      const size = Math.max(0.65, p.width * (0.04 + (1 - r1) * 0.09));

      const px = p.x + Math.cos(a) * distR;
      const py = p.y + Math.sin(a) * distR;

      ctx.globalAlpha = baseOpacity * p.alpha * (0.2 + (1 - r1 * r2) * 0.6);
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Renders animated dots / pearls spaced cleanly along the path.
 */
function drawDotsShape(
  ctx: CanvasRenderingContext2D,
  pts: ComputedPoint[],
  color: string,
  baseOpacity: number,
  baseWidth: number,
  textureNorm: number
): void {
  if (pts.length < 2) return;
  const spacing = Math.max(7, baseWidth * (1.1 + textureNorm * 0.9));

  ctx.save();
  ctx.fillStyle = color;

  let nextDist = Math.ceil(pts[0].dist / spacing) * spacing;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segLen = b.dist - a.dist;
    if (segLen <= 0.0001) continue;

    while (nextDist <= b.dist) {
      const frac = clamp01((nextDist - a.dist) / segLen);
      const x = a.x + (b.x - a.x) * frac;
      const y = a.y + (b.y - a.y) * frac;
      const w = a.width + (b.width - a.width) * frac;
      const alpha = a.alpha + (b.alpha - a.alpha) * frac;

      if (w > 0.6 && alpha > 0.02) {
        ctx.globalAlpha = baseOpacity * alpha;
        ctx.beginPath();
        ctx.arc(x, y, w * 0.46, 0, Math.PI * 2);
        ctx.fill();
      }
      nextDist += spacing;
    }
  }

  ctx.restore();
}

/**
 * Renders parallel twin lines (`double`) with separation tuned by `textureNorm`.
 */
function drawDoubleShape(
  ctx: CanvasRenderingContext2D,
  pts: ComputedPoint[],
  color: string,
  baseOpacity: number,
  textureNorm: number
): void {
  if (pts.length < 2) return;
  const upper: ComputedPoint[] = [];
  const lower: ComputedPoint[] = [];
  const sepFactor = 0.28 + textureNorm * 0.35;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const { nx, ny } = getPointNormal(pts, i);
    const sep = Math.max(2, p.width * sepFactor);
    const lineW = Math.max(1.2, p.width * 0.26);
    upper.push({ x: p.x + nx * sep, y: p.y + ny * sep, width: lineW, alpha: p.alpha, dist: p.dist });
    lower.push({ x: p.x - nx * sep, y: p.y - ny * sep, width: lineW, alpha: p.alpha, dist: p.dist });
  }

  drawRibbonWithSoftAlpha(ctx, upper, color, baseOpacity, 'round');
  drawRibbonWithSoftAlpha(ctx, lower, color, baseOpacity, 'round');
}

/**
 * Unified brush shape renderer dispatching any computed stroke geometry.
 */
function renderShapeGeometry(
  ctx: CanvasRenderingContext2D,
  pts: ComputedPoint[],
  color: string,
  baseOpacity: number,
  baseWidth: number,
  shape: StrokeShape,
  textureNorm: number,
  seed: number
): void {
  if (pts.length < 2) return;
  switch (shape) {
    case 'brush':
      drawBristleBrushShape(ctx, pts, color, baseOpacity, textureNorm, seed);
      break;
    case 'pencil':
      drawPencilShape(ctx, pts, color, baseOpacity, textureNorm, seed);
      break;
    case 'chalk':
      drawChalkShape(ctx, pts, color, baseOpacity, textureNorm, seed);
      break;
    case 'watercolor':
      drawWatercolorShape(ctx, pts, color, baseOpacity, textureNorm, seed);
      break;
    case 'marker':
      drawMarkerShape(ctx, pts, color, baseOpacity);
      break;
    case 'spray':
      drawSprayShape(ctx, pts, color, baseOpacity, textureNorm, seed);
      break;
    case 'dots':
      drawDotsShape(ctx, pts, color, baseOpacity, baseWidth, textureNorm);
      break;
    case 'double':
      drawDoubleShape(ctx, pts, color, baseOpacity, textureNorm);
      break;
    case 'round':
      drawRibbonWithSoftAlpha(ctx, pts, color, baseOpacity, 'round');
      break;
    case 'taper':
    default:
      drawRibbonWithSoftAlpha(ctx, pts, color, baseOpacity, 'taper');
      break;
  }
}

/**
 * Simple uniform polyline renderer (used for live draft stroke & selection halo).
 */
function drawSimplePolyline(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  color: string,
  width: number,
  opacity: number
): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) * 0.5;
    const midY = (pts[i].y + pts[i + 1].y) * 0.5;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Evaluates a point along a stroke at normalized distance u ∈ [0, 1].
 */
function sampleStrokeAt(stroke: AnimatedStroke, u: number): StrokePoint {
  const clamped = clamp01(u);
  const targetDist = clamped * stroke.totalLength;
  const { arcLengths, points } = stroke;

  let low = 0;
  let high = arcLengths.length - 1;
  while (low < high - 1) {
    const mid = (low + high) >> 1;
    if (arcLengths[mid] <= targetDist) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const d0 = arcLengths[low];
  const d1 = arcLengths[high];
  const span = d1 - d0;
  const t = span > 0.0001 ? (targetDist - d0) / span : 0;
  const a = points[low];
  const b = points[high];

  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    pressure: a.pressure + (b.pressure - a.pressure) * t,
    time: a.time + (b.time - a.time) * t,
  };
}

/**
 * Extracts a smooth sub-segment of a stroke between normalized arc positions [uStart, uEnd].
 */
function extractSegment(
  stroke: AnimatedStroke,
  uStart: number,
  uEnd: number,
  evalPoint: (u: number, localT: number, p: StrokePoint) => { width: number; alpha: number }
): ComputedPoint[] {
  const start = clamp01(uStart);
  const end = clamp01(uEnd);
  if (end - start < 0.002) return [];

  const result: ComputedPoint[] = [];
  const startDist = start * stroke.totalLength;
  const endDist = end * stroke.totalLength;
  const span = end - start;

  const pStart = sampleStrokeAt(stroke, start);
  const sEval = evalPoint(start, 0, pStart);
  result.push({
    x: pStart.x,
    y: pStart.y,
    width: sEval.width,
    alpha: sEval.alpha,
    dist: startDist,
  });

  for (let i = 0; i < stroke.points.length; i++) {
    const d = stroke.arcLengths[i];
    if (d > startDist && d < endDist) {
      const u = d / stroke.totalLength;
      const localT = (u - start) / span;
      const p = stroke.points[i];
      const ev = evalPoint(u, localT, p);
      result.push({
        x: p.x,
        y: p.y,
        width: ev.width,
        alpha: ev.alpha,
        dist: d,
      });
    }
  }

  const pEnd = sampleStrokeAt(stroke, end);
  const eEval = evalPoint(end, 1, pEnd);
  result.push({
    x: pEnd.x,
    y: pEnd.y,
    width: eEval.width,
    alpha: eEval.alpha,
    dist: endDist,
  });

  return result;
}

/**
 * Renders a single AnimatedStroke at normalized loop phase ∈ [0, 1).
 */
function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: AnimatedStroke,
  phase: number,
  isSelected: boolean,
  loopIndex: number
): void {
  const { params, points, totalLength, isClosed } = stroke;
  if (points.length < 2) return;

  const baseW = params.width;
  const ampNorm = clamp01(params.amplitude / 100);
  const lenNorm = clamp01(params.length / 100);
  const taperNorm = clamp01((params.taper ?? 70) / 100);
  const textureNorm = clamp01((params.texture ?? 55) / 100);

  if (isSelected) {
    drawSimplePolyline(ctx, points, '#1D4ED8', baseW + 10, 0.22);
  }

  if (params.mode === 'static') {
    const staticPts: ComputedPoint[] = points.map((p, i) => {
      const u = stroke.arcLengths[i] / totalLength;
      const pressureScale = 0.72 + p.pressure * 0.55;
      const edgeFade = openEdgeEnvelope(u, isClosed, params.softEdges);
      return {
        x: p.x,
        y: p.y,
        width: baseW * pressureScale * symmetricTaper(u, taperNorm),
        alpha: edgeFade,
        dist: stroke.arcLengths[i],
      };
    });
    renderShapeGeometry(
      ctx,
      staticPts,
      params.color,
      params.opacity,
      baseW,
      params.shape,
      textureNorm,
      stroke.seed
    );
    return;
  }

  const clock = evaluateCycleClock(
    phase,
    params.speed,
    params.reverse,
    params.loopBehavior,
    params.repeatDelay,
    params.phaseOffset,
    loopIndex
  );

  if (isSelected && (!clock.active || params.mode === 'flow' || params.mode === 'draw')) {
    drawSimplePolyline(ctx, points, params.color, Math.max(1.5, baseW * 0.22), 0.16);
  }

  switch (params.mode) {
    case 'flow': {
      if (!clock.active) return;

      const count = Math.max(1, Math.round(params.frequency));
      const duty = 0.12 + lenNorm * 0.74;

      if (isClosed && params.loopBehavior === 'loop' && params.repeatDelay === 0) {
        // True closed loop: ribbons glide smoothly around the joined contour in exact drawn order
        const slotSpan = 1 / count;
        const ribbonLen = slotSpan * duty;
        const headShift = clock.progress;

        for (let k = 0; k < count; k++) {
          const rawStart = (k * slotSpan + headShift) % 1;
          const rawEnd = rawStart + ribbonLen;

          const evalClosed = (globalT: number, p: StrokePoint) => {
            const pressureScale = 0.72 + p.pressure * 0.55;
            const { widthMul, alphaMul } = directionalRibbonProfile(
              globalT,
              taperNorm,
              clock.movingBackward
            );
            return {
              width: baseW * pressureScale * widthMul,
              alpha: params.softEdges ? alphaMul : 1,
            };
          };

          const drawPart = (pStart: number, pEnd: number, tOffset: number, tScale: number) => {
            const u0 = mapProgressToArcU(stroke, pStart, params.followDrawingSpeed);
            const u1 = mapProgressToArcU(stroke, pEnd, params.followDrawingSpeed);
            const seg = extractSegment(stroke, u0, u1, (_u, lt, pt) =>
              evalClosed(tOffset + lt * tScale, pt)
            );
            renderShapeGeometry(
              ctx,
              seg,
              params.color,
              params.opacity,
              baseW,
              params.shape,
              textureNorm,
              stroke.seed
            );
          };

          if (rawEnd <= 1) {
            drawPart(rawStart, rawEnd, 0, 1);
          } else {
            const part1 = 1 - rawStart;
            const part2 = rawEnd - 1;
            drawPart(rawStart, 1, 0, part1 / ribbonLen);
            drawPart(0, part2, part1 / ribbonLen, part2 / ribbonLen);
          }
        }
      } else {
        // Open path: strictly travels from 1st point (u=0) -> last point (u=1) with directional head/tail
        // and silky entry/exit softening so nothing ever stops abruptly.
        const ribbonSpan = (0.15 + lenNorm * 0.65) / Math.max(1, Math.sqrt(count));
        const travelRange = 1 + ribbonSpan;
        const spacing = travelRange / count;

        for (let k = 0; k < count; k++) {
          let rawStart: number;
          if (params.loopBehavior === 'loop') {
            // Subtract k * spacing so ribbon #0 leads and ribbon #1 follows behind it!
            const rawPos = ((clock.progress * travelRange - k * spacing) % travelRange + travelRange) % travelRange;
            rawStart = rawPos - ribbonSpan;
          } else {
            const stagger = count > 1 ? (k / count) * (1 - ribbonSpan * 0.45) : 0;
            rawStart = clock.progress * travelRange - ribbonSpan - stagger;
          }
          const rawEnd = rawStart + ribbonSpan;

          const visPStart = Math.max(0, rawStart);
          const visPEnd = Math.min(1, rawEnd);
          if (visPEnd - visPStart < 0.004) continue;

          const uStart = mapProgressToArcU(stroke, visPStart, params.followDrawingSpeed);
          const uEnd = mapProgressToArcU(stroke, visPEnd, params.followDrawingSpeed);

          const seg = extractSegment(stroke, uStart, uEnd, (u, localT, pt) => {
            const segP = visPStart + localT * (visPEnd - visPStart);
            const ribbonT = clamp01((segP - rawStart) / ribbonSpan);
            const pressureScale = 0.72 + pt.pressure * 0.55;

            const edgeFade = openEdgeEnvelope(u, isClosed, params.softEdges);
            const { widthMul, alphaMul } = directionalRibbonProfile(
              ribbonT,
              taperNorm,
              clock.movingBackward
            );
            const softEndWidth = params.softEdges ? 0.2 + 0.8 * edgeFade : 1;

            return {
              width: baseW * pressureScale * widthMul * softEndWidth,
              alpha: edgeFade * (params.softEdges ? alphaMul : 1),
            };
          });

          renderShapeGeometry(
            ctx,
            seg,
            params.color,
            params.opacity,
            baseW,
            params.shape,
            textureNorm,
            stroke.seed
          );
        }
      }
      break;
    }

    case 'draw': {
      if (!clock.active) {
        if (clock.finishedOnce && lenNorm >= 0.85) {
          const fullPts: ComputedPoint[] = points.map((p, i) => {
            const u = stroke.arcLengths[i] / totalLength;
            const pressureScale = 0.72 + p.pressure * 0.55;
            return {
              x: p.x,
              y: p.y,
              width: baseW * pressureScale * symmetricTaper(u, taperNorm),
              alpha: openEdgeEnvelope(u, isClosed, params.softEdges),
              dist: stroke.arcLengths[i],
            };
          });
          renderShapeGeometry(
            ctx,
            fullPts,
            params.color,
            params.opacity,
            baseW,
            params.shape,
            textureNorm,
            stroke.seed
          );
        }
        return;
      }

      const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
      const drawEnd = 0.42;
      const holdEnd = 0.42 + lenNorm * 0.22;

      let pStart = 0;
      let pEnd = 1;
      let fadeAlpha = 1;

      if (params.loopBehavior === 'pingpong') {
        pStart = 0;
        pEnd = ease(clock.progress);
      } else if (clock.progress < drawEnd) {
        pStart = 0;
        pEnd = ease(clock.progress / drawEnd);
      } else if (clock.progress < holdEnd) {
        pStart = 0;
        pEnd = 1;
      } else {
        const retractT = (clock.progress - holdEnd) / Math.max(0.05, 1 - holdEnd);
        pStart = ease(retractT);
        pEnd = 1;
        if (params.softEdges) {
          fadeAlpha = smoothstep(0, 0.25, 1 - retractT);
        }
      }

      if (pEnd - pStart > 0.004) {
        const uStart = mapProgressToArcU(stroke, pStart, params.followDrawingSpeed);
        const uEnd = mapProgressToArcU(stroke, pEnd, params.followDrawingSpeed);

        const seg = extractSegment(stroke, uStart, uEnd, (u, lt, pt) => {
          const pressureScale = 0.72 + pt.pressure * 0.55;
          const edgeFade = openEdgeEnvelope(u, isClosed, params.softEdges);
          const { widthMul, alphaMul } = directionalRibbonProfile(
            lt,
            taperNorm,
            clock.movingBackward
          );
          return {
            width: baseW * pressureScale * widthMul,
            alpha: edgeFade * (params.softEdges ? alphaMul : 1) * fadeAlpha,
          };
        });
        renderShapeGeometry(
          ctx,
          seg,
          params.color,
          params.opacity,
          baseW,
          params.shape,
          textureNorm,
          stroke.seed
        );
      }
      break;
    }

    case 'boil': {
      const celSteps = Math.max(3, Math.round(3 + params.frequency * 1.5));
      const frameIdx = clock.active ? Math.floor(clock.progress * celSteps) % celSteps : 0;
      const maxDisp = 1.2 + ampNorm * 14;
      const spatialFreq = 0.018 + params.frequency * 0.007;

      const boiled: ComputedPoint[] = points.map((p, i) => {
        const u = stroke.arcLengths[i] / totalLength;
        const { nx, ny } = getPointNormal(points, i);
        const s = stroke.arcLengths[i] * spatialFreq;
        const n1 = smoothNoise1D(s, stroke.seed + frameIdx * 13.7);
        const n2 = smoothNoise1D(s * 1.3 + 41.2, stroke.seed + frameIdx * 29.3);
        const pressureScale = 0.72 + p.pressure * 0.55;
        const edgeFade = openEdgeEnvelope(u, isClosed, params.softEdges);
        return {
          x: p.x + nx * n1 * maxDisp + n2 * maxDisp * 0.25,
          y: p.y + ny * n1 * maxDisp - n2 * maxDisp * 0.25,
          width: baseW * pressureScale * symmetricTaper(u, taperNorm),
          alpha: edgeFade,
          dist: stroke.arcLengths[i],
        };
      });

      renderShapeGeometry(
        ctx,
        boiled,
        params.color,
        params.opacity,
        baseW,
        params.shape,
        textureNorm,
        stroke.seed
      );
      break;
    }

    case 'wave': {
      const maxDisp = 2 + ampNorm * 28;
      const waveCyclesAlongPath = Math.max(1, params.frequency * 0.8 * Math.max(1, totalLength / 260));
      const phaseRad = (clock.active ? clock.progress : 0) * Math.PI * 2;
      const activeAmp = clock.active ? maxDisp : 0;

      const waved: ComputedPoint[] = points.map((p, i) => {
        const u = stroke.arcLengths[i] / totalLength;
        const coord = params.followDrawingSpeed ? p.time : u;
        const { nx, ny } = getPointNormal(points, i);
        const endEase = isClosed ? 1 : Math.sin(Math.PI * u) * 0.72 + 0.28;
        const offset = Math.sin(coord * waveCyclesAlongPath * Math.PI * 2 - phaseRad) * activeAmp * endEase;
        const pressureScale = 0.72 + p.pressure * 0.55;
        const edgeFade = openEdgeEnvelope(u, isClosed, params.softEdges);
        return {
          x: p.x + nx * offset,
          y: p.y + ny * offset,
          width: baseW * pressureScale * symmetricTaper(u, taperNorm),
          alpha: edgeFade,
          dist: stroke.arcLengths[i],
        };
      });

      renderShapeGeometry(
        ctx,
        waved,
        params.color,
        params.opacity,
        baseW,
        params.shape,
        textureNorm,
        stroke.seed
      );
      break;
    }

    case 'pulse': {
      const phaseRad = (clock.active ? clock.progress : 0) * Math.PI * 2;
      const pulseDepth = clock.active ? 0.2 + ampNorm * 0.75 : 0;
      const freq = Math.max(1, params.frequency * 0.7);

      const pulsed: ComputedPoint[] = points.map((p, i) => {
        const u = stroke.arcLengths[i] / totalLength;
        const coord = params.followDrawingSpeed ? p.time : u;
        const wave = 0.5 + 0.5 * Math.sin(coord * freq * Math.PI * 2 - phaseRad);
        const multiplier = 1 - pulseDepth * 0.55 + wave * pulseDepth * 1.15;
        const pressureScale = 0.72 + p.pressure * 0.55;
        const edgeFade = openEdgeEnvelope(u, isClosed, params.softEdges);
        return {
          x: p.x,
          y: p.y,
          width: Math.max(0.8, baseW * pressureScale * multiplier * symmetricTaper(u, taperNorm)),
          alpha: edgeFade,
          dist: stroke.arcLengths[i],
        };
      });

      renderShapeGeometry(
        ctx,
        pulsed,
        params.color,
        params.opacity,
        baseW,
        params.shape,
        textureNorm,
        stroke.seed
      );
      break;
    }
  }
}

/**
 * Draws the imported background image positioned in world coordinates.
 */
function renderBackgroundImage(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  bgImage: BackgroundImage,
  imgEl: HTMLImageElement
): void {
  const worldWidth = (canvasWidth / canvasHeight) * WORLD_REF_HEIGHT;
  const worldHeight = WORLD_REF_HEIGHT;

  const imgRatio = bgImage.naturalWidth / bgImage.naturalHeight;
  const canvasRatio = worldWidth / worldHeight;

  let drawW: number;
  let drawH: number;

  if (bgImage.fit === 'cover') {
    if (imgRatio > canvasRatio) {
      drawH = worldHeight;
      drawW = drawH * imgRatio;
    } else {
      drawW = worldWidth;
      drawH = drawW / imgRatio;
    }
  } else {
    if (imgRatio > canvasRatio) {
      drawW = worldWidth;
      drawH = drawW / imgRatio;
    } else {
      drawH = worldHeight;
      drawW = drawH * imgRatio;
    }
  }

  drawW *= bgImage.scale;
  drawH *= bgImage.scale;

  ctx.save();
  ctx.globalAlpha = bgImage.opacity;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    imgEl,
    bgImage.offsetX - drawW * 0.5,
    bgImage.offsetY - drawH * 0.5,
    drawW,
    drawH
  );
  ctx.restore();
}

/**
 * Deterministic full-scene renderer used by both the live interactive stage
 * and the offscreen GIF/Video exporter.
 */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: SceneRenderState,
  phase: number,
  options: RenderOptions = {}
): void {
  ctx.save();

  ctx.fillStyle = state.canvasConfig.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  const scale = height / WORLD_REF_HEIGHT;
  ctx.translate(width * 0.5, height * 0.5);
  ctx.scale(scale, scale);

  if (state.backgroundImage && state.loadedImageElement && state.loadedImageElement.complete) {
    renderBackgroundImage(ctx, width, height, state.backgroundImage, state.loadedImageElement);
  }

  const loopIndex = options.loopIndex ?? 0;
  for (let i = 0; i < state.strokes.length; i++) {
    const stroke = state.strokes[i];
    const isSelected = !options.isExport && state.selectedStrokeId === stroke.id;
    renderStroke(ctx, stroke, phase, isSelected, loopIndex);
  }

  if (!options.isExport && state.activeDraftPoints && state.activeDraftPoints.length > 1) {
    drawSimplePolyline(
      ctx,
      state.activeDraftPoints,
      state.activeDraftColor ?? '#141416',
      state.activeDraftWidth ?? 10,
      Math.min(1, (state.activeDraftOpacity ?? 1) * 0.85)
    );
  }

  ctx.restore();
}
