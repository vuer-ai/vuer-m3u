import { useState } from 'react';
import type { PreviewerProps } from '../../types';

export function VideoPreview({ meta }: PreviewerProps) {
  const [errored, setErrored] = useState(false);

  return (
    <div className="w-full bg-black flex items-center justify-center" style={{ minHeight: 300 }}>
      {errored ? (
        <div className="text-zinc-400 text-sm py-8">Failed to load video</div>
      ) : (
        <video
          src={meta.url}
          controls
          preload="metadata"
          playsInline
          onError={() => setErrored(true)}
          style={{ width: '100%', height: 'auto', maxHeight: 600 }}
        />
      )}
    </div>
  );
}
