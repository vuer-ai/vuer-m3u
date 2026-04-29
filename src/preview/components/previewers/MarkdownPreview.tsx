import { useEffect, useState, type ComponentType } from 'react';
import type { PreviewerProps } from '../../types';
import { rangeFetch } from '../../range-fetch';
import { LoadingState } from '../states/LoadingState';
import { ErrorState } from '../states/ErrorState';

// Cache the lazy-loaded markdown modules across mounts.
let MARKDOWN_DEPS: {
  ReactMarkdown: ComponentType<any>;
  remarkGfm: any;
} | null = null;
let STYLE_INJECTED = false;

const MD_STYLES = `
.vuer-md-preview h1 { font-size: 1.5rem; font-weight: 600; margin: 1.2em 0 0.6em; }
.vuer-md-preview h2 { font-size: 1.25rem; font-weight: 600; margin: 1em 0 0.5em; }
.vuer-md-preview h3 { font-size: 1.1rem; font-weight: 600; margin: 0.9em 0 0.4em; }
.vuer-md-preview p { margin: 0.6em 0; }
.vuer-md-preview ul { list-style: disc; padding-left: 1.5em; margin: 0.6em 0; }
.vuer-md-preview ol { list-style: decimal; padding-left: 1.5em; margin: 0.6em 0; }
.vuer-md-preview li { margin: 0.2em 0; }
.vuer-md-preview code { background: rgba(0,0,0,0.06); padding: 0.1em 0.3em; border-radius: 3px; font-family: ui-monospace,monospace; font-size: 0.9em; }
[data-theme=dark] .vuer-md-preview code { background: rgba(255,255,255,0.1); }
.vuer-md-preview pre { background: rgb(244 244 245); padding: 0.75em; border-radius: 6px; overflow-x: auto; margin: 0.8em 0; }
[data-theme=dark] .vuer-md-preview pre { background: rgb(39 39 42); }
.vuer-md-preview pre code { background: none; padding: 0; }
.vuer-md-preview a { color: rgb(37 99 235); text-decoration: underline; }
[data-theme=dark] .vuer-md-preview a { color: rgb(96 165 250); }
.vuer-md-preview table { border-collapse: collapse; margin: 0.8em 0; }
.vuer-md-preview th, .vuer-md-preview td { border: 1px solid rgb(212 212 216); padding: 0.4em 0.6em; }
[data-theme=dark] .vuer-md-preview th, [data-theme=dark] .vuer-md-preview td { border-color: rgb(63 63 70); }
.vuer-md-preview blockquote { border-left: 3px solid rgb(212 212 216); padding-left: 0.75em; color: rgb(82 82 91); margin: 0.6em 0; }
[data-theme=dark] .vuer-md-preview blockquote { border-color: rgb(63 63 70); color: rgb(161 161 170); }
.vuer-md-preview input[type=checkbox] { margin-right: 0.4em; }
`;

function ensureStyles() {
  if (STYLE_INJECTED || typeof document === 'undefined') return;
  const tag = document.createElement('style');
  tag.setAttribute('data-vuer-md', '');
  tag.textContent = MD_STYLES;
  document.head.appendChild(tag);
  STYLE_INJECTED = true;
}

export function MarkdownPreview({
  meta,
  fetcher,
  limits,
  onTruncate,
}: PreviewerProps) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deps, setDeps] = useState(MARKDOWN_DEPS);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setText(null);
    setError(null);

    (async () => {
      try {
        const [result] = await Promise.all([
          rangeFetch(meta.url, 0, limits.text, fetcher, {
            signal: ctrl.signal,
          }),
          (async () => {
            if (MARKDOWN_DEPS) return;
            const ReactMarkdown = (await import('react-markdown')).default;
            const remarkGfm = (await import('remark-gfm')).default;
            MARKDOWN_DEPS = { ReactMarkdown, remarkGfm };
          })(),
        ]);
        if (cancelled) return;
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(
          result.bytes,
        );
        if (result.truncated) {
          onTruncate?.(result.bytes.byteLength, result.totalSize);
        }
        setText(decoded);
        setDeps(MARKDOWN_DEPS);
      } catch (e) {
        if (cancelled || ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [meta.url, limits.text, fetcher, onTruncate]);

  ensureStyles();

  if (error) return <ErrorState message={error} />;
  if (text == null || !deps) return <LoadingState />;

  const { ReactMarkdown, remarkGfm } = deps;

  return (
    <div
      className="vuer-md-preview p-4 overflow-auto text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed"
      style={{ maxHeight: 600 }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
