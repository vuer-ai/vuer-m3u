export function LoadingState({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px] text-sm text-zinc-500 dark:text-zinc-400">
      <span className="inline-block w-3 h-3 mr-2 rounded-full bg-zinc-300 dark:bg-zinc-600 animate-pulse" />
      {label ?? 'Loading preview…'}
    </div>
  );
}
