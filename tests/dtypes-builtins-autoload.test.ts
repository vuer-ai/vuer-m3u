import { describe, it, expect } from 'vitest';
// Import from the public dtypes entry — DO NOT call registerDtype or
// __resetDtypeRegistry in this file. This test exists specifically to
// catch the case where a bundler tree-shakes the built-in registration
// away, leaving an empty registry at runtime (as happened between v0.1.2
// and v0.1.3 on the production build of doc-site-dreamlake).
import { getDtype, hasDtype, listDtypes } from '../src/dtypes';

const BUILTIN_IDS = [
  'video',
  'audio',
  'subtitle',
  'scalar',
  'vector',
  'imu_6dof',
  'joint_angles',
  'pose_6dof',
  'image',
  'action_label',
  'marker_event',
  'detection_2d',
  'ribbon_state',
] as const;

describe('built-in dtypes are registered at module load', () => {
  it('getDtype resolves every built-in without any explicit registerDtype call', () => {
    for (const id of BUILTIN_IDS) {
      expect(hasDtype(id), `hasDtype(${id}) should be true at module load`).toBe(true);
      expect(getDtype(id)?.id).toBe(id);
    }
  });

  it('listDtypes contains at least the 13 built-ins on first access', () => {
    const ids = listDtypes().map((d) => d.id);
    for (const id of BUILTIN_IDS) {
      expect(ids).toContain(id);
    }
  });

  it('joint_angles preserves its defaults (range + unit) through registration', () => {
    const spec = getDtype('joint_angles');
    expect(spec?.defaults).toEqual({ range: [-Math.PI, Math.PI], unit: 'rad' });
  });
});
