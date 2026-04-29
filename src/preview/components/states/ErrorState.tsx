interface ErrorStateProps {
  message: string;
  onDownload?: () => void;
}

export function ErrorState({ message, onDownload }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 p-6 text-center">
      <span className="text-2xl">⚠</span>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">Unable to preview this file.</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md break-words">{message}</p>
      {onDownload && (
        <button
          type="button"
          onClick={onDownload}
          className="text-sm px-3 py-1.5 rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200"
        >
          Download instead
        </button>
      )}
    </div>
  );
}
