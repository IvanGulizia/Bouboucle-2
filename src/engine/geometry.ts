import {
  AnimatedStroke,
  ASPECT_RATIO_OPTIONS,
  AspectRatioId,
  BackgroundImage,
  StrokeParams,
  StrokePoint,
  WORLD_REF_HEIGHT,
} from '../types/studio';

/**
 * Returns the numeric width/height aspect ratio for the active canvas configuration.
 */
export function getEffectiveAspectRatio(
  aspectRatio: AspectRatioId,
  bgImage: BackgroundImage | null
): number {
  if (aspectRatio === 'auto' && bgImage && bgImage.naturalWidth > 0 && bgImage.naturalHeight > 0) {
    const raw = bgImage.naturalWidth / bgImage.naturalHeight;
    return Math.min(Math.max(raw, 0.35), 2.8);
  }
  const found = ASPECT_RATIO_OPTIONS.find((opt) => opt.id === aspectRatio);
  return found ? found.ratio : 1;
}

/**
 * Computes even-numbered pixel dimensions (required by MP4/WebM encoders) for export.
 */
export function getExportDimensions(
  aspectRatio: number,
  resolution: 'standard' | 'high',
  format: 'gif' | 'video'
): { width: number; height: number } {
  const maxEdge =
    format === 'gif'
      ? resolution === 'high'
        ? 800
        : 540
      : resolution === 'high'
        ? 1440
        : 960;

  let width: number;
  let height: number;
  if (aspectRatio >= 1) {
    width = maxEdge;
    height = Math.round(maxEdge / aspectRatio);
  } else {
    height = maxEdge;
    width = Math.round(maxEdge * aspectRatio);
  }

  width = Math.max(2, Math.round(width / 2) * 2);
  height = Math.max(2, Math.round(height / 2) * 2);
  return { width, height };
}

/**
 * Converts canvas pixel coordinates to centered world coordinates
 * (origin at center, reference height = WORLD_REF_HEIGHT).
 */
export function canvasToWorld(
  canvasX: number,
  canvasY: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const scale = WORLD_REF_HEIGHT / canvasHeight;
  return {
    x: (canvasX - canvasWidth / 2) * scale,
    y: (canvasY - canvasHeight / 2) * scale,
  };
}

/**
 * Converts centered world coordinates to canvas pixel coordinates.
 */
export function worldToCanvas(
  worldX: number,
  worldY: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const scale = canvasHeight / WORLD_REF_HEIGHT;
  return {
    x: canvasWidth / 2 + worldX * scale,
    y: canvasHeight / 2 + worldY * scale,
  };
}

/**
 * Applies Chaikin corner-cutting smoothing while preserving start/end anchors
 * and smoothly interpolating pressure and drawing time.
 */
function chaikinSmooth(points: StrokePoint[], iterations = 2): StrokePoint[] {
  if (points.length < 3) return points;
  let current = points;

  for (let iter = 0; iter < iterations; iter++) {
    const next: StrokePoint[] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];
      next.push({
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y,
        pressure: 0.75 * p0.pressure + 0.25 * p1.pressure,
        time: 0.75 * p0.time + 0.25 * p1.time,
      });
      next.push({
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y,
        pressure: 0.25 * p0.pressure + 0.75 * p1.pressure,
        time: 0.25 * p0.time + 0.75 * p1.time,
      });
    }
    next.push(current[current.length - 1]);
    current = next;
  }

  return current;
}

/**
 * Resamples a polyline to uniform arc-length intervals while preserving the
 * artist's normalized drawing timestamp curve (`time ∈ [0, 1]`).
 */
