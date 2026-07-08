import type { MoleculeData } from './molecule';
import type { PresentationState, SavedPose } from './presentation';

export interface RecentFileEntry {
  path: string;
  name: string;
}

export interface SessionTabRecord {
  id: string;
  path: string;
  displayName: string;
  lastOpenedAt: string;
}

export interface SessionTabsEnvelope {
  version: 1;
  activeTabId: string | null;
  tabs: SessionTabRecord[];
}

export interface MoleculeTab extends SessionTabRecord {
  molecule?: MoleculeData;
  presentationState?: PresentationState | null;
}

export interface PoseLibraryEntry {
  id: string;
  name: string;
  moleculePath: string;
  moleculeDisplayName: string;
  moleculeHash: string;
  pose: SavedPose;
  previewImagePath: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  notes: string;
  atomCount?: number | null;
  formula?: string | null;
  sourceFormat?: string | null;
}
