import { describe, expect, it } from 'vitest';
import { reorderById } from './workspaceTabs';

const tabs = [
  { id: 'alpha', name: 'alpha.xyz' },
  { id: 'beta', name: 'beta.pdb' },
  { id: 'gamma', name: 'gamma.mol' },
];

describe('reorderById', () => {
  it('moves an item later in the list', () => {
    expect(reorderById(tabs, 'alpha', 'gamma').map((tab) => tab.id)).toEqual([
      'beta',
      'gamma',
      'alpha',
    ]);
  });

  it('moves an item earlier in the list', () => {
    expect(reorderById(tabs, 'gamma', 'alpha').map((tab) => tab.id)).toEqual([
      'gamma',
      'alpha',
      'beta',
    ]);
  });

  it('keeps the original list when either id is unavailable', () => {
    expect(reorderById(tabs, 'missing', 'alpha')).toBe(tabs);
    expect(reorderById(tabs, 'alpha', 'missing')).toBe(tabs);
  });
});