export function smoothAndResamplePath(
  rawPoints: StrokePoint[],
  stepSize = 4.5
): { points: StrokePoint[]; arcLengths: number[]; totalLength: number } {
  if (rawPoints.length === 0) {
    return { points: [], arcLengths: [], totalLength: 0 };
  }

  if (rawPoints.length === 1) {
    const p = rawPoints[0];
    const pts: StrokePoint[] = [
      { ...p, time: 0 },
      { x: p.x + 0.8, y: p.y + 0.8, pressure: p.pressure, time: 1 },
    ];
    return { points: pts, arcLengths: [0, 1.13], totalLength: 1.13 };
  }

  // Normalize raw timestamps cleanly into [0, 1]
  const t0 = rawPoints[0].time;
  const tSpan = Math.max(1, rawPoints[rawPoints.length - 1].time - t0);
  const normalized: StrokePoint[] = rawPoints.map((p, idx) => ({
    ...p,
    time: rawPoints.length > 1 ? Math.max(0, Math.min(1, (p.time - t0) / tSpan)) : idx,
  }));

  // Deduplicate very close consecutive points
  const filtered: StrokePoint[] = [normalized[0]];
  for (let i = 1; i < normalized.length; i++) {
    const prev = filtered[filtered.length - 1];
    const curr = normalized[i];
    const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (dist >= 1.4 || i === normalized.length - 1) {
      filtered.push(curr);
    }
  }

  const smoothed = chaikinSmooth(filtered, filtered.length > 4 ? 2 : 1);

  const cumLen: number[] = [0];
  let total = 0;
  for (let i = 1; i < smoothed.length; i++) {
    total += Math.hypot(smoothed[i].x - smoothed[i - 1].x, smoothed[i].y - smoothed[i - 1].y);
    cumLen.push(total);
  }

  if (total < 1) {
    const p = smoothed[0];
    return {
      points: [
        { ...p, time: 0 },
        { x: p.x + 1, y: p.y, pressure: p.pressure, time: 1 },
      ],
      arcLengths: [0, 1],
      totalLength: 1,
    };
  }

  const targetStep = Math.max(stepSize, total / 440);
  const sampleCount = Math.max(2, Math.ceil(total / targetStep));
  const resampled: StrokePoint[] = [];
  const arcLengths: number[] = [];

  let segIndex = 0;
  let lastTime = 0;
  for (let i = 0; i <= sampleCount; i++) {
    const targetDist = (i / sampleCount) * total;
    while (segIndex < cumLen.length - 2 && cumLen[segIndex + 1] < targetDist) {
      segIndex++;
    }
    const segStart = cumLen[segIndex];
    const segEnd = cumLen[segIndex + 1];
    const segSpan = segEnd - segStart;
    const t = segSpan > 0.0001 ? (targetDist - segStart) / segSpan : 0;
    const a = smoothed[segIndex];
    const b = smoothed[segIndex + 1];

    // Enforce monotonic time so inverse velocity lookup is always exact
    const interpTime = Math.max(lastTime, a.time + (b.time - a.time) * t);
    lastTime = interpTime;

    resampled.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      pressure: a.pressure + (b.pressure - a.pressure) * t,
      time: i === sampleCount ? 1 : interpTime,
    });
    arcLengths.push(targetDist);
  }

  return { points: resampled, arcLengths, totalLength: total };
}

/**
 * Maps a normalized playback progress p ∈ [0, 1] to normalized arc-length u ∈ [0, 1]
 * using the stroke's recorded writing velocity curve when `followDrawingSpeed` is enabled.
 */
export function mapProgressToArcU(
  stroke: AnimatedStroke,
  progress: number,
  followDrawingSpeed: boolean
): number {
  const p = Math.max(0, Math.min(1, progress));
  if (!followDrawingSpeed || stroke.points.length < 3 || stroke.totalLength <= 0) {
    return p;
  }

  const pts = stroke.points;
  let low = 0;
  let high = pts.length - 1;
  while (low < high - 1) {
    const mid = (low + high) >> 1;
    if (pts[mid].time <= p) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const t0 = pts[low].time;
  const t1 = pts[high].time;
  const span = t1 - t0;
  const frac = span > 0.0001 ? (p - t0) / span : 0;
  const d0 = stroke.arcLengths[low];
  const d1 = stroke.arcLengths[high];
  return (d0 + (d1 - d0) * frac) / stroke.totalLength;
}

/**
 * Creates a finalized AnimatedStroke from raw drawn points with captured timestamps.
 */
export function createAnimatedStroke(
  rawPoints: StrokePoint[],
  params: StrokeParams
): AnimatedStroke {
  const drawDurationMs =
    rawPoints.length > 1
      ? Math.max(80, rawPoints[rawPoints.length - 1].time - rawPoints[0].time)
      : 200;

  const { points, arcLengths, totalLength } = smoothAndResamplePath(rawPoints, 4.5);

  const first = points[0];
  const last = points[points.length - 1];
  const endpointDist = first && last ? Math.hypot(last.x - first.x, last.y - first.y) : Infinity;
  const isClosed = totalLength > 90 && endpointDist < Math.max(36, params.width * 2.5);

  return {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    seed: Math.floor(Math.random() * 100000),
    points,
    arcLengths,
    totalLength,
    isClosed,
    drawDurationMs,
    params: { ...params },
  };
}

/**
 * Distance squared from point (px, py) to segment (ax, ay)-(bx, by).
 */
function distToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (px - ax) ** 2 + (py - ay) ** 2;
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return (px - projX) ** 2 + (py - projY) ** 2;
}

/**
 * Finds the topmost stroke intersecting world point (wx, wy).
 */
export function hitTestStrokes(
  wx: number,
  wy: number,
  strokes: AnimatedStroke[],
  extraTolerance = 14
): AnimatedStroke | null {
  for (let s = strokes.length - 1; s >= 0; s--) {
    const stroke = strokes[s];
    const hitRadius = Math.max(stroke.params.width * 0.7, 6) + extraTolerance;
    const hitRadiusSq = hitRadius * hitRadius;
    const pts = stroke.points;

    for (let i = 0; i < pts.length - 1; i++) {
      const dSq = distToSegmentSq(wx, wy, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      if (dSq <= hitRadiusSq) {
        return stroke;
      }
    }
  }
  return null;
}

/**
 * Deterministic hash returning a float in [-1, 1].
 */
export function hashSigned(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * Smooth 1D value noise for organic hand-drawn line boil and chalk grain.
 */
export function smoothNoise1D(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hashSigned(i + seed * 19.19);
  const b = hashSigned(i + 1 + seed * 19.19);
  return a + (b - a) * u;
}
