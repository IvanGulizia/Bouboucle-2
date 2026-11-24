import React, { useState } from 'react';
import {
  ArrowLeftRight,
  Copy,
  ImagePlus,
  Move,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  ANIMATION_MODES,
  AnimationMode,
  BRUSH_PRESETS,
  BackgroundImage,
  BrushPreset,
  CANVAS_BG_PRESETS,
  CanvasConfig,
  ImageFitMode,
  LOOP_BEHAVIORS,
  STROKE_SHAPES,
  StrokeParams,
} from '../types/studio';

export type InspectorTab = 'stroke' | 'canvas';

interface InspectorPanelProps {
  isOpen: boolean;
  activeTab: InspectorTab;
  activeParams: StrokeParams;
  activePresetId: string | null;
  isEditingSelectedStroke: boolean;
  strokeCount: number;
  backgroundImage: BackgroundImage | null;
  canvasConfig: CanvasConfig;
  isPanningImageTool: boolean;
  onChangeTab: (tab: InspectorTab) => void;
  onClose: () => void;
  onSelectPreset: (preset: BrushPreset) => void;
  onUpdateParams: (patch: Partial<StrokeParams>, commitHistory?: boolean) => void;
  onApplyParamsToAll: () => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onDeselectStroke: () => void;
  onClearAllStrokes: () => void;
  onChangeBackgroundColor: (hex: string) => void;
  onTriggerFilePicker: () => void;
  onUpdateImage: (patch: Partial<BackgroundImage>) => void;
  onResetImageTransform: () => void;
  onTogglePanImageTool: () => void;
  onRemoveImage: () => void;
}

function getFrequencyLabel(mode: AnimationMode): string | null {
  switch (mode) {
    case 'flow':
      return 'Nombre de traits';
    case 'boil':
      return 'Cadence de frémissement';
    case 'wave':
      return 'Fréquence des ondes';
    case 'pulse':
      return 'Fréquence des vagues';
    default:
      return null;
  }
}

function getAmplitudeLabel(mode: AnimationMode): string | null {
  switch (mode) {
    case 'boil':
      return 'Tremblement';
    case 'wave':
      return 'Amplitude';
    case 'pulse':
      return 'Intensité';
    default:
      return null;
  }
}

function getLengthLabel(mode: AnimationMode): string | null {
  switch (mode) {
    case 'flow':
      return 'Longueur du trait';
    case 'draw':
      return 'Temps de maintien';
    default:
      return null;
  }
}

