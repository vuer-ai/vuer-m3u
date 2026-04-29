/**
 * Format a byte count as a human-readable string.
 *
 * Uses binary units (1 KB = 1024 B) to match how operating systems and
 * storage tools (S3, Linux `ls -h`) typically report file sizes.
 */
export function formatBytes(bytes: number | null | undefined, fractionDigits = 1): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes < 0) return '—';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const exp = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  const value = bytes / 1024 ** exp;

  if (exp === 0) return `${bytes} B`;
  return `${value.toFixed(fractionDigits)} ${units[exp]}`;
}
