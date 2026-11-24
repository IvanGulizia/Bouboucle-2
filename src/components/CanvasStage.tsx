import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import {
  AnimatedStroke,
  BackgroundImage,
  CanvasConfig,
  StrokeParams,
  StrokePoint,
  ToolMode,
  WORLD_REF_HEIGHT,
} from '../types/studio';
import {
  canvasToWorld,
  createAnimatedStroke,
  getEffectiveAspectRatio,
  hitTestStrokes,
} from '../engine/geometry';
import { renderScene } from '../engine/renderer';

interface CanvasStageProps {
  strokes: AnimatedStroke[];
  backgroundImage: BackgroundImage | null;
  loadedImageElement: HTMLImageElement | null;
  canvasConfig: CanvasConfig;
  toolMode: ToolMode;
  activeBrush: StrokeParams;
  selectedStrokeId: string | null;
  isPlaying: boolean;
  onAddStroke: (stroke: AnimatedStroke) => void;
  onSelectStroke: (strokeId: string | null) => void;
  onEraseStrokeIds: (ids: string[]) => void;
  onUpdateImageTransform: (patch: Partial<Pick<BackgroundImage, 'offsetX' | 'offsetY' | 'scale'>>) => void;
  onImportImageFile: (file: File) => void;
  onTriggerFilePicker: () => void;
}

