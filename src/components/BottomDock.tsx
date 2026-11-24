import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronUp,
  Eraser,
  Image as ImageIcon,
  MousePointer2,
  PenTool,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ANIMATION_MODES,
  AnimationMode,
  BRUSH_PRESETS,
  BrushPreset,
  STUDIO_SWATCHES,
  StrokeParams,
  ToolMode,
} from '../types/studio';

interface BottomDockProps {
  toolMode: ToolMode;
  activeParams: StrokeParams;
  activePresetId: string | null;
  hasBackgroundImage: boolean;
  inspectorOpen: boolean;
  onChangeTool: (tool: ToolMode) => void;
  onChangeColor: (hex: string) => void;
  onChangeMode: (mode: AnimationMode) => void;
  onSelectPreset: (preset: BrushPreset) => void;
  onToggleInspector: () => void;
  onImportOrEditImage: () => void;
}

export const BottomDock: React.FC<BottomDockProps> = ({
  toolMode,
  activeParams,
  activePresetId,
  hasBackgroundImage,
  inspectorOpen,
  onChangeTool,
  onChangeColor,
  onChangeMode,
  onSelectPreset,
  onToggleInspector,
  onImportOrEditImage,
}) => {
  const [presetsOpen, setPresetsOpen] = useState(false);
  const presetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!presetsOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (presetRef.current && !presetRef.current.contains(e.target as Node)) {
        setPresetsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [presetsOpen]);

  const isCustomColor = !STUDIO_SWATCHES.some(
    (s) => s.hex.toLowerCase() === activeParams.color.toLowerCase()
  );

  const activePreset = BRUSH_PRESETS.find((p) => p.id === activePresetId);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100vw-24px)]">
      <div className="relative" ref={presetRef}>
        {/* Brush Presets Popover (opens upward cleanly) */}
        {presetsOpen && (
          <div className="absolute bottom-full left-0 mb-2.5 w-72 sm:w-80 p-2.5 bg-white border border-[#E4E4E7] rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.12)] z-50">
            <div className="px-1.5 pb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-[#18181B]">Pinceaux préréglés</span>
              <span className="text-[11px] text-[#71717A]">{BRUSH_PRESETS.length} styles</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {BRUSH_PRESETS.map((preset) => {
                const isSelected = preset.id === activePresetId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onSelectPreset(preset);
                      setPresetsOpen(false);
                    }}
                    className={`px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#18181B] text-white border-[#18181B]'
                        : 'bg-[#FAFAFA] hover:bg-[#F4F4F5] text-[#18181B] border-[#E4E4E7]'
                    }`}
                  >
                    <div className="text-xs font-semibold truncate">{preset.name}</div>
                    <div
                      className={`text-[11px] truncate mt-0.5 ${
                        isSelected ? 'text-white/70' : 'text-[#71717A]'
                      }`}
                    >
                      {preset.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white/95 backdrop-blur-md border border-[#E4E4E7] shadow-[0_8px_28px_rgba(0,0,0,0.08)] rounded-2xl px-2 py-1.5 flex items-center gap-1.5 md:gap-2.5 overflow-x-auto">
          {/* Core Tools */}
          <div className="flex items-center gap-1 shrink-0" role="toolbar" aria-label="Outils">
            <button
              type="button"
              onClick={() => onChangeTool('draw')}
              title="Tracer un trait (P)"
              aria-label="Tracer"
              aria-pressed={toolMode === 'draw'}
              className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                toolMode === 'draw'
                  ? 'bg-[#18181B] text-white'
                  : 'text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#18181B]'
              }`}
            >
              <PenTool className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onChangeTool('select')}
              title="Sélectionner un trait (V)"
              aria-label="Sélectionner"
              aria-pressed={toolMode === 'select'}
              className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                toolMode === 'select'
                  ? 'bg-[#18181B] text-white'
                  : 'text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#18181B]'
              }`}
            >
              <MousePointer2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onChangeTool('erase')}
              title="Effacer des traits (E)"
              aria-label="Effacer"
              aria-pressed={toolMode === 'erase'}
              className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                toolMode === 'erase'
                  ? 'bg-[#18181B] text-white'
                  : 'text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#18181B]'
              }`}
            >
              <Eraser className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onImportOrEditImage}
              title={
                hasBackgroundImage ? 'Recadrer ou modifier l’image' : 'Importer une image / dessin'
              }
              aria-label={hasBackgroundImage ? 'Modifier l’image' : 'Importer une image'}
              aria-pressed={toolMode === 'image'}
              className={`h-10 px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                toolMode === 'image'
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#18181B]'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              <span className="hidden sm:inline">{hasBackgroundImage ? 'Image' : 'Importer'}</span>
            </button>
          </div>

          <div className="h-6 w-px bg-[#E4E4E7] shrink-0" aria-hidden="true" />

          {/* Quick Brush Preset Selector */}
          <button
            type="button"
            onClick={() => setPresetsOpen((v) => !v)}
            aria-expanded={presetsOpen}
            title="Choisir un preset de pinceau"
            className={`h-10 px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              presetsOpen
                ? 'bg-[#1D4ED8]/10 text-[#1D4ED8]'
                : 'bg-[#F4F4F5] hover:bg-[#EAEAEF] text-[#18181B]'
            }`}
          >
            <span className="max-w-[96px] truncate">{activePreset ? activePreset.name : 'Pinceau'}</span>
            <ChevronUp
              className={`w-3.5 h-3.5 text-[#71717A] transition-transform ${
                presetsOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          <div className="h-6 w-px bg-[#E4E4E7] shrink-0" aria-hidden="true" />

          {/* Curated Ink Swatches + Custom Color */}
          <div className="flex items-center gap-1.5 shrink-0 px-0.5" aria-label="Couleur du trait">
            {STUDIO_SWATCHES.map((swatch) => {
              const active = activeParams.color.toLowerCase() === swatch.hex.toLowerCase();
              return (
                <button
                  key={swatch.hex}
                  type="button"
                  onClick={() => onChangeColor(swatch.hex)}
                  title={swatch.name}
                  aria-label={swatch.name}
                  aria-pressed={active}
                  className={`w-6 h-6 rounded-full transition-transform cursor-pointer border ${
                    swatch.hex === '#FAFAFA' ? 'border-[#D4D4D8]' : 'border-black/10'
                  } ${active ? 'scale-115 ring-2 ring-[#1D4ED8] ring-offset-2' : 'hover:scale-110'}`}
                  style={{ backgroundColor: swatch.hex }}
                />
              );
            })}

            <label
              title="Couleur personnalisée"
              className={`relative w-6 h-6 rounded-full cursor-pointer overflow-hidden border border-[#D4D4D8] flex items-center justify-center transition-transform hover:scale-110 ${
                isCustomColor ? 'ring-2 ring-[#1D4ED8] ring-offset-2 scale-115' : ''
              }`}
              style={{
                background: isCustomColor
                  ? activeParams.color
                  : 'conic-gradient(from 0deg, #DC2626, #D97706, #059669, #1D4ED8, #7C3AED, #DC2626)',
              }}
            >
              <input
                type="color"
                value={activeParams.color}
                onChange={(e) => onChangeColor(e.target.value)}
                aria-label="Choisir une couleur personnalisée"
                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
              />
            </label>
          </div>

          <div className="h-6 w-px bg-[#E4E4E7] shrink-0 hidden lg:block" aria-hidden="true" />

          {/* Quick Motion Mode Switcher (large desktop) */}
          <div
            className="hidden lg:flex items-center gap-0.5 p-0.5 bg-[#F4F4F5] rounded-xl shrink-0"
            role="group"
            aria-label="Animation du trait"
          >
            {ANIMATION_MODES.map((m) => {
              const active = activeParams.mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onChangeMode(m.id)}
                  title={m.hint}
                  className={`h-8 px-2.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-white text-[#18181B] shadow-xs'
                      : 'text-[#71717A] hover:text-[#18181B]'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <div className="h-6 w-px bg-[#E4E4E7] shrink-0" aria-hidden="true" />

          {/* Parameters Inspector Toggle */}
          <button
            type="button"
            onClick={onToggleInspector}
            title="Paramètres avancés du trait et de l’image"
            aria-label="Paramètres"
            aria-expanded={inspectorOpen}
            className={`h-10 px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              inspectorOpen
                ? 'bg-[#1D4ED8]/10 text-[#1D4ED8]'
                : 'text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#18181B]'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Réglages</span>
          </button>
        </div>
      </div>
    </div>
  );
};
