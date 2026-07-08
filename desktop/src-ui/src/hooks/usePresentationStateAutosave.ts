import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { MoleculeData, MoleculeTab, PresentationState } from '../types';

interface UsePresentationStateAutosaveOptions {
  currentPath: string | null;
  activeTabId: string | null;
  autosaveEnabled: boolean;
  moleculeData: MoleculeData | null;
  buildPresentationState: () => PresentationState;
  setMoleculeTabs: Dispatch<SetStateAction<MoleculeTab[]>>;
  onError: (message: string) => void;
}

/**
 * Debounced autosave of the current presentation state. Owns the
 * "is a programmatic apply in flight" and "has this file's state loaded"
 * flags that gate whether edits should be persisted.
 */
export function usePresentationStateAutosave(options: UsePresentationStateAutosaveOptions) {
  const {
    currentPath,
    activeTabId,
    autosaveEnabled,
    moleculeData,
    buildPresentationState,
    setMoleculeTabs,
  } = options;

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const isApplyingPresentationState = useRef(false);
  const hasLoadedPresentationState = useRef(false);
  const saveStateTimer = useRef<number | null>(null);

  const cancelPendingAutosave = useCallback(() => {
    if (saveStateTimer.current) {
      window.clearTimeout(saveStateTimer.current);
      saveStateTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!currentPath || !hasLoadedPresentationState.current || isApplyingPresentationState.current) return;
    if (!autosaveEnabled) return;
    if (saveStateTimer.current) {
      window.clearTimeout(saveStateTimer.current);
    }
    const state = buildPresentationState();
    if (activeTabId) {
      setMoleculeTabs((current) => current.map((tab) => (
        tab.id === activeTabId ? { ...tab, molecule: moleculeData ?? tab.molecule, presentationState: state } : tab
      )));
    }
    saveStateTimer.current = window.setTimeout(() => {
      void invoke('save_presentation_state', { path: currentPath, state }).catch((err) => {
        optionsRef.current.onError(err instanceof Error ? err.message : String(err));
      });
    }, 350);
    return () => {
      if (saveStateTimer.current) {
        window.clearTimeout(saveStateTimer.current);
      }
    };
  }, [
    activeTabId,
    autosaveEnabled,
    buildPresentationState,
    currentPath,
    moleculeData,
    setMoleculeTabs,
  ]);

  return {
    isApplyingPresentationState,
    hasLoadedPresentationState,
    cancelPendingAutosave,
  };
}