interface ToggleRowProps {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ id, label, hint, checked, onChange }) => (
  <div className="flex items-center justify-between gap-3">
    <label htmlFor={id} className="min-w-0 cursor-pointer">
      <div className="text-xs font-medium text-[#18181B]">{label}</div>
      {hint && <div className="text-[11px] text-[#71717A] leading-snug mt-0.5">{hint}</div>}
    </label>
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] ${
        checked ? 'bg-[#1D4ED8]' : 'bg-[#D4D4D8]'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-xs transform transition-transform mt-0.5 ${
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  </div>
);

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  isOpen,
  activeTab,
  activeParams,
  activePresetId,
  isEditingSelectedStroke,
  strokeCount,
  backgroundImage,
  canvasConfig,
  isPanningImageTool,
  onChangeTab,
  onClose,
  onSelectPreset,
  onUpdateParams,
  onApplyParamsToAll,
  onDuplicateSelected,
  onDeleteSelected,
  onDeselectStroke,
  onClearAllStrokes,
  onChangeBackgroundColor,
  onTriggerFilePicker,
  onUpdateImage,
  onResetImageTransform,
  onTogglePanImageTool,
  onRemoveImage,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);

  if (!isOpen) return null;

  const freqLabel = getFrequencyLabel(activeParams.mode);
  const ampLabel = getAmplitudeLabel(activeParams.mode);
  const lengthLabel = getLengthLabel(activeParams.mode);

  return (
    <aside
      aria-label="Réglages de l’atelier"
      className="fixed top-[68px] right-4 bottom-20 w-[304px] max-w-[calc(100vw-32px)] bg-white/96 backdrop-blur-md border border-[#E4E4E7] rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.07)] z-30 flex flex-col overflow-hidden"
    >
      {/* Header with segmented tab switch */}
      <div className="px-4 py-3 border-b border-[#E4E4E7] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 p-0.5 bg-[#F4F4F5] rounded-lg">
          <button
            type="button"
            onClick={() => onChangeTab('stroke')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'stroke'
                ? 'bg-white text-[#18181B] shadow-xs'
                : 'text-[#71717A] hover:text-[#18181B]'
            }`}
          >
            Trait
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('canvas')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'canvas'
                ? 'bg-white text-[#18181B] shadow-xs'
                : 'text-[#71717A] hover:text-[#18181B]'
            }`}
          >
            Toile & Image
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer les réglages"
          className="h-8 w-8 rounded-lg hover:bg-[#F4F4F5] text-[#71717A] hover:text-[#18181B] flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto studio-scroll p-4 space-y-5">
        {activeTab === 'stroke' ? (
          <>
            {/* Context notice when editing an existing selected stroke */}
            {isEditingSelectedStroke && (
              <div className="pb-4 border-b border-[#E4E4E7] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#1D4ED8]">Trait sélectionné</span>
                  <button
                    type="button"
                    onClick={onDeselectStroke}
                    className="text-xs text-[#71717A] hover:text-[#18181B] cursor-pointer"
                  >
                    Terminer
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onDuplicateSelected}
                    className="flex-1 h-8 px-2.5 rounded-lg border border-[#E4E4E7] hover:bg-[#F4F4F5] text-xs font-medium text-[#18181B] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Dupliquer</span>
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteSelected}
                    className="flex-1 h-8 px-2.5 rounded-lg border border-[#E4E4E7] hover:border-[#DC2626]/30 hover:bg-[#DC2626]/5 text-xs font-medium text-[#DC2626] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Supprimer</span>
                  </button>
                </div>
              </div>
            )}

            {/* Brush Presets */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-[#18181B] block">Pinceaux</span>
              <div className="grid grid-cols-2 gap-1.5">
                {BRUSH_PRESETS.map((preset) => {
                  const active = preset.id === activePresetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onSelectPreset(preset)}
                      className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#18181B] text-white border-[#18181B]'
                          : 'bg-[#FAFAFA] hover:bg-[#F4F4F5] text-[#18181B] border-[#E4E4E7]'
                      }`}
                    >
                      <div className="text-xs font-semibold truncate">{preset.name}</div>
                      <div
                        className={`text-[10px] truncate mt-0.5 ${
                          active ? 'text-white/70' : 'text-[#71717A]'
                        }`}
                      >
                        {preset.subtitle}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Forme, Taille & Opacité */}
            <div className="space-y-4 pt-4 border-t border-[#E4E4E7]">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-[#18181B] block">Forme du trait</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {STROKE_SHAPES.map((shape) => {
                    const active = activeParams.shape === shape.id;
                    return (
                      <button
                        key={shape.id}
                        type="button"
                        onClick={() => onUpdateParams({ shape: shape.id }, true)}
                        className={`h-8 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#18181B] text-white border-[#18181B]'
                            : 'bg-white text-[#52525B] border-[#E4E4E7] hover:border-[#A1A1AA] hover:text-[#18181B]'
                        }`}
                      >
                        {shape.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="slider-width" className="font-medium text-[#18181B]">
                    Épaisseur
                  </label>
                  <span className="font-mono tabular-nums text-[#71717A]">
                    {Math.round(activeParams.width)} px
                  </span>
                </div>
                <input
                  id="slider-width"
                  type="range"
                  min={2}
                  max={48}
                  step={1}
                  value={activeParams.width}
                  onChange={(e) => onUpdateParams({ width: Number(e.target.value) }, false)}
                  onPointerUp={() => onUpdateParams({}, true)}
                  className="w-full studio-slider"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="slider-opacity" className="font-medium text-[#18181B]">
                    Opacité
                  </label>
                  <span className="font-mono tabular-nums text-[#71717A]">
                    {Math.round(activeParams.opacity * 100)} %
                  </span>
                </div>
                <input
                  id="slider-opacity"
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={activeParams.opacity}
                  onChange={(e) => onUpdateParams({ opacity: Number(e.target.value) }, false)}
                  onPointerUp={() => onUpdateParams({}, true)}
                  className="w-full studio-slider"
                />
              </div>

              <ToggleRow
                id="toggle-soft-edges"
                label="Sortie et entrée douces"
                hint="Évite la coupure nette aux extrémités"
                checked={activeParams.softEdges}
                onChange={(v) => onUpdateParams({ softEdges: v }, true)}
              />
            </div>

            {/* Animation Mode */}
            <div className="space-y-4 pt-4 border-t border-[#E4E4E7]">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#18181B]">Mouvement</label>
                  <span className="text-[11px] text-[#71717A]">
                    {ANIMATION_MODES.find((m) => m.id === activeParams.mode)?.hint}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {ANIMATION_MODES.map((m) => {
                    const active = activeParams.mode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onUpdateParams({ mode: m.id }, true)}
                        className={`h-8 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#18181B] text-white border-[#18181B]'
                            : 'bg-white text-[#52525B] border-[#E4E4E7] hover:border-[#A1A1AA] hover:text-[#18181B]'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeParams.mode !== 'static' && (
                <>
                  {/* Loop Behavior: Boucle / Aller-retour / Une fois */}
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-[#18181B] block">Répétition</span>
                    <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#F4F4F5] rounded-lg">
                      {LOOP_BEHAVIORS.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => onUpdateParams({ loopBehavior: b.id }, true)}
                          className={`h-8 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                            activeParams.loopBehavior === b.id
                              ? 'bg-white text-[#18181B] shadow-xs'
                              : 'text-[#71717A] hover:text-[#18181B]'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Speed + Reverse */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="slider-speed" className="font-medium text-[#18181B]">
                        Vitesse
                      </label>
                      <span className="font-mono tabular-nums text-[#71717A]">
                        {activeParams.speed}×
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id="slider-speed"
                        type="range"
                        min={1}
                        max={6}
                        step={1}
                        value={activeParams.speed}
                        onChange={(e) => onUpdateParams({ speed: Number(e.target.value) }, false)}
                        onPointerUp={() => onUpdateParams({}, true)}
                        className="flex-1 studio-slider"
                      />
                      <button
                        type="button"
                        onClick={() => onUpdateParams({ reverse: !activeParams.reverse }, true)}
                        title="Inverser le sens de l’animation"
                        aria-label="Inverser le sens"
                        aria-pressed={activeParams.reverse}
                        className={`h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                          activeParams.reverse
                            ? 'bg-[#1D4ED8]/10 border-[#1D4ED8]/30 text-[#1D4ED8]'
                            : 'border-[#E4E4E7] text-[#52525B] hover:bg-[#F4F4F5]'
                        }`}
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Natural Hand Drawing Speed */}
                  {activeParams.mode !== 'boil' && (
                    <ToggleRow
                      id="toggle-writing-speed"
                      label="Suivre la vitesse d’écriture"
                      hint="Reproduit les accélérations de votre geste"
                      checked={activeParams.followDrawingSpeed}
                      onChange={(v) => onUpdateParams({ followDrawingSpeed: v }, true)}
                    />
                  )}

                  {/* Segment Length (Flow / Draw) */}
                  {lengthLabel && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <label htmlFor="slider-length" className="font-medium text-[#18181B]">
                          {lengthLabel}
                        </label>
                        <span className="font-mono tabular-nums text-[#71717A]">
                          {Math.round(activeParams.length)} %
                        </span>
                      </div>
                      <input
                        id="slider-length"
                        type="range"
                        min={10}
                        max={100}
                        step={1}
                        value={activeParams.length}
                        onChange={(e) => onUpdateParams({ length: Number(e.target.value) }, false)}
                        onPointerUp={() => onUpdateParams({}, true)}
                        className="w-full studio-slider"
                      />
                    </div>
                  )}

                  {/* Frequency */}
                  {freqLabel && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <label htmlFor="slider-freq" className="font-medium text-[#18181B]">
                          {freqLabel}
                        </label>
                        <span className="font-mono tabular-nums text-[#71717A]">
                          {activeParams.frequency}
                        </span>
                      </div>
                      <input
                        id="slider-freq"
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={activeParams.frequency}
                        onChange={(e) =>
                          onUpdateParams({ frequency: Number(e.target.value) }, false)
                        }
                        onPointerUp={() => onUpdateParams({}, true)}
                        className="w-full studio-slider"
                      />
                    </div>
                  )}

                  {/* Amplitude (Boil / Wave / Pulse) */}
                  {ampLabel && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <label htmlFor="slider-amp" className="font-medium text-[#18181B]">
                          {ampLabel}
                        </label>
                        <span className="font-mono tabular-nums text-[#71717A]">
                          {Math.round(activeParams.amplitude)} %
                        </span>
                      </div>
                      <input
                        id="slider-amp"
                        type="range"
                        min={5}
                        max={100}
                        step={1}
                        value={activeParams.amplitude}
                        onChange={(e) =>
                          onUpdateParams({ amplitude: Number(e.target.value) }, false)
                        }
                        onPointerUp={() => onUpdateParams({}, true)}
                        className="w-full studio-slider"
                      />
                    </div>
                  )}

                  {/* Repeat Delay / Pause */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="slider-delay" className="font-medium text-[#18181B]">
                        Délai entre répétitions
                      </label>
                      <span className="font-mono tabular-nums text-[#71717A]">
                        {activeParams.repeatDelay === 0 ? 'Aucun' : `${activeParams.repeatDelay} %`}
                      </span>
                    </div>
                    <input
                      id="slider-delay"
                      type="range"
                      min={0}
                      max={75}
                      step={5}
                      value={activeParams.repeatDelay}
                      onChange={(e) =>
                        onUpdateParams({ repeatDelay: Number(e.target.value) }, false)
                      }
                      onPointerUp={() => onUpdateParams({}, true)}
                      className="w-full studio-slider"
                    />
                  </div>

                  {/* Start Phase Offset (for cascading multiple strokes) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="slider-offset" className="font-medium text-[#18181B]">
                        Décalage de départ
                      </label>
                      <span className="font-mono tabular-nums text-[#71717A]">
                        {activeParams.phaseOffset} %
                      </span>
                    </div>
                    <input
                      id="slider-offset"
                      type="range"
                      min={0}
                      max={95}
                      step={5}
                      value={activeParams.phaseOffset}
                      onChange={(e) =>
                        onUpdateParams({ phaseOffset: Number(e.target.value) }, false)
                      }
                      onPointerUp={() => onUpdateParams({}, true)}
                      className="w-full studio-slider"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Batch actions */}
            {strokeCount > 0 && (
              <div className="pt-4 border-t border-[#E4E4E7] space-y-2">
                {strokeCount > 1 && (
                  <button
                    type="button"
                    onClick={onApplyParamsToAll}
                    className="w-full h-9 px-3 rounded-lg border border-[#E4E4E7] hover:bg-[#F4F4F5] text-xs font-medium text-[#18181B] transition-colors cursor-pointer"
                  >
                    Appliquer ce style aux {strokeCount} traits
                  </button>
                )}

                {!confirmClear ? (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="w-full h-9 px-3 rounded-lg text-xs font-medium text-[#71717A] hover:text-[#DC2626] hover:bg-[#DC2626]/5 transition-colors cursor-pointer"
                  >
                    Effacer tous les traits ({strokeCount})
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onClearAllStrokes();
                        setConfirmClear(false);
                      }}
                      className="flex-1 h-9 rounded-lg bg-[#DC2626] text-white text-xs font-semibold hover:bg-[#B91C1C] transition-colors cursor-pointer"
                    >
                      Confirmer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="flex-1 h-9 rounded-lg border border-[#E4E4E7] text-xs font-medium text-[#52525B] hover:bg-[#F4F4F5] transition-colors cursor-pointer"
                    >
                      Annuler
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Canvas & Background Image Tab */
          <>
            <div className="space-y-2.5">
              <span className="text-xs font-semibold text-[#18181B] block">Fond de la toile</span>
              <div className="flex items-center gap-2">
                {CANVAS_BG_PRESETS.map((preset) => {
                  const active =
                    canvasConfig.backgroundColor.toLowerCase() === preset.hex.toLowerCase();
                  return (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => onChangeBackgroundColor(preset.hex)}
                      title={preset.name}
                      aria-label={preset.name}
                      className={`w-7 h-7 rounded-lg border transition-transform cursor-pointer ${
                        active
                          ? 'ring-2 ring-[#1D4ED8] ring-offset-2 border-black/15'
                          : 'border-[#D4D4D8] hover:scale-105'
                      }`}
                      style={{ backgroundColor: preset.hex }}
                    />
                  );
                })}
                <label
                  title="Couleur de fond personnalisée"
                  className="relative w-7 h-7 rounded-lg border border-[#D4D4D8] cursor-pointer overflow-hidden flex items-center justify-center"
                  style={{
                    background:
                      'conic-gradient(from 0deg, #DC2626, #D97706, #059669, #1D4ED8, #7C3AED, #DC2626)',
                  }}
                >
                  <input
                    type="color"
                    value={canvasConfig.backgroundColor}
                    onChange={(e) => onChangeBackgroundColor(e.target.value)}
                    aria-label="Couleur de fond personnalisée"
                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                  />
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-[#E4E4E7] space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#18181B]">Image de fond</span>
                {backgroundImage && (
                  <button
                    type="button"
                    onClick={onTriggerFilePicker}
                    className="text-xs text-[#1D4ED8] hover:underline font-medium cursor-pointer"
                  >
                    Remplacer
                  </button>
                )}
              </div>

              {!backgroundImage ? (
                <button
                  type="button"
                  onClick={onTriggerFilePicker}
                  className="w-full py-6 px-4 rounded-xl border border-dashed border-[#D4D4D8] hover:border-[#1D4ED8] hover:bg-[#1D4ED8]/[0.03] transition-colors flex flex-col items-center justify-center gap-2 text-center cursor-pointer"
                >
                  <ImagePlus className="w-5 h-5 text-[#71717A]" />
                  <span className="text-xs font-medium text-[#18181B]">
                    Importer une image ou un dessin
                  </span>
                  <span className="text-[11px] text-[#71717A]">
                    PNG, JPG, WebP, SVG · Glisser-déposer ou Coller
                  </span>
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={backgroundImage.src}
                      alt={backgroundImage.name}
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-lg object-cover border border-[#E4E4E7] shrink-0 bg-[#F4F4F5]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[#18181B] truncate">
                        {backgroundImage.name}
                      </p>
                      <p className="text-[11px] font-mono tabular-nums text-[#71717A]">
                        {backgroundImage.naturalWidth} × {backgroundImage.naturalHeight}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#F4F4F5] rounded-lg">
                    {(
                      [
                        { id: 'contain', label: 'Contenir' },
                        { id: 'cover', label: 'Couvrir' },
                      ] as { id: ImageFitMode; label: string }[]
                    ).map((fit) => (
                      <button
                        key={fit.id}
                        type="button"
                        onClick={() => onUpdateImage({ fit: fit.id })}
                        className={`h-8 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                          backgroundImage.fit === fit.id
                            ? 'bg-white text-[#18181B] shadow-xs'
                            : 'text-[#71717A] hover:text-[#18181B]'
                        }`}
                      >
                        {fit.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="slider-img-opacity" className="font-medium text-[#18181B]">
                        Opacité de l’image
                      </label>
                      <span className="font-mono tabular-nums text-[#71717A]">
                        {Math.round(backgroundImage.opacity * 100)} %
                      </span>
                    </div>
                    <input
                      id="slider-img-opacity"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={backgroundImage.opacity}
                      onChange={(e) => onUpdateImage({ opacity: Number(e.target.value) })}
                      className="w-full studio-slider"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="slider-img-scale" className="font-medium text-[#18181B]">
                        Zoom
                      </label>
                      <span className="font-mono tabular-nums text-[#71717A]">
                        {Math.round(backgroundImage.scale * 100)} %
                      </span>
                    </div>
                    <input
                      id="slider-img-scale"
                      type="range"
                      min={0.25}
                      max={3}
                      step={0.05}
                      value={backgroundImage.scale}
                      onChange={(e) => onUpdateImage({ scale: Number(e.target.value) })}
                      className="w-full studio-slider"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={onTogglePanImageTool}
                      className={`flex-1 h-9 px-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        isPanningImageTool
                          ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                          : 'border-[#E4E4E7] text-[#18181B] hover:bg-[#F4F4F5]'
                      }`}
                    >
                      <Move className="w-3.5 h-3.5" />
                      <span>{isPanningImageTool ? 'Recadrage actif' : 'Recadrer'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onResetImageTransform}
                      title="Réinitialiser la position et le zoom"
                      aria-label="Réinitialiser le cadrage"
                      className="h-9 w-9 rounded-lg border border-[#E4E4E7] hover:bg-[#F4F4F5] text-[#52525B] flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={onRemoveImage}
                      title="Retirer l’image"
                      aria-label="Retirer l’image"
                      className="h-9 w-9 rounded-lg border border-[#E4E4E7] hover:border-[#DC2626]/30 hover:bg-[#DC2626]/5 text-[#DC2626] flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
