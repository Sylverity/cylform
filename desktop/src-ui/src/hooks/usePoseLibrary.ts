import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { displayNameForPath } from '../domain/paths';
import type { MoleculeData, PoseLibraryEntry, SavedPose } from '../types';
import type { ToastMessage } from '../components/Toast';

export interface PosePreviewJob {
  jobId: string;
  entryId: string;
  moleculePath: string;
  pose: SavedPose;
}

function createPreviewJob(entry: PoseLibraryEntry): PosePreviewJob {
  return {
    jobId: `preview_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    entryId: entry.id,
    moleculePath: entry.moleculePath,
    pose: entry.pose,
  };
}

interface UsePoseLibraryOptions {
  onError: (message: string) => void;
  onToast: (text: string, type?: ToastMessage['type']) => void;
}

/**
 * Owns the pose library entries plus the queue of preview-render jobs
 * that are processed one at a time by the offscreen PosePreviewRenderer.
 */
export function usePoseLibrary(options: UsePoseLibraryOptions) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const [poseLibrary, setPoseLibrary] = useState<PoseLibraryEntry[]>([]);
  const [previewQueue, setPreviewQueue] = useState<PosePreviewJob[]>([]);
  const [activePreviewJob, setActivePreviewJob] = useState<PosePreviewJob | null>(null);

  const refreshPoseLibrary = useCallback(async () => {
    try {
      const library = await invoke<{ version: 1; entries: PoseLibraryEntry[] }>('get_pose_library');
      setPoseLibrary(library.entries);
    } catch (err) {
      console.warn('Could not load pose library', err);
    }
  }, []);

  const queuePosePreview = useCallback((entry: PoseLibraryEntry) => {
    setPreviewQueue((current) => [...current, createPreviewJob(entry)]);
  }, []);

  const finishActivePreviewJob = useCallback(() => {
    setActivePreviewJob(null);
  }, []);

  useEffect(() => {
    if (activePreviewJob || previewQueue.length === 0) return;
    const [nextJob, ...remainingJobs] = previewQueue;
    setActivePreviewJob(nextJob);
    setPreviewQueue(remainingJobs);
  }, [activePreviewJob, previewQueue]);

  const addPoseToLibrary = useCallback(async (
    pose: SavedPose,
    moleculePath: string,
    moleculeData: MoleculeData,
  ) => {
    try {
      const entry = await invoke<PoseLibraryEntry>('save_pose_to_library', {
        name: pose.name,
        moleculePath,
        moleculeDisplayName: moleculeData.name || displayNameForPath(moleculePath),
        pose,
        tags: [],
        notes: '',
        atomCount: moleculeData.atoms.length,
        formula: null,
        sourceFormat: moleculeData.metadata.sourceFormat ?? null,
        previewImagePath: null,
      });
      setPoseLibrary((current) => [entry, ...current.filter((candidate) => candidate.id !== entry.id)]);
      queuePosePreview(entry);
      optionsRef.current.onToast(`Added ${pose.name} to Pose Library`, 'success');
    } catch (err) {
      optionsRef.current.onError(err instanceof Error ? err.message : String(err));
    }
  }, [queuePosePreview]);

  const renamePoseLibraryEntry = useCallback(async (id: string, name: string) => {
    setPoseLibrary((current) => current.map((entry) => (
      entry.id === id ? { ...entry, name } : entry
    )));
    try {
      const library = await invoke<{ version: 1; entries: PoseLibraryEntry[] }>('rename_pose_library_entry', { id, name });
      setPoseLibrary(library.entries);
    } catch (err) {
      optionsRef.current.onError(err instanceof Error ? err.message : String(err));
      void refreshPoseLibrary();
    }
  }, [refreshPoseLibrary]);

  const deletePoseLibraryEntry = useCallback(async (id: string) => {
    try {
      const library = await invoke<{ version: 1; entries: PoseLibraryEntry[] }>('delete_pose_library_entry', { id });
      setPoseLibrary(library.entries);
    } catch (err) {
      optionsRef.current.onError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const onPosePreviewCaptured = useCallback(async (job: PosePreviewJob, dataUrl: string) => {
    try {
      const updatedEntry = await invoke<PoseLibraryEntry>('save_pose_library_preview', {
        id: job.entryId,
        dataUrl,
      });
      setPoseLibrary((current) => current.map((entry) => (
        entry.id === updatedEntry.id ? updatedEntry : entry
      )));
    } catch (err) {
      console.warn('Could not save pose preview', err);
      optionsRef.current.onToast('Saved the pose, but could not generate its preview yet.', 'info');
    } finally {
      finishActivePreviewJob();
    }
  }, [finishActivePreviewJob]);

  const onPosePreviewFailed = useCallback((job: PosePreviewJob, error: string) => {
    console.warn('Could not generate pose preview', job.entryId, error);
    optionsRef.current.onToast('Saved the pose, but could not generate its preview yet.', 'info');
    finishActivePreviewJob();
  }, [finishActivePreviewJob]);

  return {
    poseLibrary,
    activePreviewJob,
    refreshPoseLibrary,
    queuePosePreview,
    addPoseToLibrary,
    renamePoseLibraryEntry,
    deletePoseLibraryEntry,
    onPosePreviewCaptured,
    onPosePreviewFailed,
  };
}
