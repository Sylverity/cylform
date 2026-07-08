import { describe, expect, it } from 'vitest';
// These fixtures are shared with the Rust backend tests in
// desktop/src-tauri/src/main.rs so default settings and presentation
// camera state cannot drift between the two languages.
import settingsFixture from '../../shared-fixtures/default-app-settings.json';
import camerasFixture from '../../shared-fixtures/default-presentation-cameras.json';
import { defaultViewOptionsForProfile } from './persistence';
import { defaultAppSettings, type RenderProfileId } from './types';

describe('shared golden defaults', () => {
  it('default app settings match the shared fixture', () => {
    expect(defaultAppSettings()).toEqual(settingsFixture);
  });

  it('default presentation cameras match the shared fixture per render profile', () => {
    const cameras = camerasFixture as Record<string, unknown>;
    const profiles: RenderProfileId[] = ['cylview', 'ball-stick', 'houkmol'];
    for (const profile of profiles) {
      expect(
        defaultViewOptionsForProfile(profile, defaultAppSettings()),
        `default camera drifted from the shared fixture for profile ${profile}`,
      ).toEqual(cameras[profile]);
    }
  });
});
