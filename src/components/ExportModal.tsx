import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, Film, Repeat, X } from 'lucide-react';
import {
  AnimatedStroke,
  BackgroundImage,
  CanvasConfig,
  ExportSettings,
} from '../types/studio';
import { getEffectiveAspectRatio, getExportDimensions } from '../engine/geometry';
import {
  ExportProgress,
  ExportResult,
  exportSceneToGif,
  exportSceneToVideo,
  formatBytes,
  getPreferredVideoFormat,
  triggerDownload,
} from '../engine/exporter';

interface ExportModalProps {
  isOpen: boolean;
  strokes: AnimatedStroke[];
  backgroundImage: BackgroundImage | null;
  loadedImageElement: HTMLImageElement | null;
  canvasConfig: CanvasConfig;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  strokes,
  backgroundImage,
  loadedImageElement,
  canvasConfig,
  onClose,
}) => {
  const [settings, setSettings] = useState<ExportSettings>({
    format: 'gif',
    resolution: 'standard',
    fps: 24,
    videoLoops: 2,
  });

  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const videoInfo = useMemo(() => getPreferredVideoFormat(), []);

  const effectiveRatio = getEffectiveAspectRatio(canvasConfig.aspectRatio, backgroundImage);
  const { width, height } = getExportDimensions(
    effectiveRatio,
    settings.resolution,
    settings.format
  );

  // Clean up object URL when modal closes or result changes
  useEffect(() => {
    return () => {
      if (result?.url) {
        URL.revokeObjectURL(result.url);
      }
    };
  }, [result]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      abortRef.current?.abort();
      setIsExporting(false);
      setProgress(null);
      setError(null);
      setResult((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return null;
      });
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExporting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isExporting, onClose]);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setError(null);
    setResult((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });

    const controller = new AbortController();
    abortRef.current = controller;
    setIsExporting(true);
    setProgress({ currentFrame: 0, totalFrames: 1, percent: 0, stage: 'rendering' });

    const sceneState = {
      strokes,
      backgroundImage,
      loadedImageElement,
      canvasConfig,
    };

    try {
      const exportResult =
        settings.format === 'gif'
          ? await exportSceneToGif(
              sceneState,
              width,
              height,
              canvasConfig.loopDurationSec,
              settings.fps,
              (p) => setProgress(p),
              controller.signal
            )
          : await exportSceneToVideo(
              sceneState,
              width,
              height,
              canvasConfig.loopDurationSec,
              settings.fps,
              settings.videoLoops,
              (p) => setProgress(p),
              controller.signal
            );

      setResult(exportResult);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError(null);
      } else {
        setError(
          err instanceof Error ? err.message : 'Une erreur est survenue lors de l’export.'
        );
      }
    } finally {
      setIsExporting(false);
      abortRef.current = null;
    }
  };

  const handleCancelExport = () => {
    abortRef.current?.abort();
  };

  const handleDownload = () => {
    if (!result) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    triggerDownload(result.url, `ondule-${stamp}.${result.extension}`);
  };

  const totalVideoSec = canvasConfig.loopDurationSec * settings.videoLoops;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExporting) onClose();
      }}
    >
      <div className="w-full max-w-md bg-white border border-[#E4E4E7] rounded-2xl shadow-xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
          <h2 id="export-modal-title" className="text-base font-semibold text-[#18181B]">
            Exporter l’animation
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            aria-label="Fermer"
            className="h-8 w-8 rounded-lg hover:bg-[#F4F4F5] disabled:opacity-40 text-[#71717A] hover:text-[#18181B] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {result ? (
            /* Completed Export View */
            <div className="space-y-4">
              <div className="rounded-xl overflow-hidden bg-[#F4F4F2] border border-[#E4E4E7] flex items-center justify-center max-h-64">
                {result.extension === 'gif' ? (
                  <img
                    src={result.url}
                    alt="Aperçu du GIF exporté"
                    className="max-h-64 w-auto object-contain"
                  />
                ) : (
                  <video
                    src={result.url}
                    autoPlay
                    loop
                    muted
                    playsInline
                    controls
                    className="max-h-64 w-auto object-contain"
                  />
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-[#52525B]">
                <span className="inline-flex items-center gap-1.5 text-[#059669] font-medium">
                  <Check className="w-4 h-4" />
                  Export prêt
                </span>
                <span className="font-mono tabular-nums">
                  {result.extension.toUpperCase()} · {width}×{height} · {formatBytes(result.sizeBytes)}
                </span>
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="h-10 px-4 rounded-lg border border-[#E4E4E7] hover:bg-[#F4F4F5] text-xs font-medium text-[#18181B] transition-colors cursor-pointer"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex-1 h-10 px-4 rounded-lg bg-[#18181B] hover:bg-[#1D4ED8] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger (.{result.extension})</span>
                </button>
              </div>
            </div>
          ) : (
            /* Configuration & Progress View */
            <>
              {/* Format Toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#F4F4F5] rounded-xl">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      format: 'gif',
                      fps: s.fps === 30 ? 24 : s.fps,
                    }))
                  }
                  className={`h-10 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    settings.format === 'gif'
                      ? 'bg-white text-[#18181B] shadow-xs'
                      : 'text-[#71717A] hover:text-[#18181B]'
                  }`}
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span>GIF animé</span>
                </button>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setSettings((s) => ({ ...s, format: 'video', fps: 30 }))}
                  className={`h-10 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    settings.format === 'video'
                      ? 'bg-white text-[#18181B] shadow-xs'
                      : 'text-[#71717A] hover:text-[#18181B]'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Vidéo ({videoInfo.extension.toUpperCase()})</span>
                </button>
              </div>

              {/* Resolution */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#18181B]">Définition</span>
                  <span className="font-mono tabular-nums text-[#71717A]">
                    {width} × {height} px
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'standard', label: 'Standard', desc: 'Léger et rapide' },
                      { id: 'high', label: 'Haute', desc: 'Netteté maximale' },
                    ] as const
                  ).map((res) => (
                    <button
                      key={res.id}
                      type="button"
                      disabled={isExporting}
                      onClick={() => setSettings((s) => ({ ...s, resolution: res.id }))}
                      className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                        settings.resolution === res.id
                          ? 'border-[#18181B] bg-[#FAFAFA]'
                          : 'border-[#E4E4E7] hover:border-[#A1A1AA]'
                      }`}
                    >
                      <div className="text-xs font-semibold text-[#18181B]">{res.label}</div>
                      <div className="text-[11px] text-[#71717A] mt-0.5">{res.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Frame Rate */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-[#18181B] block">Fluidité</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {([12, 24, 30] as const).map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      disabled={isExporting}
                      onClick={() => setSettings((s) => ({ ...s, fps }))}
                      className={`h-9 rounded-lg border text-xs font-mono tabular-nums font-medium transition-colors cursor-pointer ${
                        settings.fps === fps
                          ? 'bg-[#18181B] text-white border-[#18181B]'
                          : 'bg-white text-[#52525B] border-[#E4E4E7] hover:border-[#A1A1AA]'
                      }`}
                    >
                      {fps} ips
                    </button>
                  ))}
                </div>
              </div>

              {/* Loop repetitions (Video only) */}
              {settings.format === 'video' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#18181B]">Répétitions de boucle</span>
                    <span className="font-mono tabular-nums text-[#71717A]">
                      Durée : {totalVideoSec} s
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([1, 2, 3] as const).map((loops) => (
                      <button
                        key={loops}
                        type="button"
                        disabled={isExporting}
                        onClick={() => setSettings((s) => ({ ...s, videoLoops: loops }))}
                        className={`h-9 rounded-lg border text-xs font-mono tabular-nums font-medium transition-colors cursor-pointer ${
                          settings.videoLoops === loops
                            ? 'bg-[#18181B] text-white border-[#18181B]'
                            : 'bg-white text-[#52525B] border-[#E4E4E7] hover:border-[#A1A1AA]'
                        }`}
                      >
                        {loops}× ({canvasConfig.loopDurationSec * loops} s)
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary line */}
              <div className="text-xs text-[#71717A] flex items-center justify-between pt-1">
                <span>
                  Boucle infinie · {canvasConfig.aspectRatio === 'auto' ? 'Ratio image' : canvasConfig.aspectRatio}
                </span>
                <span className="font-mono tabular-nums">
                  {settings.format === 'gif'
                    ? `${Math.round(canvasConfig.loopDurationSec * settings.fps)} images`
                    : `${totalVideoSec} s · ${videoInfo.label}`}
                </span>
              </div>

              {/* Error banner */}
              {error && (
                <p className="text-xs text-[#DC2626] bg-[#DC2626]/8 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              {/* Progress or Export CTA */}
              {isExporting && progress ? (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#18181B] font-medium">
                      {progress.stage === 'finalizing'
                        ? 'Finalisation du fichier…'
                        : settings.format === 'gif'
                          ? 'Encodage du GIF…'
                          : 'Enregistrement de la vidéo…'}
                    </span>
                    <span className="font-mono tabular-nums text-[#71717A]">
                      {progress.percent} % · {progress.currentFrame}/{progress.totalFrames}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-[#F4F4F5] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1D4ED8] transition-[width] duration-150"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelExport}
                    className="w-full h-9 rounded-lg border border-[#E4E4E7] hover:bg-[#F4F4F5] text-xs font-medium text-[#52525B] transition-colors cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleStartExport}
                  className="w-full h-11 rounded-xl bg-[#18181B] hover:bg-[#1D4ED8] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    Générer le {settings.format === 'gif' ? 'GIF animé' : `fichier ${videoInfo.extension.toUpperCase()}`}
                  </span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
