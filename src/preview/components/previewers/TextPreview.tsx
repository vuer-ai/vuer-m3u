import { useEffect, useMemo, useState } from 'react';
import type { PreviewerProps } from '../../types';
import { rangeFetch } from '../../range-fetch';
import { LoadingState } from '../states/LoadingState';
import { ErrorState } from '../states/ErrorState';

// Module-level caches: registered languages survive component remounts so we
// never re-import a language chunk we've already pulled in.
const REGISTERED_LANGUAGES = new Set<string>();
let HLJS_CORE: typeof import('highlight.js/lib/core').default | null = null;
let STYLE_INJECTED = false;

const HLJS_STYLES = `
.hljs { color: rgb(24 24 27); }
.dark .hljs, [data-theme=dark] .hljs { color: rgb(228 228 231); }
.hljs-keyword, .hljs-built_in { color: #d73a49; }
[data-theme=dark] .hljs-keyword, [data-theme=dark] .hljs-built_in { color: #ff7b72; }
.hljs-string, .hljs-attr { color: #032f62; }
[data-theme=dark] .hljs-string, [data-theme=dark] .hljs-attr { color: #a5d6ff; }
.hljs-number, .hljs-literal { color: #005cc5; }
[data-theme=dark] .hljs-number, [data-theme=dark] .hljs-literal { color: #79c0ff; }
.hljs-comment { color: #6a737d; font-style: italic; }
[data-theme=dark] .hljs-comment { color: #8b949e; }
.hljs-title, .hljs-name { color: #6f42c1; }
[data-theme=dark] .hljs-title, [data-theme=dark] .hljs-name { color: #d2a8ff; }
`;

function ensureStyles() {
  if (STYLE_INJECTED || typeof document === 'undefined') return;
  const tag = document.createElement('style');
  tag.setAttribute('data-vuer-hljs', '');
  tag.textContent = HLJS_STYLES;
  document.head.appendChild(tag);
  STYLE_INJECTED = true;
}

function resolveLanguage(kind: string, extension: string): string | null {
  if (kind === 'json') return 'json';
  if (kind === 'text') return null;
  const ext = extension.toLowerCase();
  switch (ext) {
    case 'py':
      return 'python';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'rb':
      return 'ruby';
    case 'rs':
      return 'rust';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'bash';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'h':
    case 'hpp':
      return 'cpp';
    default:
      return ext || null;
  }
}

export function TextPreview({ meta, fetcher, limits, onTruncate }: PreviewerProps) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [hljsReady, setHljsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setText(null);
    setError(null);
    setHljsReady(false);

    (async () => {
      try {
        const result = await rangeFetch(meta.url, 0, limits.text, fetcher, {
          signal: ctrl.signal,
        });
        if (cancelled) return;
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(
          result.bytes,
        );
        if (result.truncated) {
          onTruncate?.(result.bytes.byteLength, result.totalSize);
        }
        setText(decoded);

        const lang = resolveLanguage(meta.kind, meta.extension);
        if (lang) {
          try {
            if (!HLJS_CORE) {
              const mod = await import('highlight.js/lib/core');
              HLJS_CORE = mod.default;
            }
            if (!REGISTERED_LANGUAGES.has(lang)) {
              const langMod = await import(
                /* @vite-ignore */ `highlight.js/lib/languages/${lang}`
              );
              HLJS_CORE.registerLanguage(lang, langMod.default);
              REGISTERED_LANGUAGES.add(lang);
            }
            if (!cancelled) {
              setLanguage(lang);
              setHljsReady(true);
            }
          } catch {
            if (!cancelled) {
              setLanguage(null);
              setHljsReady(true);
            }
          }
        } else {
          setLanguage(null);
          setHljsReady(true);
        }
      } catch (e) {
        if (cancelled || ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [meta.url, meta.kind, meta.extension, limits.text, fetcher, onTruncate]);

  ensureStyles();

  const highlighted = useMemo(() => {
    if (text == null) return null;
    if (language && HLJS_CORE && REGISTERED_LANGUAGES.has(language)) {
      try {
        return HLJS_CORE.highlight(text, { language, ignoreIllegals: true })
          .value;
      } catch {
        return null;
      }
    }
    return null;
  }, [text, language, hljsReady]);

  if (error) return <ErrorState message={error} />;
  if (text == null || !hljsReady) return <LoadingState />;

  const lines = text.split('\n');
  const lineNumbers = lines.map((_, i) => i + 1).join('\n');

  return (
    <div
      className="flex font-mono text-xs overflow-auto bg-white dark:bg-zinc-900"
      style={{ maxHeight: 600 }}
    >
      <pre
        aria-hidden
        className="select-none px-3 py-3 text-right text-zinc-400 dark:text-zinc-600 bg-zinc-50 dark:bg-zinc-800/40 border-r border-zinc-200 dark:border-zinc-700"
        style={{ margin: 0, lineHeight: '1.5' }}
      >
        {lineNumbers}
      </pre>
      {highlighted != null ? (
        <pre
          className="hljs flex-1 px-3 py-3"
          style={{
            margin: 0,
            lineHeight: '1.5',
            background: 'transparent',
          }}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      ) : (
        <pre
          className="flex-1 px-3 py-3 text-zinc-800 dark:text-zinc-200"
          style={{
            margin: 0,
            lineHeight: '1.5',
            background: 'transparent',
          }}
        >
          {text}
        </pre>
      )}
    </div>
  );
}
