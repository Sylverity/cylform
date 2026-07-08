import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { defaultAppSettings } from '../types';
import type { AppDataPaths, AppSettings } from '../types';

interface UseAppSettingsOptions {
  onError: (message: string) => void;
  /** Runs after settings persist (save or reset), before the status flips to done. */
  onAfterPersist?: () => void | Promise<void>;
}

export function useAppSettings(options: UseAppSettingsOptions) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const [appDataPaths, setAppDataPaths] = useState<AppDataPaths | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);
  const appSettingsRef = useRef<AppSettings>(defaultAppSettings());

  useEffect(() => {
    appSettingsRef.current = appSettings;
  }, [appSettings]);

  // Theme management
  useEffect(() => {
    const theme = appSettings.app.theme;
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [appSettings.app.theme]);

  const refreshAppSettings = useCallback(async () => {
    try {
      const settings = await invoke<AppSettings>('get_app_settings');
      appSettingsRef.current = settings;
      setAppSettings(settings);
    } catch (err) {
      console.warn('Could not load app settings', err);
    }
  }, []);

  const refreshAppDataPaths = useCallback(async () => {
    try {
      setAppDataPaths(await invoke<AppDataPaths>('get_app_data_paths'));
    } catch (err) {
      console.warn('Could not load app data paths', err);
    }
  }, []);

  const saveAppSettings = useCallback(async (nextSettings: AppSettings) => {
    appSettingsRef.current = nextSettings;
    setAppSettings(nextSettings);
    setSettingsStatus('Saving...');
    try {
      const saved = await invoke<AppSettings>('save_app_settings', { settings: nextSettings });
      appSettingsRef.current = saved;
      setAppSettings(saved);
      await optionsRef.current.onAfterPersist?.();
      setSettingsStatus('Saved');
      window.setTimeout(() => setSettingsStatus(null), 1400);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSettingsStatus('Could not save settings');
      optionsRef.current.onError(message);
    }
  }, []);

  const resetAppSettings = useCallback(async () => {
    setSettingsStatus('Resetting...');
    try {
      const reset = await invoke<AppSettings>('reset_app_settings');
      appSettingsRef.current = reset;
      setAppSettings(reset);
      await optionsRef.current.onAfterPersist?.();
      setSettingsStatus('Defaults restored');
      window.setTimeout(() => setSettingsStatus(null), 1400);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSettingsStatus('Could not reset settings');
      optionsRef.current.onError(message);
    }
  }, []);

  return {
    appSettings,
    setAppSettings,
    appSettingsRef,
    appDataPaths,
    settingsStatus,
    refreshAppSettings,
    refreshAppDataPaths,
    saveAppSettings,
    resetAppSettings,
  };
}
