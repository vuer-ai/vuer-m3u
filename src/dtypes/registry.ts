import type { DtypeId, DtypeSpec } from './types';
import { BUILTIN_DTYPES } from './builtin';

/**
 * Module-scoped dtype registry. Parallel to `registerDecoder` in
 * `core/decoders/index.ts` — simple, global, non-magical.
 *
 * Built-in specs are baked into the Map's initial value — NOT via a
 * separate top-level side-effect loop. This matters because the package
 * declares `sideEffects: ["*.css"]`, so production bundlers (Rollup /
 * Vite) would tree-shake any stand-alone `registerDtype(spec)` calls out
 * of the emitted bundle, leaving the registry empty at runtime.
 *
 * Apps with custom dtypes still call `registerDtype(...)` at bootstrap.
 */
const DTYPES = new Map<DtypeId, DtypeSpec>(
  BUILTIN_DTYPES.map((spec) => [spec.id, spec] as const),
);

export function registerDtype(spec: DtypeSpec): void {
  if (!spec.id) {
    throw new Error('[vuer-m3u dtypes] registerDtype: spec.id is required.');
  }
  DTYPES.set(spec.id, spec);
}

export function getDtype(id: DtypeId): DtypeSpec | undefined {
  return DTYPES.get(id);
}

export function listDtypes(): readonly DtypeSpec[] {
  return [...DTYPES.values()];
}

export function hasDtype(id: DtypeId): boolean {
  return DTYPES.has(id);
}

/**
 * Test-only: wipe the registry. Not exported from the public package
 * entry. Used in `tests/dtypes-registry.test.ts`.
 *
 * @internal
 */
export function __resetDtypeRegistry(): void {
  DTYPES.clear();
}
