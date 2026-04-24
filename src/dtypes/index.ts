/**
 * Public entry for the dtype registry.
 *
 * Built-in dtypes come pre-registered — the registry Map is initialized
 * inline with `BUILTIN_DTYPES` in `./registry.ts` so bundlers respecting
 * `sideEffects` can't strip the registration. Apps with custom dtypes
 * call `registerDtype` at bootstrap before first `<TimelineContainer>`
 * render.
 */

export {
  registerDtype,
  getDtype,
  listDtypes,
  hasDtype,
} from './registry';

export type {
  DtypeId,
  DtypeSpec,
  GroupConfig,
  TimelineViewEntry,
  TimelineViews,
} from './types';

export { BUILTIN_DTYPES } from './builtin';
