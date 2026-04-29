import { formatBytes } from '../../format-bytes';

interface TruncatedNoticeProps {
  shownBytes: number;
  totalBytes: number | null;
  onDownload: () => void;
}

export function TruncatedNotice({ shownBytes, totalBytes, onDownload }: TruncatedNoticeProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-b border-amber-200 dark:border-amber-900">
      <span>
        Showing first {formatBytes(shownBytes)}
        {totalBytes != null ? ` of ${formatBytes(totalBytes)}` : ''}.
      </span>
      <button
        type="button"
        onClick={onDownload}
        className="ml-auto underline hover:no-underline"
      >
        Download full file
      </button>
    </div>
  );
}
