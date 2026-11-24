export type AnimationMode = 'flow' | 'boil' | 'wave' | 'draw' | 'pulse' | 'static';

export type StrokeShape = 'taper' | 'round' | 'square' | 'dots' | 'chalk' | 'double';

export type LoopBehavior = 'loop' | 'pingpong' | 'once';

export type ToolMode = 'draw' | 'select' | 'erase' | 'image';

export type AspectRatioId = '1:1' | '4:5' | '9:16' | '16:9' | '4:3' | 'auto';

export type ImageFitMode = 'contain' | 'cover';

export interface StrokePoint {
  /** World X coordinate centered at 0 (reference height = 1000) */
  x: number;
  /** World Y coordinate centered at 0 (reference height = 1000) */
  y: number;
  /** Normalized stylus pressure 0..1 */
  pressure: number;
  /** Normalized capture timestamp 0..1 preserving natural hand drawing speed */
  time: number;
}

export interface StrokeParams {
  mode: AnimationMode;
  shape: StrokeShape;
  color: string;
  /** Width in world units (relative to 1000px reference height) */
  width: number;
  /** Opacity 0.05..1 */
  opacity: number;
  /** Cycles per loop (1..6) for seamless looping */
  speed: number;
  /** Reverse animation direction along the stroke */
  reverse: boolean;
  /** Follow the artist's real drawing velocity recorded while sketching */
  followDrawingSpeed: boolean;
  /** Whether the stroke loops continuously, bounces back and forth, or plays once */
  loopBehavior: LoopBehavior;
  /** Visible segment length in Flow / Draw modes (10..100 %) */
  length: number;
  /** Motion intensity for Wave / Boil / Pulse (5..100 %) */
  amplitude: number;
  /** Segments count (Flow), wave cycles (Wave/Pulse), or cel rate (Boil) (1..10) */
  frequency: number;
  /** Pause / rest duration between repetitions (0..75 %) */
  repeatDelay: number;
  /** Starting phase offset for staggering multiple strokes (0..100 %) */
  phaseOffset: number;
  /** Smoothly fade & taper entry/exit at open stroke endpoints so nothing cuts off abruptly */
  softEdges: boolean;
}

export interface AnimatedStroke {
  id: string;
  /** Deterministic seed for procedural motion (boil/chalk) */
  seed: number;
  /** Smoothed and resampled world points */
  points: StrokePoint[];
  /** Cumulative arc lengths along `points` */
  arcLengths: number[];
  totalLength: number;
  /** True when start and end points meet closely (seamless closed loop) */
  isClosed: boolean;
  /** Original drawing gesture duration in milliseconds */
  drawDurationMs: number;
  params: StrokeParams;
}

export interface BrushPreset {
  id: string;
  name: string;
  subtitle: string;
  params: Partial<StrokeParams>;
}

export interface BackgroundImage {
  src: string;
  name: string;
  naturalWidth: number;
  naturalHeight: number;
  opacity: number;
  fit: ImageFitMode;
  /** User multiplier on top of base fit (0.25..4) */
  scale: number;
  /** Offset in world units */
  offsetX: number;
  offsetY: number;
}

export interface CanvasConfig {
  aspectRatio: AspectRatioId;
  backgroundColor: string;
  /** Duration of one complete seamless loop in seconds */
  loopDurationSec: number;
}

export interface ExportSettings {
  format: 'gif' | 'video';
  resolution: 'standard' | 'high';
  fps: 12 | 24 | 30;
  videoLoops: 1 | 2 | 3;
}

export interface AspectRatioOption {
  id: AspectRatioId;
  label: string;
  description: string;
  ratio: number;
}

export const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  { id: '1:1', label: '1:1', description: 'Carré', ratio: 1 },
  { id: '4:5', label: '4:5', description: 'Portrait', ratio: 4 / 5 },
  { id: '9:16', label: '9:16', description: 'Vertical', ratio: 9 / 16 },
  { id: '16:9', label: '16:9', description: 'Paysage', ratio: 16 / 9 },
  { id: '4:3', label: '4:3', description: 'Classique', ratio: 4 / 3 },
  { id: 'auto', label: 'Auto', description: 'Image', ratio: 4 / 3 },
];

export const ANIMATION_MODES: {
  id: AnimationMode;
  label: string;
  hint: string;
}[] = [
  { id: 'flow', label: 'Flux', hint: 'Segments fluides qui glissent' },
  { id: 'boil', label: 'Frémir', hint: 'Vibration dessin animé' },
  { id: 'wave', label: 'Onde', hint: 'Ondulation fluide continue' },
  { id: 'draw', label: 'Tracé', hint: 'Apparition et effacement' },
  { id: 'pulse', label: 'Pulse', hint: 'Respiration de l’épaisseur' },
  { id: 'static', label: 'Fixe', hint: 'Trait immobile' },
];

export const STROKE_SHAPES: {
  id: StrokeShape;
  label: string;
}[] = [
  { id: 'taper', label: 'Effilé' },
  { id: 'round', label: 'Rond' },
  { id: 'square', label: 'Ruban' },
  { id: 'dots', label: 'Perles' },
  { id: 'chalk', label: 'Craie' },
  { id: 'double', label: 'Double' },
];

