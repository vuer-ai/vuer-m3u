import type { ReactNode } from 'react';
import type { ResolvedFileMeta } from '../types';
import { PreviewHeader } from './PreviewHeader';

interface PreviewFrameProps {
  meta: ResolvedFileMeta;
  accentColor?: string;
  onDownload: () => void;
  notice?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function PreviewFrame({
  meta,
  accentColor,
  onDownload,
  notice,
  className,
  children,
}: PreviewFrameProps) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 flex flex-col ${className ?? ''}`}
    >
      <PreviewHeader meta={meta} accentColor={accentColor} onDownload={onDownload} />
      {notice}
      <div className="flex-1 min-h-0 relative">{children}</div>
    </div>
  );
}
