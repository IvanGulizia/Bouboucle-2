import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { renderScene, SceneRenderState } from './renderer';

export interface ExportProgress {
  currentFrame: number;
  totalFrames: number;
  percent: number;
  stage: 'rendering' | 'encoding' | 'finalizing';
}

export interface ExportResult {
  blob: Blob;
  url: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Yields to the browser event loop so the export progress UI updates smoothly
 * and cancellation stays responsive.
 */
function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Encodes a seamless looping animated GIF completely client-side via gifenc.
 */
export async function exportSceneToGif(
  state: SceneRenderState,
  width: number,
  height: number,
  loopDurationSec: number,
  fps: number,
  onProgress: (progress: ExportProgress) => void,
  signal?: AbortSignal
): Promise<ExportResult> {
  const totalFrames = Math.max(4, Math.round(loopDurationSec * fps));
  const frameDelayMs = Math.round(1000 / fps);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Impossible d’initialiser le contexte 2D pour l’export GIF.');
  }

  const gif = GIFEncoder();

  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) {
      throw new DOMException('Export annulé', 'AbortError');
    }

    const phase = i / totalFrames;
    renderScene(ctx, width, height, state, phase, { isExport: true });

    const { data } = ctx.getImageData(0, 0, width, height);
    const palette = quantize(data, 256, { format: 'rgb565' });
    const indexed = applyPalette(data, palette, 'rgb565');

    gif.writeFrame(indexed, width, height, {
      palette,
      delay: frameDelayMs,
      repeat: 0, // Infinite seamless loop
    });

    onProgress({
      currentFrame: i + 1,
      totalFrames,
      percent: Math.round(((i + 1) / totalFrames) * 100),
      stage: 'encoding',
    });

    // Yield every frame to keep UI interactive
    await nextTick();
  }

  onProgress({
    currentFrame: totalFrames,
    totalFrames,
    percent: 100,
    stage: 'finalizing',
  });

  gif.finish();
  const bytes = gif.bytes();
  // Create a clean ArrayBuffer copy for Blob compatibility across strict TS lib versions
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'image/gif' });

  return {
    blob,
    url: URL.createObjectURL(blob),
    extension: 'gif',
    mimeType: 'image/gif',
    sizeBytes: blob.size,
  };
}

/**
 * Detects the best browser-supported video MIME type (preferring MP4 H.264 when available).
 */
export function getPreferredVideoFormat(): { mimeType: string; extension: string; label: string } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: '', extension: 'webm', label: 'WebM' };
  }

  const candidates = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4', label: 'MP4 (H.264)' },
    { mimeType: 'video/mp4', extension: 'mp4', label: 'MP4' },
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm', label: 'WebM (VP9)' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm', label: 'WebM (VP8)' },
    { mimeType: 'video/webm', extension: 'webm', label: 'WebM' },
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }

  return { mimeType: '', extension: 'webm', label: 'WebM' };
}

/**
 * Records a high-bitrate seamless loop video using MediaRecorder + Canvas captureStream.
 */
export async function exportSceneToVideo(
  state: SceneRenderState,
  width: number,
  height: number,
  loopDurationSec: number,
  fps: number,
  videoLoops: number,
  onProgress: (progress: ExportProgress) => void,
  signal?: AbortSignal
): Promise<ExportResult> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Votre navigateur ne prend pas en charge l’enregistrement vidéo.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Impossible d’initialiser le contexte 2D pour l’export vidéo.');
  }

  const { mimeType, extension } = getPreferredVideoFormat();
  const stream = canvas.captureStream(fps);
  const recorderOptions: MediaRecorderOptions = {
    videoBitsPerSecond: 6_000_000,
    ...(mimeType ? { mimeType } : {}),
  };

  const recorder = new MediaRecorder(stream, recorderOptions);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  const totalDurationMs = loopDurationSec * videoLoops * 1000;
  const totalFrames = Math.max(1, Math.round(loopDurationSec * videoLoops * fps));

  // Render initial frame before starting recorder so frame 0 is never black
  renderScene(ctx, width, height, state, 0, { isExport: true });

  return new Promise<ExportResult>((resolve, reject) => {
    let rafId = 0;
    let settled = false;

    const cleanup = () => {
      cancelAnimationFrame(rafId);
      stream.getTracks().forEach((t) => t.stop());
    };

    const handleAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      reject(new DOMException('Export annulé', 'AbortError'));
    };

    if (signal) {
      if (signal.aborted) {
        handleAbort();
        return;
      }
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    recorder.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Erreur lors de l’encodage vidéo.'));
    };

    recorder.onstop = () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (signal) {
        signal.removeEventListener('abort', handleAbort);
      }
      const finalMime = recorder.mimeType || mimeType || 'video/webm';
      const blob = new Blob(chunks, { type: finalMime });
      const actualExt = finalMime.includes('mp4') ? 'mp4' : extension;
      resolve({
        blob,
        url: URL.createObjectURL(blob),
        extension: actualExt,
        mimeType: finalMime,
        sizeBytes: blob.size,
      });
    };

    recorder.start(100);
    const startTime = performance.now();

    const step = (now: number) => {
      if (settled) return;
      const elapsedMs = now - startTime;

      if (elapsedMs >= totalDurationMs) {
        onProgress({
          currentFrame: totalFrames,
          totalFrames,
          percent: 100,
          stage: 'finalizing',
        });
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
        return;
      }

      const loopMs = loopDurationSec * 1000;
      const loopIndex = Math.floor(elapsedMs / loopMs);
      const phase = (elapsedMs % loopMs) / loopMs;
      renderScene(ctx, width, height, state, phase, { isExport: true, loopIndex });

      const currentFrame = Math.min(totalFrames, Math.floor((elapsedMs / 1000) * fps) + 1);
      onProgress({
        currentFrame,
        totalFrames,
        percent: Math.min(99, Math.round((elapsedMs / totalDurationMs) * 100)),
        stage: 'rendering',
      });

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
  });
}

/**
 * Triggers a clean browser file download from an ExportResult.
 */
export function triggerDownload(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

/**
 * Formats bytes into human-readable Ko / Mo strings.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}
