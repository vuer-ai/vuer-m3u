import { useState } from 'react';
import type { PreviewerProps } from '../../types';

const checkerboardStyle: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, rgba(0,0,0,0.08) 25%, transparent 25%), ' +
    'linear-gradient(-45deg, rgba(0,0,0,0.08) 25%, transparent 25%), ' +
    'linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.08) 75%), ' +
    'linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.08) 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
};

export function ImagePreview({ meta }: PreviewerProps) {
  const [errored, setErrored] = useState(false);

  return (
    <div
      className="flex items-center justify-center w-full p-4 bg-zinc-50 dark:bg-zinc-900"
      style={{ minHeight: 300, ...checkerboardStyle }}
    >
      {errored ? (
        <div className="text-zinc-500 dark:text-zinc-400 text-sm">Failed to load image</div>
      ) : (
        <img
          src={meta.url}
          alt={meta.filename}
          onError={() => setErrored(true)}
          style={{ objectFit: 'contain', maxWidth: '100%', maxHeight: '100%' }}
        />
      )}
    </div>
  );
}
