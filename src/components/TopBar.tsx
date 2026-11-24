import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  ASPECT_RATIO_OPTIONS,
  AspectRatioId,
  CanvasConfig,
} from '../types/studio';

interface TopBarProps {
  canvasConfig: CanvasConfig;
  hasBackgroundImage: boolean;
  strokeCount: number;
  isPlaying: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onTogglePlay: () => void;
  onRestartLoop: () => void;
  onChangeAspectRatio: (ratio: AspectRatioId) => void;
  onChangeLoopDuration: (seconds: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearAllStrokes: () => void;
  onOpenExport: () => void;
}

const LOOP_DURATIONS = [1, 2, 3, 4];

export const TopBar: React.FC<TopBarProps> = ({
  canvasConfig,
  hasBackgroundImage,
  strokeCount,
  isPlaying,
  canUndo,
  canRedo,
  onTogglePlay,
  onRestartLoop,
  onChangeAspectRatio,
  onChangeLoopDuration,
  onUndo,
  onRedo,
  onClearAllStrokes,
  onOpenExport,
}) => {
  const [ratioOpen, setRatioOpen] = useState(false);
  const ratioMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ratioOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (ratioMenuRef.current && !ratioMenuRef.current.contains(e.target as Node)) {
        setRatioOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [ratioOpen]);

  const activeRatio =
    ASPECT_RATIO_OPTIONS.find((r) => r.id === canvasConfig.aspectRatio) ??
    ASPECT_RATIO_OPTIONS[0];

  const cycleDuration = () => {
    const idx = LOOP_DURATIONS.indexOf(canvasConfig.loopDurationSec);
    const next = LOOP_DURATIONS[(idx + 1) % LOOP_DURATIONS.length];
    onChangeLoopDuration(next);
  };

  return (
    <header className="h-14 px-4 md:px-6 bg-white border-b border-[#E4E4E7] flex items-center justify-between gap-4 md:gap-8 shrink-0 z-30">
      {/* Zone 1: Single-element brand wordmark */}
      <div className="text-[17px] font-bold tracking-tight text-[#18181B] whitespace-nowrap shrink-0 select-none">
        Ondule
      </div>

      {/* Zone 2: Minimalist studio transport, format & quick actions */}
      <div className="flex items-center gap-1.5 md:gap-3.5 min-w-0">
        {/* Aspect Ratio selector */}
        <div className="relative" ref={ratioMenuRef}>
          <button
            type="button"
            onClick={() => setRatioOpen((v) => !v)}
            aria-expanded={ratioOpen}
            aria-label="Choisir le format de la toile"
            className="h-9 px-3 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] hover:bg-[#F4F4F5] text-xs font-medium text-[#18181B] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1D4ED8]"
          >
            <span className="font-mono tabular-nums">{activeRatio.label}</span>
            <span className="hidden sm:inline text-[#71717A] font-normal">
              {activeRatio.description}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[#71717A]" />
          </button>

          {ratioOpen && (
            <div className="absolute left-0 mt-1.5 w-48 py-1.5 bg-white border border-[#E4E4E7] rounded-xl shadow-lg z-50">
              {ASPECT_RATIO_OPTIONS.map((opt) => {
                const isSelected = opt.id === canvasConfig.aspectRatio;
                const disabledAuto = opt.id === 'auto' && !hasBackgroundImage;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={disabledAuto}
                    onClick={() => {
                      onChangeAspectRatio(opt.id);
                      setRatioOpen(false);
                    }}
                    className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#1D4ED8]/8 text-[#1D4ED8] font-semibold'
                        : disabledAuto
                          ? 'text-[#A1A1AA] cursor-not-allowed'
                          : 'text-[#18181B] hover:bg-[#F4F4F5]'
                    }`}
                  >
                    <span>{opt.description}</span>
                    <span className="font-mono tabular-nums text-[11px] opacity-80">
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-[#E4E4E7] hidden sm:block" aria-hidden="true" />

        {/* Playback + Restart + Loop duration */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onTogglePlay}
            title={isPlaying ? 'Mettre en pause (Espace)' : 'Lire la boucle (Espace)'}
            aria-label={isPlaying ? 'Mettre en pause' : 'Lire la boucle'}
            className="h-9 w-9 rounded-lg hover:bg-[#F4F4F5] text-[#18181B] flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1D4ED8]"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-[1px]" />}
          </button>

          <button
            type="button"
            onClick={onRestartLoop}
            disabled={strokeCount === 0}
            title="Rejouer depuis le début"
            aria-label="Rejouer depuis le début"
            className="h-9 w-9 rounded-lg hover:bg-[#F4F4F5] disabled:opacity-35 disabled:hover:bg-transparent text-[#52525B] hover:text-[#18181B] flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1D4ED8]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={cycleDuration}
            title="Durée de la boucle (cliquer pour changer)"
            aria-label={`Durée de boucle : ${canvasConfig.loopDurationSec} secondes`}
            className="h-9 px-2 rounded-lg hover:bg-[#F4F4F5] text-xs font-mono tabular-nums text-[#52525B] hover:text-[#18181B] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1D4ED8]"
          >
            {canvasConfig.loopDurationSec} s
          </button>
        </div>

        <div className="h-4 w-px bg-[#E4E4E7] hidden sm:block" aria-hidden="true" />

        {/* Undo / Redo / 1-click Clear All */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Annuler (Ctrl+Z)"
            aria-label="Annuler"
            className="h-9 w-9 rounded-lg hover:bg-[#F4F4F5] disabled:opacity-35 disabled:hover:bg-transparent text-[#18181B] flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1D4ED8]"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Rétablir (Ctrl+Maj+Z)"
            aria-label="Rétablir"
            className="h-9 w-9 rounded-lg hover:bg-[#F4F4F5] disabled:opacity-35 disabled:hover:bg-transparent text-[#18181B] flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1D4ED8]"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClearAllStrokes}
            disabled={strokeCount === 0}
            title="Supprimer tous les traits en 1 clic (annulable avec Ctrl+Z)"
            aria-label="Tout effacer"
            className="h-9 w-9 rounded-lg hover:bg-[#DC2626]/8 disabled:opacity-35 disabled:hover:bg-transparent text-[#52525B] hover:text-[#DC2626] flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1D4ED8]"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Zone 3: Single primary CTA */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenExport}
          className="h-9 px-4 rounded-lg bg-[#18181B] hover:bg-[#1D4ED8] text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Exporter</span>
        </button>
      </div>
    </header>
  );
};
