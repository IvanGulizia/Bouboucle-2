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
  /** Arc distance in world units (used for dots/chalk spacing) */
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
  const startFade = smoothstep(0, fadeZone, u);
  const endFade = smoothstep(0, fadeZone, 1 - u);
  return startFade * endFade;
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
 * Maps raw loop phase ∈ [0, 1) through offset, speed, loopBehavior, direction, and repeatDelay.
 * Returns { active, progress } where active=false indicates a resting/pause period.
 */
function evaluateCycleClock(
  rawPhase: number,
  speed: number,
  reverse: boolean,
  loopBehavior: LoopBehavior,
  repeatDelay: number,
  phaseOffset: number,
  loopIndex = 0
): { active: boolean; progress: number; finishedOnce: boolean } {
  const offsetNorm = (phaseOffset % 100) / 100;
  const delayNorm = clamp01(repeatDelay / 100) * 0.78;
  const activeSpan = Math.max(0.18, 1 - delayNorm);

  if (loopBehavior === 'once') {
    // Plays once cleanly across the first cycle (taking phaseOffset into account)
    const totalLinear = loopIndex + rawPhase - offsetNorm;
    if (totalLinear < 0) {
      return { active: false, progress: reverse ? 1 : 0, finishedOnce: false };
    }
    const scaled = totalLinear * speed;
    if (scaled >= activeSpan) {
      return { active: false, progress: reverse ? 0 : 1, finishedOnce: true };
    }
    const p = clamp01(scaled / activeSpan);
    return { active: true, progress: reverse ? 1 - p : p, finishedOnce: false };
  }

  // Periodic loop or pingpong
  const shifted = ((rawPhase - offsetNorm) % 1 + 1) % 1;
  const cyclePos = (shifted * speed) % 1;

  if (cyclePos >= activeSpan) {
    return { active: false, progress: reverse ? 0 : 1, finishedOnce: false };
  }

  let p = clamp01(cyclePos / activeSpan);
  if (loopBehavior === 'pingpong') {
    p = p < 0.5 ? p * 2 : (1 - p) * 2;
  }
  if (reverse) {
    p = 1 - p;
  }
  return { active: true, progress: p, finishedOnce: false };
}

/**
 * Smooth taper envelope (0 at ends, 1 in middle).
 */
function taperFactor(t: number, shape: StrokeShape): number {
  if (shape === 'taper') {
    return Math.pow(Math.sin(Math.PI * clamp01(t)), 0.62);
  }
  if (shape === 'double') {
    return 0.25 + 0.75 * Math.pow(Math.sin(Math.PI * clamp01(t)), 0.45);
  }
  return 1;
}

/**
 * Renders a smooth variable-width ribbon supporting per-point opacity fading
 * so open strokes melt gracefully in and out without abrupt cuts.
 */
