import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { MoleculeTab, SessionTabsEnvelope } from '../types';

export function createTabId(): string {
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Owns the open molecule tab list and persists it as the saved session
 * once the initial session restore has completed.
 */
export function useWorkspaceTabs() {
  const [moleculeTabs, setMoleculeTabs] = useState<MoleculeTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [hasLoadedSessionTabs, setHasLoadedSessionTabs] = useState(false);
  const skipNextSessionSave = useRef(false);

  useEffect(() => {
    if (!hasLoadedSessionTabs) return;
    if (skipNextSessionSave.current) {
      skipNextSessionSave.current = false;
      return;
    }
    const session: SessionTabsEnvelope = {
      version: 1,
      activeTabId,
      tabs: moleculeTabs.map(({ id, path, displayName, lastOpenedAt }) => ({
        id,
        path,
        displayName,
        lastOpenedAt,
      })),
    };
    void invoke('save_session_tabs', { session }).catch((err) => {
      console.warn('Could not save session tabs', err);
    });
  }, [activeTabId, hasLoadedSessionTabs, moleculeTabs]);

  return {
    moleculeTabs,
    setMoleculeTabs,
    activeTabId,
    setActiveTabId,
    hasLoadedSessionTabs,
    setHasLoadedSessionTabs,
    skipNextSessionSave,
  };
}
