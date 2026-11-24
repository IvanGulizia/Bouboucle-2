import { useCallback, useState } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

const MAX_HISTORY = 60;

/**
 * Generic immutable Undo/Redo history hook with silent present replacement
 * for live slider dragging without flooding the undo stack.
 */
export function useStudioHistory<T>(initialPresent: T) {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialPresent,
    future: [],
  });

  const commit = useCallback((updater: T | ((prev: T) => T)) => {
    setHistory((prev) => {
      const nextPresent =
        typeof updater === 'function' ? (updater as (p: T) => T)(prev.present) : updater;
      if (nextPresent === prev.present) return prev;
      const nextPast = [...prev.past, prev.present];
      if (nextPast.length > MAX_HISTORY) {
        nextPast.shift();
      }
      return {
        past: nextPast,
        present: nextPresent,
        future: [],
      };
    });
  }, []);

  /** Updates present without pushing an extra undo entry (e.g. during range drag). */
  const replace = useCallback((updater: T | ((prev: T) => T)) => {
    setHistory((prev) => {
      const nextPresent =
        typeof updater === 'function' ? (updater as (p: T) => T)(prev.present) : updater;
      if (nextPresent === prev.present) return prev;
      return {
        ...prev,
        present: nextPresent,
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      return {
        past: prev.past.slice(0, -1),
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: prev.future.slice(1),
      };
    });
  }, []);

  return {
    state: history.present,
    commit,
    replace,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