function drawRibbonWithSoftAlpha(
  ctx: CanvasRenderingContext2D,
  pts: ComputedPoint[],
  color: string,
  baseOpacity: number,
  capStyle: 'round' | 'taper' | 'square'
): void {
  if (pts.length < 2) return;

  // Fast path: uniform alpha across all points
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
    const halfW = Math.max(0.25, p.width * 0.5);
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
    // Draw small overlapping quads with smoothly varying alpha so ends dissolve softly
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

  // Smooth rounded endcaps when shape is round
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
 * Renders animated dots / pearls spaced cleanly along the path.
 */
function drawDotsShape(
  ctx: CanvasRenderingContext2D,
  pts: ComputedPoint[],
  color: string,
  baseOpacity: number,
  baseWidth: number
): void {
  if (pts.length < 2) return;
  const spacing = Math.max(8, baseWidth * 1.45);

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
 * Renders deterministic textured chalk / charcoal dry-brush grain along the path.
 */
function drawChalkShape(
  ctx: CanvasRenderingContext2D,
  pts: ComputedPoint[],
  color: string,
  baseOpacity: number,
  seed: number
): void {
  if (pts.length < 2) return;

  ctx.save();
  ctx.fillStyle = color;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.alpha <= 0.01 || p.width <= 0.4) continue;
    const { nx, ny } = getPointNormal(pts, i);
    const grainIndex = Math.floor(p.dist * 0.55);
    const radius = p.width * 0.55;

    // 4 deterministic micro-bristle dabs per sample
    for (let g = 0; g < 4; g++) {
      const h1 = hashSigned(grainIndex * 7.3 + g * 19.1 + seed * 0.13);
      const h2 = hashSigned(grainIndex * 11.7 + g * 31.4 + seed * 0.29);
      const h3 = Math.abs(hashSigned(grainIndex * 5.1 + g * 13.7 + seed * 0.07));
      if (h3 < 0.18) continue;

      const gx = p.x + nx * h1 * radius + h2 * radius * 0.35;
      const gy = p.y + ny * h1 * radius - h2 * radius * 0.35;
      const dabSize = Math.max(0.9, p.width * (0.12 + h3 * 0.19));

      ctx.globalAlpha = baseOpacity * p.alpha * (0.35 + h3 * 0.55);
      ctx.beginPath();
      ctx.arc(gx, gy, dabSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Renders parallel twin lines (double stroke) along the path normal.
 */
function drawDoubleShape(
  ctx: CanvasRenderingContext2D,
  pts: ComputedPoint[],
  color: string,
  baseOpacity: number
): void {
  if (pts.length < 2) return;
  const upper: ComputedPoint[] = [];
  const lower: ComputedPoint[] = [];

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const { nx, ny } = getPointNormal(pts, i);
    const sep = Math.max(2.2, p.width * 0.42);
    const lineW = Math.max(1.2, p.width * 0.28);
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
  seed: number
): void {
  if (pts.length < 2) return;
  switch (shape) {
    case 'dots':
      drawDotsShape(ctx, pts, color, baseOpacity, baseWidth);
      break;
    case 'chalk':
      drawChalkShape(ctx, pts, color, baseOpacity, seed);
      break;
    case 'double':
      drawDoubleShape(ctx, pts, color, baseOpacity);
      break;
    case 'square':
      drawRibbonWithSoftAlpha(ctx, pts, color, baseOpacity, 'square');
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
 * Extracts a smooth sub-segment of a stroke between normalized arc positions [uStart, uEnd]
 * with per-point width and alpha functions.
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

  // Subtle selection halo drawn underneath the stroke
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
        width: baseW * pressureScale * taperFactor(u, params.shape),
        alpha: edgeFade,
        dist: stroke.arcLengths[i],
      };
    });
    renderShapeGeometry(ctx, staticPts, params.color, params.opacity, baseW, params.shape, stroke.seed);
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

  // Selected ghost path guide so user can always see the stroke even during pause gaps
  if (isSelected && (!clock.active || params.mode === 'flow' || params.mode === 'draw')) {
    drawSimplePolyline(ctx, points, params.color, Math.max(1.5, baseW * 0.22), 0.16);
  }

  switch (params.mode) {
    case 'flow': {
      if (!clock.active) return;

      const count = Math.max(1, Math.round(params.frequency));
      const duty = 0.1 + lenNorm * 0.76;

      if (isClosed && params.loopBehavior === 'loop' && params.repeatDelay === 0) {
        // True closed loop: ribbons wrap seamlessly around the joined contour
        const slotSpan = 1 / count;
        const ribbonLen = slotSpan * duty;
        const headShift = clock.progress;

        for (let k = 0; k < count; k++) {
          const rawStart = (k * slotSpan + headShift) % 1;
          const rawEnd = rawStart + ribbonLen;

          const evalClosed = (globalT: number, p: StrokePoint) => {
            const pressureScale = 0.72 + p.pressure * 0.55;
            const wEnv = taperFactor(globalT, params.shape);
            const softTail = params.softEdges
              ? smoothstep(0, 0.22, globalT) * smoothstep(0, 0.22, 1 - globalT)
              : 1;
            return {
              width: baseW * pressureScale * wEnv,
              alpha: softTail,
            };
          };

          const drawPart = (pStart: number, pEnd: number, tOffset: number, tScale: number) => {
            const u0 = mapProgressToArcU(stroke, pStart, params.followDrawingSpeed);
            const u1 = mapProgressToArcU(stroke, pEnd, params.followDrawingSpeed);
            const seg = extractSegment(stroke, u0, u1, (_u, lt, pt) =>
              evalClosed(tOffset + lt * tScale, pt)
            );
            renderShapeGeometry(ctx, seg, params.color, params.opacity, baseW, params.shape, stroke.seed);
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
        // Open path (never cuts off abruptly!):
        // Each ribbon enters smoothly from u = 0 and exits smoothly past u = 1 with soft tapering/fading.
        const ribbonSpan = (0.14 + lenNorm * 0.65) / Math.max(1, Math.sqrt(count));
        const travelRange = 1 + ribbonSpan; // Sweeps cleanly from -ribbonSpan to 1
        const spacing = travelRange / count;

        for (let k = 0; k < count; k++) {
          let rawStart: number;
          if (params.loopBehavior === 'loop') {
            rawStart = ((clock.progress * travelRange + k * spacing) % travelRange) - ribbonSpan;
          } else {
            // Ping-pong or once: stagger ribbons cleanly inside [0..1]
            const stagger = count > 1 ? (k / count) * (1 - ribbonSpan * 0.5) : 0;
            rawStart = clock.progress * travelRange - ribbonSpan - stagger;
          }
          const rawEnd = rawStart + ribbonSpan;

          const visPStart = Math.max(0, rawStart);
          const visPEnd = Math.min(1, rawEnd);
          if (visPEnd - visPStart < 0.004) continue;

          const uStart = mapProgressToArcU(stroke, visPStart, params.followDrawingSpeed);
          const uEnd = mapProgressToArcU(stroke, visPEnd, params.followDrawingSpeed);

          const seg = extractSegment(stroke, uStart, uEnd, (u, localT, pt) => {
            // Position along the unclipped virtual ribbon (0 = tail, 1 = head)
            const segP = visPStart + localT * (visPEnd - visPStart);
            const ribbonT = clamp01((segP - rawStart) / ribbonSpan);
            const pressureScale = 0.72 + pt.pressure * 0.55;

            // Smooth tip taper + entry/exit edge softening so the stroke NEVER stops harshly
            const edgeFade = openEdgeEnvelope(u, isClosed, params.softEdges);
            const tipEnvelope = params.softEdges
              ? smoothstep(0, 0.25, ribbonT) * smoothstep(0, 0.25, 1 - ribbonT)
              : 1;
            const localCapTaper =
              params.shape === 'taper'
                ? Math.pow(Math.sin(Math.PI * ribbonT), 0.55) * Math.pow(Math.sin(Math.PI * localT), 0.35)
                : taperFactor(ribbonT, params.shape);

            return {
              width: baseW * pressureScale * localCapTaper * (params.softEdges ? 0.25 + 0.75 * edgeFade : 1),
              alpha: edgeFade * tipEnvelope,
            };
          });

          renderShapeGeometry(ctx, seg, params.color, params.opacity, baseW, params.shape, stroke.seed);
        }
      }
      break;
    }

    case 'draw': {
      // If 'once' completed, keep the drawn stroke gracefully visible when length >= 90%, else clean finish
      if (!clock.active) {
        if (clock.finishedOnce && lenNorm >= 0.85) {
          const fullPts: ComputedPoint[] = points.map((p, i) => {
            const u = stroke.arcLengths[i] / totalLength;
            const pressureScale = 0.72 + p.pressure * 0.55;
            return {
              x: p.x,
              y: p.y,
              width: baseW * pressureScale * taperFactor(u, params.shape),
              alpha: openEdgeEnvelope(u, isClosed, params.softEdges),
              dist: stroke.arcLengths[i],
            };
          });
          renderShapeGeometry(ctx, fullPts, params.color, params.opacity, baseW, params.shape, stroke.seed);
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
          const tipFade = params.softEdges
            ? smoothstep(0, 0.16, lt) * smoothstep(0, 0.16, 1 - lt)
            : 1;
          return {
            width: baseW * pressureScale * taperFactor(lt, params.shape),
            alpha: edgeFade * tipFade * fadeAlpha,
          };
        });
        renderShapeGeometry(ctx, seg, params.color, params.opacity, baseW, params.shape, stroke.seed);
      }
      break;
    }

    case 'boil': {
      // Hand-drawn cel-animation boil (freezes gently during repeatDelay pause)
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
          width: baseW * pressureScale * taperFactor(u, params.shape),
          alpha: edgeFade,
          dist: stroke.arcLengths[i],
        };
      });

      renderShapeGeometry(ctx, boiled, params.color, params.opacity, baseW, params.shape, stroke.seed);
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
          width: baseW * pressureScale * taperFactor(u, params.shape),
          alpha: edgeFade,
          dist: stroke.arcLengths[i],
        };
      });

      renderShapeGeometry(ctx, waved, params.color, params.opacity, baseW, params.shape, stroke.seed);
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
          width: Math.max(0.8, baseW * pressureScale * multiplier * taperFactor(u, params.shape)),
          alpha: edgeFade,
          dist: stroke.arcLengths[i],
        };
      });

      renderShapeGeometry(ctx, pulsed, params.color, params.opacity, baseW, params.shape, stroke.seed);
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
