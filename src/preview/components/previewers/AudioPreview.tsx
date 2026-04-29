import { useState } from 'react';
import type { PreviewerProps } from '../../types';
import { formatBytes } from '../../format-bytes';

export function AudioPreview({ meta }: PreviewerProps) {
  const [errored, setErrored] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center w-full p-6 gap-3">
      <div className="text-center">
        <div className="text-zinc-900 dark:text-zinc-100 text-sm font-medium truncate max-w-md">
          {meta.filename}
        </div>
        <div className="text-zinc-500 dark:text-zinc-400 text-xs">{formatBytes(meta.size)}</div>
      </div>
      {errored ? (
        <div className="text-zinc-500 dark:text-zinc-400 text-sm">Failed to load audio</div>
      ) : (
        <audio
          src={meta.url}
          controls
          preload="metadata"
          onError={() => setErrored(true)}
          className="w-full max-w-md"
        />
      )}
    </div>
  );
}
