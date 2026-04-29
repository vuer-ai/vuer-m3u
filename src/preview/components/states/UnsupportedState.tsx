interface UnsupportedStateProps {
  filename: string;
  extension: string;
  onDownload: () => void;
}

export function UnsupportedState({ filename, extension, onDownload }: UnsupportedStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 p-6 text-center">
      <span className="text-2xl">📄</span>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Inline preview is not available for this file type.
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {extension ? `.${extension}` : 'Unknown type'} — {filename || 'file'}
      </p>
      <button
        type="button"
        onClick={onDownload}
        className="text-sm px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white"
      >
        Download file
      </button>
    </div>
  );
}
