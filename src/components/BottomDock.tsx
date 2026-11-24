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
  onChangeWidth: (width: number, commitHistory?: boolean) => void;
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
  onChangeWidth,
  onChangeMode,
  onSelectPreset,
  onToggleInspector,
  onImportOrEditImage,
}) => {
  const [openMenu, setOpenMenu] = useState<'presets' | 'size' | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [openMenu]);

  const isCustomColor = !STUDIO_SWATCHES.some(
    (s) => s.hex.toLowerCase() === activeParams.color.toLowerCase()
  );

  const activePreset = BRUSH_PRESETS.find((p) => p.id === activePresetId);
  const realisticPresets = BRUSH_PRESETS.filter((p) => p.category === 'réaliste');
  const graphicPresets = BRUSH_PRESETS.filter((p) => p.category === 'graphique');

  // Visual dot diameter proportional to brush width
  const dotPx = Math.max(4, Math.min(18, Math.round(3 + activeParams.width * 0.34)));

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100vw-24px)]">
      <div className="relative" ref={dockRef}>
        {/* Brush Presets Popover */}
        {openMenu === 'presets' && (
          <div className="absolute bottom-full left-0 mb-2.5 w-[320px] sm:w-[372px] max-h-[62vh] overflow-y-auto studio-scroll p-3 bg-white border border-[#E4E4E7] rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.12)] z-50 space-y-3">
            <div>
              <div className="px-1 pb-1.5 text-[11px] font-semibold text-[#71717A]">
                Pinceaux réalistes
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {realisticPresets.map((preset) => {
                  const isSelected = preset.id === activePresetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        onSelectPreset(preset);
                        setOpenMenu(null);
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

            <div className="pt-2.5 border-t border-[#E4E4E7]">
              <div className="px-1 pb-1.5 text-[11px] font-semibold text-[#71717A]">
                Pinceaux graphiques
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {graphicPresets.map((preset) => {
                  const isSelected = preset.id === activePresetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        onSelectPreset(preset);
                        setOpenMenu(null);
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
          </div>
        )}

        {/* Quick Width Popover */}
        {openMenu === 'size' && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-60 p-3.5 bg-white border border-[#E4E4E7] rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.12)] z-50 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#18181B]">Épaisseur du trait</span>
              <span className="font-mono tabular-nums text-[#71717A]">
                {Math.round(activeParams.width)} px
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={56}
              step={1}
              value={activeParams.width}
              onChange={(e) => onChangeWidth(Number(e.target.value), false)}
              onPointerUp={() => onChangeWidth(activeParams.width, true)}
              aria-label="Épaisseur du trait"
              className="w-full studio-slider"
            />
          </div>
        )}

        <div className="bg-white/95 backdrop-blur-md border border-[#E4E4E7] shadow-[0_8px_28px_rgba(0,0,0,0.08)] rounded-2xl px-2 py-1.5 flex items-center gap-1.5 md:gap-2 overflow-x-auto">
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
            onClick={() => setOpenMenu((m) => (m === 'presets' ? null : 'presets'))}
            aria-expanded={openMenu === 'presets'}
            title="Choisir un preset de pinceau"
            className={`h-10 px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              openMenu === 'presets'
                ? 'bg-[#1D4ED8]/10 text-[#1D4ED8]'
                : 'bg-[#F4F4F5] hover:bg-[#EAEAEF] text-[#18181B]'
            }`}
          >
            <span className="max-w-[104px] truncate">{activePreset ? activePreset.name : 'Pinceau'}</span>
            <ChevronUp
              className={`w-3.5 h-3.5 text-[#71717A] transition-transform ${
                openMenu === 'presets' ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Quick Thickness Button */}
          <button
            type="button"
            onClick={() => setOpenMenu((m) => (m === 'size' ? null : 'size'))}
            aria-expanded={openMenu === 'size'}
            title="Épaisseur du trait ([ / ])"
            aria-label={`Épaisseur : ${Math.round(activeParams.width)} pixels`}
            className={`h-10 px-2.5 rounded-xl flex items-center gap-2 text-xs font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              openMenu === 'size'
                ? 'bg-[#1D4ED8]/10 text-[#1D4ED8]'
                : 'hover:bg-[#F4F4F5] text-[#52525B]'
            }`}
          >
            <span className="w-5 h-5 flex items-center justify-center">
              <span
                className="rounded-full bg-[#18181B] block transition-[width,height] duration-100"
                style={{ width: dotPx, height: dotPx }}
              />
            </span>
            <span className="hidden sm:inline">{Math.round(activeParams.width)}</span>
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

          <div className="h-6 w-px bg-[#E4E4E7] shrink-0 hidden xl:block" aria-hidden="true" />

          {/* Quick Motion Mode Switcher (extra-wide desktop) */}
          <div
            className="hidden xl:flex items-center gap-0.5 p-0.5 bg-[#F4F4F5] rounded-xl shrink-0"
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