export const CanvasStage: React.FC<CanvasStageProps> = ({
  strokes,
  backgroundImage,
  loadedImageElement,
  canvasConfig,
  toolMode,
  activeBrush,
  selectedStrokeId,
  isPlaying,
  onAddStroke,
  onSelectStroke,
  onEraseStrokeIds,
  onUpdateImageTransform,
  onImportImageFile,
  onTriggerFilePicker,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 640,
    height: 640,
  });
  const [isDragOver, setIsDragOver] = useState(false);

  // Refs for smooth 60fps rendering without React re-render overhead
  const draftPointsRef = useRef<StrokePoint[]>([]);
  const isDrawingRef = useRef(false);
  const isErasingRef = useRef(false);
  const pendingEraseIdsRef = useRef<Set<string>>(new Set());
  const isPanningImageRef = useRef(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; offsetX: number; offsetY: number } | null>(
    null
  );
  const phaseRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);

  const latestPropsRef = useRef({
    strokes,
    backgroundImage,
    loadedImageElement,
    canvasConfig,
    activeBrush,
    selectedStrokeId,
    isPlaying,
  });

  latestPropsRef.current = {
    strokes,
    backgroundImage,
    loadedImageElement,
    canvasConfig,
    activeBrush,
    selectedStrokeId,
    isPlaying,
  };

  const effectiveRatio = getEffectiveAspectRatio(canvasConfig.aspectRatio, backgroundImage);

  // Compute responsive artboard dimensions inside the workspace container
  const recomputeStageSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const padX = rect.width < 640 ? 24 : 72;
    const padTop = rect.width < 640 ? 20 : 40;
    const padBottom = rect.width < 640 ? 104 : 112; // Breathing room above floating bottom dock

    const availW = Math.max(220, rect.width - padX);
    const availH = Math.max(220, rect.height - padTop - padBottom);

    let width = availW;
    let height = width / effectiveRatio;
    if (height > availH) {
      height = availH;
      width = height * effectiveRatio;
    }

    setStageSize({
      width: Math.round(width),
      height: Math.round(height),
    });
  }, [effectiveRatio]);

  useEffect(() => {
    recomputeStageSize();
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => recomputeStageSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [recomputeStageSize]);

  // Continuous 60fps animation render loop
  useEffect(() => {
    let rafId = 0;

    const frame = (now: number) => {
      const state = latestPropsRef.current;
      if (lastTimeRef.current !== null && state.isPlaying) {
        const dtSec = (now - lastTimeRef.current) / 1000;
        const loopSec = Math.max(0.25, state.canvasConfig.loopDurationSec);
        phaseRef.current = (phaseRef.current + dtSec / loopSec) % 1;
      }
      lastTimeRef.current = now;

      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const targetW = Math.max(1, Math.round(stageSize.width * dpr));
        const targetH = Math.max(1, Math.round(stageSize.height * dpr));
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Filter out strokes being actively erased in the current swipe for instant visual feedback
          const erasedSet = pendingEraseIdsRef.current;
          const visibleStrokes =
            erasedSet.size > 0
              ? state.strokes.filter((s) => !erasedSet.has(s.id))
              : state.strokes;

          renderScene(
            ctx,
            targetW,
            targetH,
            {
              strokes: visibleStrokes,
              activeDraftPoints: isDrawingRef.current ? draftPointsRef.current : undefined,
              activeDraftColor: state.activeBrush.color,
              activeDraftWidth: state.activeBrush.width,
              activeDraftOpacity: state.activeBrush.opacity,
              backgroundImage: state.backgroundImage,
              loadedImageElement: state.loadedImageElement,
              canvasConfig: state.canvasConfig,
              selectedStrokeId: state.selectedStrokeId,
            },
            phaseRef.current
          );
        }
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [stageSize]);

  const pointerToWorld = (e: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { x, y } = canvasToWorld(cx, cy, rect.width, rect.height);
    // Normalize pressure (mouse reports 0.5 or 0 depending on browser)
    const rawPressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
    return { x, y, pressure: rawPressure, time: performance.now() };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    if (toolMode === 'image') {
      if (!backgroundImage) return;
      isPanningImageRef.current = true;
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        offsetX: backgroundImage.offsetX,
        offsetY: backgroundImage.offsetY,
      };
      return;
    }

    const pt = pointerToWorld(e);

    if (toolMode === 'select') {
      const hit = hitTestStrokes(pt.x, pt.y, strokes, 16);
      onSelectStroke(hit ? hit.id : null);
      return;
    }

    if (toolMode === 'erase') {
      isErasingRef.current = true;
      pendingEraseIdsRef.current = new Set();
      const hit = hitTestStrokes(pt.x, pt.y, strokes, 18);
      if (hit) {
        pendingEraseIdsRef.current.add(hit.id);
      }
      return;
    }

    // Draw tool
    if (selectedStrokeId) {
      onSelectStroke(null);
    }
    isDrawingRef.current = true;
    draftPointsRef.current = [pt];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanningImageRef.current && panStartRef.current && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const worldPerPx = WORLD_REF_HEIGHT / rect.height;
      const dx = (e.clientX - panStartRef.current.clientX) * worldPerPx;
      const dy = (e.clientY - panStartRef.current.clientY) * worldPerPx;
      onUpdateImageTransform({
        offsetX: Math.round(panStartRef.current.offsetX + dx),
        offsetY: Math.round(panStartRef.current.offsetY + dy),
      });
      return;
    }

    if (isErasingRef.current) {
      const pt = pointerToWorld(e);
      const hit = hitTestStrokes(pt.x, pt.y, strokes, 18);
      if (hit) {
        pendingEraseIdsRef.current.add(hit.id);
      }
      return;
    }

    if (!isDrawingRef.current) return;
    const pt = pointerToWorld(e);
    const arr = draftPointsRef.current;
    const last = arr[arr.length - 1];
    if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= 2.2) {
      arr.push(pt);
    }
  };

  const finishPointerInteraction = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }

    if (isPanningImageRef.current) {
      isPanningImageRef.current = false;
      panStartRef.current = null;
      return;
    }

    if (isErasingRef.current) {
      isErasingRef.current = false;
      const ids = Array.from(pendingEraseIdsRef.current);
      pendingEraseIdsRef.current = new Set();
      if (ids.length > 0) {
        onEraseStrokeIds(ids);
      }
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const pts = draftPointsRef.current;
    draftPointsRef.current = [];
    if (pts.length > 0) {
      const newStroke = createAnimatedStroke(pts, activeBrush);
      onAddStroke(newStroke);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (toolMode !== 'image' || !backgroundImage) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.07 : 0.93;
    const nextScale = Math.min(4, Math.max(0.25, Number((backgroundImage.scale * factor).toFixed(3))));
    onUpdateImageTransform({ scale: nextScale });
  };

  // Drag & drop image onto stage
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onImportImageFile(file);
    }
  };

  const cursorClass =
    toolMode === 'draw'
      ? 'cursor-crosshair'
      : toolMode === 'erase'
        ? 'cursor-cell'
        : toolMode === 'image'
          ? 'cursor-grab active:cursor-grabbing'
          : 'cursor-default';

  const isEmpty = strokes.length === 0 && !backgroundImage;

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden bg-[#F4F4F2] pb-20"
    >
      {/* Centered artboard frame */}
      <div
        className="relative rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.07)] ring-1 ring-black/[0.08] overflow-hidden transition-[width,height] duration-200 ease-out"
        style={{ width: stageSize.width, height: stageSize.height }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerInteraction}
          onPointerCancel={finishPointerInteraction}
          onWheel={handleWheel}
          className={`block w-full h-full touch-none select-none ${cursorClass}`}
        />

        {/* Quiet, non-blocking empty canvas cue */}
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <p className="text-sm font-medium text-[#71717A]">
              Dessinez directement sur la toile
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-[#A1A1AA]">
              <span>ou</span>
              <button
                type="button"
                onClick={onTriggerFilePicker}
                className="pointer-events-auto inline-flex items-center gap-1.5 text-[#1D4ED8] hover:underline font-medium cursor-pointer"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                importer une image / dessin
              </button>
            </div>
          </div>
        )}

        {/* Active image-panning subtle guide */}
        {toolMode === 'image' && backgroundImage && (
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-[#18181B]/80 text-white text-xs whitespace-nowrap">
            Glissez pour recadrer · Molette pour zoomer
          </div>
        )}
      </div>

      {/* Drag & drop overlay */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-4 rounded-2xl border-2 border-dashed border-[#1D4ED8] bg-[#1D4ED8]/6 backdrop-blur-[2px] flex items-center justify-center z-40">
          <div className="bg-white px-5 py-3 rounded-xl shadow-md border border-[#E4E4E7] flex items-center gap-2.5 text-sm font-medium text-[#18181B]">
            <ImagePlus className="w-4 h-4 text-[#1D4ED8]" />
            <span>Déposez votre image ou dessin ici</span>
          </div>
        </div>
      )}
    </div>
  );
};
