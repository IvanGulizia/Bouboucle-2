import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatedStroke,
  AnimationMode,
  AspectRatioId,
  BRUSH_PRESETS,
  BackgroundImage,
  BrushPreset,
  CanvasConfig,
  DEFAULT_STROKE_PARAMS,
  StrokeParams,
  ToolMode,
} from './types/studio';
import { useStudioHistory } from './hooks/useStudioHistory';
import { TopBar } from './components/TopBar';
import { CanvasStage } from './components/CanvasStage';
import { BottomDock } from './components/BottomDock';
import { InspectorPanel, InspectorTab } from './components/InspectorPanel';
import { ExportModal } from './components/ExportModal';

export default function App() {
  const {
    state: strokes,
    commit: commitStrokes,
    replace: replaceStrokes,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useStudioHistory<AnimatedStroke[]>([]);

  const [activeBrush, setActiveBrush] = useState<StrokeParams>(DEFAULT_STROKE_PARAMS);
  const [activePresetId, setActivePresetId] = useState<string | null>(BRUSH_PRESETS[0].id);
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>('draw');
  const [isPlaying, setIsPlaying] = useState(true);

  const [canvasConfig, setCanvasConfig] = useState<CanvasConfig>({
    aspectRatio: '1:1',
    backgroundColor: '#FAF9F6',
    loopDurationSec: 2,
  });

  const [backgroundImage, setBackgroundImage] = useState<BackgroundImage | null>(null);
  const [loadedImageElement, setLoadedImageElement] = useState<HTMLImageElement | null>(null);

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('stroke');
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousObjectUrlRef = useRef<string | null>(null);
  const sliderDirtyRef = useRef(false);

  const selectedStroke = useMemo(
    () => (selectedStrokeId ? strokes.find((s) => s.id === selectedStrokeId) ?? null : null),
    [strokes, selectedStrokeId]
  );

  useEffect(() => {
    if (selectedStrokeId && !selectedStroke) {
      setSelectedStrokeId(null);
    }
  }, [selectedStrokeId, selectedStroke]);

  useEffect(() => {
    return () => {
      if (previousObjectUrlRef.current) {
        URL.revokeObjectURL(previousObjectUrlRef.current);
      }
    };
  }, []);

  const effectiveParams: StrokeParams = selectedStroke ? selectedStroke.params : activeBrush;

  // Determine whether effectiveParams still matches a known preset
  const matchedPresetId = useMemo(() => {
    if (!selectedStroke) return activePresetId;
    const found = BRUSH_PRESETS.find((preset) =>
      (Object.keys(preset.params) as (keyof StrokeParams)[]).every(
        (key) => selectedStroke.params[key] === preset.params[key]
      )
    );
    return found ? found.id : null;
  }, [selectedStroke, activePresetId]);

  const handleImportImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        if (previousObjectUrlRef.current) {
          URL.revokeObjectURL(previousObjectUrlRef.current);
        }
        previousObjectUrlRef.current = objectUrl;
        setLoadedImageElement(img);
        setBackgroundImage({
          src: objectUrl,
          name: file.name || 'Image importée',
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          opacity: 1,
          fit: 'contain',
          scale: 1,
          offsetX: 0,
          offsetY: 0,
        });
        if (strokes.length === 0) {
          setCanvasConfig((prev) => ({ ...prev, aspectRatio: 'auto' }));
        }
        setInspectorTab('canvas');
        setInspectorOpen(true);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
      };
      img.src = objectUrl;
    },
    [strokes.length]
  );

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleImportImageFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleImportImageFile]);

  const handleAddStroke = useCallback(
    (stroke: AnimatedStroke) => {
      commitStrokes((prev) => [...prev, stroke]);
    },
    [commitStrokes]
  );

  const handleEraseStrokeIds = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      commitStrokes((prev) => prev.filter((s) => !idSet.has(s.id)));
      if (selectedStrokeId && idSet.has(selectedStrokeId)) {
        setSelectedStrokeId(null);
      }
    },
    [commitStrokes, selectedStrokeId]
  );

  const handleSelectStroke = useCallback((id: string | null) => {
    setSelectedStrokeId(id);
    if (id) {
      setInspectorTab('stroke');
      setInspectorOpen(true);
    }
  }, []);

  const handleUpdateParams = useCallback(
    (patch: Partial<StrokeParams>, commitHistory = true) => {
      const keys = Object.keys(patch) as (keyof StrokeParams)[];
      const hasKeys = keys.length > 0;

      // Clear active preset highlight when modifying structural brush params (keep highlight if only color changes)
      if (hasKeys && !selectedStrokeId && keys.some((k) => k !== 'color')) {
        setActivePresetId(null);
      }

      if (selectedStrokeId) {
        if (!hasKeys) {
          sliderDirtyRef.current = false;
          return;
        }
        const applyUpdate = (prev: AnimatedStroke[]) =>
          prev.map((s) =>
            s.id === selectedStrokeId ? { ...s, params: { ...s.params, ...patch } } : s
          );

        if (commitHistory) {
          sliderDirtyRef.current = false;
          commitStrokes(applyUpdate);
        } else if (!sliderDirtyRef.current) {
          sliderDirtyRef.current = true;
          commitStrokes(applyUpdate);
        } else {
          replaceStrokes(applyUpdate);
        }
      } else if (hasKeys) {
        setActiveBrush((prev) => ({ ...prev, ...patch }));
      }
    },
    [selectedStrokeId, commitStrokes, replaceStrokes]
  );

  const handleSelectPreset = useCallback(
    (preset: BrushPreset) => {
      const patch = preset.params;
      if (selectedStrokeId) {
        commitStrokes((prev) =>
          prev.map((s) =>
            s.id === selectedStrokeId ? { ...s, params: { ...s.params, ...patch } } : s
          )
        );
      } else {
        setActiveBrush((prev) => ({ ...prev, ...patch }));
        setActivePresetId(preset.id);
        setToolMode('draw');
      }
    },
    [selectedStrokeId, commitStrokes]
  );

  const handleApplyParamsToAll = useCallback(() => {
    const targetParams = { ...effectiveParams };
    commitStrokes((prev) => prev.map((s) => ({ ...s, params: { ...targetParams } })));
    setActiveBrush(targetParams);
  }, [effectiveParams, commitStrokes]);

  const handleDuplicateSelected = useCallback(() => {
    if (!selectedStroke) return;
    const offset = 24;
    const duplicated: AnimatedStroke = {
      ...selectedStroke,
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      seed: Math.floor(Math.random() * 100000),
      points: selectedStroke.points.map((p) => ({
        ...p,
        x: p.x + offset,
        y: p.y + offset,
      })),
      params: { ...selectedStroke.params },
    };
    commitStrokes((prev) => [...prev, duplicated]);
    setSelectedStrokeId(duplicated.id);
  }, [selectedStroke, commitStrokes]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedStrokeId) return;
    commitStrokes((prev) => prev.filter((s) => s.id !== selectedStrokeId));
    setSelectedStrokeId(null);
  }, [selectedStrokeId, commitStrokes]);

  const handleClearAllStrokes = useCallback(() => {
    commitStrokes([]);
    setSelectedStrokeId(null);
  }, [commitStrokes]);

  const handleTriggerFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportOrEditImage = useCallback(() => {
    if (!backgroundImage) {
      handleTriggerFilePicker();
      return;
    }
    if (toolMode === 'image') {
      setToolMode('draw');
    } else {
      setToolMode('image');
      setInspectorTab('canvas');
      setInspectorOpen(true);
    }
  }, [backgroundImage, toolMode, handleTriggerFilePicker]);

  const handleUpdateImage = useCallback((patch: Partial<BackgroundImage>) => {
    setBackgroundImage((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const handleResetImageTransform = useCallback(() => {
    setBackgroundImage((prev) => (prev ? { ...prev, scale: 1, offsetX: 0, offsetY: 0 } : prev));
  }, []);

  const handleRemoveImage = useCallback(() => {
    if (previousObjectUrlRef.current) {
      URL.revokeObjectURL(previousObjectUrlRef.current);
      previousObjectUrlRef.current = null;
    }
    setBackgroundImage(null);
    setLoadedImageElement(null);
    if (toolMode === 'image') {
      setToolMode('draw');
    }
    if (canvasConfig.aspectRatio === 'auto') {
      setCanvasConfig((prev) => ({ ...prev, aspectRatio: '1:1' }));
    }
  }, [toolMode, canvasConfig.aspectRatio]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (exportModalOpen) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((v) => !v);
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'p':
          setToolMode('draw');
          break;
        case 'v':
          setToolMode('select');
          break;
        case 'e':
          setToolMode('erase');
          break;
        case 'escape':
          setSelectedStrokeId(null);
          if (toolMode === 'image') setToolMode('draw');
          break;
        case 'backspace':
        case 'delete':
          if (selectedStrokeId) {
            e.preventDefault();
            handleDeleteSelected();
          }
          break;
        case '[':
          handleUpdateParams({ width: Math.max(2, effectiveParams.width - 2) }, true);
          break;
        case ']':
          handleUpdateParams({ width: Math.min(48, effectiveParams.width + 2) }, true);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    exportModalOpen,
    undo,
    redo,
    selectedStrokeId,
    handleDeleteSelected,
    handleUpdateParams,
    effectiveParams.width,
    toolMode,
  ]);

  return (
    <div className="h-full w-full flex flex-col bg-[#F4F4F2] overflow-hidden select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleImportImageFile(file);
          }
          e.target.value = '';
        }}
      />

      <TopBar
        canvasConfig={canvasConfig}
        hasBackgroundImage={Boolean(backgroundImage)}
        isPlaying={isPlaying}
        canUndo={canUndo}
        canRedo={canRedo}
        onTogglePlay={() => setIsPlaying((v) => !v)}
        onChangeAspectRatio={(ratio: AspectRatioId) =>
          setCanvasConfig((prev) => ({ ...prev, aspectRatio: ratio }))
        }
        onChangeLoopDuration={(seconds: number) =>
          setCanvasConfig((prev) => ({ ...prev, loopDurationSec: seconds }))
        }
        onUndo={undo}
        onRedo={redo}
        onOpenExport={() => setExportModalOpen(true)}
      />

      <main className="relative flex-1 min-h-0 flex">
        <CanvasStage
          strokes={strokes}
          backgroundImage={backgroundImage}
          loadedImageElement={loadedImageElement}
          canvasConfig={canvasConfig}
          toolMode={toolMode}
          activeBrush={activeBrush}
          selectedStrokeId={selectedStrokeId}
          isPlaying={isPlaying}
          onAddStroke={handleAddStroke}
          onSelectStroke={handleSelectStroke}
          onEraseStrokeIds={handleEraseStrokeIds}
          onUpdateImageTransform={handleUpdateImage}
          onImportImageFile={handleImportImageFile}
          onTriggerFilePicker={handleTriggerFilePicker}
        />

        <InspectorPanel
          isOpen={inspectorOpen}
          activeTab={inspectorTab}
          activeParams={effectiveParams}
          activePresetId={matchedPresetId}
          isEditingSelectedStroke={Boolean(selectedStroke)}
          strokeCount={strokes.length}
          backgroundImage={backgroundImage}
          canvasConfig={canvasConfig}
          isPanningImageTool={toolMode === 'image'}
          onChangeTab={setInspectorTab}
          onClose={() => setInspectorOpen(false)}
          onSelectPreset={handleSelectPreset}
          onUpdateParams={handleUpdateParams}
          onApplyParamsToAll={handleApplyParamsToAll}
          onDuplicateSelected={handleDuplicateSelected}
          onDeleteSelected={handleDeleteSelected}
          onDeselectStroke={() => setSelectedStrokeId(null)}
          onClearAllStrokes={handleClearAllStrokes}
          onChangeBackgroundColor={(hex) =>
            setCanvasConfig((prev) => ({ ...prev, backgroundColor: hex }))
          }
          onTriggerFilePicker={handleTriggerFilePicker}
          onUpdateImage={handleUpdateImage}
          onResetImageTransform={handleResetImageTransform}
          onTogglePanImageTool={() =>
            setToolMode((m) => (m === 'image' ? 'draw' : 'image'))
          }
          onRemoveImage={handleRemoveImage}
        />
      </main>

      <BottomDock
        toolMode={toolMode}
        activeParams={effectiveParams}
        activePresetId={matchedPresetId}
        hasBackgroundImage={Boolean(backgroundImage)}
        inspectorOpen={inspectorOpen}
        onChangeTool={(tool) => {
          setToolMode(tool);
          if (tool !== 'select') setSelectedStrokeId(null);
        }}
        onChangeColor={(hex) => handleUpdateParams({ color: hex }, true)}
        onChangeMode={(mode: AnimationMode) => handleUpdateParams({ mode }, true)}
        onSelectPreset={handleSelectPreset}
        onToggleInspector={() => setInspectorOpen((v) => !v)}
        onImportOrEditImage={handleImportOrEditImage}
      />

      <ExportModal
        isOpen={exportModalOpen}
        strokes={strokes}
        backgroundImage={backgroundImage}
        loadedImageElement={loadedImageElement}
        canvasConfig={canvasConfig}
        onClose={() => setExportModalOpen(false)}
      />
    </div>
  );
}
