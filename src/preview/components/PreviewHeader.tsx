import type { ResolvedFileMeta } from '../types';
import { formatBytes } from '../format-bytes';
import { kindLabel } from '../detect';
import { resolveColor } from '../../timeline/colors';

interface PreviewHeaderProps {
  meta: ResolvedFileMeta;
  accentColor?: string;
  onDownload: () => void;
  rightSlot?: React.ReactNode;
}

export function PreviewHeader({
  meta,
  accentColor,
  onDownload,
  rightSlot,
}: PreviewHeaderProps) {
  const accent = resolveColor(accentColor, '#3b82f6');
  const label = kindLabel(meta.kind, meta.extension);

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
      <span
        className="text-[10px] font-mono uppercase tracking-wider text-white px-1.5 py-0.5 rounded"
        style={{ backgroundColor: accent }}
      >
        {label}
      </span>
      <span
        className="font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate flex-1 min-w-0"
        title={meta.filename}
      >
        {meta.filename || '(unnamed)'}
      </span>
      {meta.size != null && (
        <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums shrink-0">
          {formatBytes(meta.size)}
        </span>
      )}
      {rightSlot}
      <button
        type="button"
        onClick={onDownload}
        className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 shrink-0"
      >
        Download
      </button>
    </div>
  );
}