export const LOOP_BEHAVIORS: {
  id: LoopBehavior;
  label: string;
}[] = [
  { id: 'loop', label: 'Boucle' },
  { id: 'pingpong', label: 'Aller-retour' },
  { id: 'once', label: 'Une fois' },
];

export const STUDIO_SWATCHES = [
  { name: 'Encre noire', hex: '#141416' },
  { name: 'Cobalt', hex: '#1D4ED8' },
  { name: 'Vermillon', hex: '#DC2626' },
  { name: 'Ocre', hex: '#D97706' },
  { name: 'Émeraude', hex: '#059669' },
  { name: 'Craie', hex: '#FAFAFA' },
];

export const CANVAS_BG_PRESETS = [
  { name: 'Papier', hex: '#FAF9F6' },
  { name: 'Blanc', hex: '#FFFFFF' },
  { name: 'Gris clair', hex: '#ECECE8' },
  { name: 'Ardoise', hex: '#18181B' },
  { name: 'Noir', hex: '#09090B' },
];

export const DEFAULT_STROKE_PARAMS: StrokeParams = {
  mode: 'flow',
  shape: 'taper',
  color: '#141416',
  width: 11,
  opacity: 1,
  speed: 1,
  reverse: false,
  followDrawingSpeed: true,
  loopBehavior: 'loop',
  length: 48,
  amplitude: 45,
  frequency: 2,
  repeatDelay: 0,
  phaseOffset: 0,
  softEdges: true,
};

export const BRUSH_PRESETS: BrushPreset[] = [
  {
    id: 'bouboucle',
    name: 'Bouboucle',
    subtitle: 'Flux effilé continu',
    params: {
      mode: 'flow',
      shape: 'taper',
      width: 11,
      opacity: 1,
      speed: 1,
      reverse: false,
      followDrawingSpeed: true,
      loopBehavior: 'loop',
      length: 48,
      frequency: 2,
      repeatDelay: 0,
      softEdges: true,
    },
  },
  {
    id: 'geste-encre',
    name: 'Plume vive',
    subtitle: 'Suit votre geste',
    params: {
      mode: 'draw',
      shape: 'taper',
      width: 10,
      opacity: 0.95,
      speed: 1,
      reverse: false,
      followDrawingSpeed: true,
      loopBehavior: 'loop',
      length: 65,
      repeatDelay: 18,
      softEdges: true,
    },
  },
  {
    id: 'crayon-boil',
    name: 'Crayon animé',
    subtitle: 'Grain craie frémissant',
    params: {
      mode: 'boil',
      shape: 'chalk',
      width: 13,
      opacity: 0.92,
      speed: 1,
      reverse: false,
      followDrawingSpeed: false,
      loopBehavior: 'loop',
      amplitude: 38,
      frequency: 3,
      repeatDelay: 0,
      softEdges: true,
    },
  },
  {
    id: 'perles',
    name: 'Perles filantes',
    subtitle: 'Points en mouvement',
    params: {
      mode: 'flow',
      shape: 'dots',
      width: 12,
      opacity: 1,
      speed: 1,
      reverse: false,
      followDrawingSpeed: false,
      loopBehavior: 'loop',
      length: 62,
      frequency: 2,
      repeatDelay: 0,
      softEdges: true,
    },
  },
  {
    id: 'onde-soie',
    name: 'Onde soyeuse',
    subtitle: 'Ondulation organique',
    params: {
      mode: 'wave',
      shape: 'taper',
      width: 9,
      opacity: 0.9,
      speed: 1,
      reverse: false,
      followDrawingSpeed: false,
      loopBehavior: 'loop',
      amplitude: 42,
      frequency: 3,
      repeatDelay: 0,
      softEdges: true,
    },
  },
  {
    id: 'double-fil',
    name: 'Double filet',
    subtitle: 'Lignes parallèles',
    params: {
      mode: 'flow',
      shape: 'double',
      width: 11,
      opacity: 0.95,
      speed: 1,
      reverse: false,
      followDrawingSpeed: true,
      loopBehavior: 'loop',
      length: 44,
      frequency: 2,
      repeatDelay: 12,
      softEdges: true,
    },
  },
  {
    id: 'souffle',
    name: 'Souffle',
    subtitle: 'Aller-retour doux',
    params: {
      mode: 'pulse',
      shape: 'round',
      width: 14,
      opacity: 0.85,
      speed: 1,
      reverse: false,
      followDrawingSpeed: false,
      loopBehavior: 'pingpong',
      amplitude: 65,
      frequency: 2,
      repeatDelay: 0,
      softEdges: true,
    },
  },
  {
    id: 'encre-fixe',
    name: 'Encre fixe',
    subtitle: 'Trait calligraphique',
    params: {
      mode: 'static',
      shape: 'taper',
      width: 9,
      opacity: 1,
      softEdges: false,
    },
  },
];

export const WORLD_REF_HEIGHT = 1000;
