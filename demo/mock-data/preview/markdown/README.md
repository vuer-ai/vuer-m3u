# FilePreview — Markdown Fixture

This document exercises GitHub-flavoured markdown features rendered via
`react-markdown` + `remark-gfm`.

## Headings, lists, and links

Visit the [vuer-m3u repo](https://github.com/vuer-ai/vuer-m3u) for source.

- Plain bullet
- **Bold** item
- *Italic* item
- `inline code` item

## Task list (GFM)

- [x] Foundation utilities
- [x] FilePreview shell
- [x] CSV / JSONL previewers
- [x] NPY parser
- [ ] MCAP previewer polish
- [ ] Doc-site MDX pages

## Table (GFM)

| File type | Previewer | Notes |
|-----------|-----------|-------|
| `.png` / `.jpg` | `ImagePreview` | Object URL, hard size cap |
| `.mp4` / `.webm` | `VideoPreview` | Native `<video>` |
| `.md` | `MarkdownPreview` | GFM-enabled |
| `.csv` | `CsvPreview` | Virtual scroll |
| `.npy` | `NpyPreview` | Header + first-N values |
| `.mcap` | `McapPreview` | Streaming reader |

## Code block (fenced)

```ts
import { FilePreview } from '@vuer-ai/vuer-m3u/preview';

export function App() {
  return <FilePreview url="/path/to/file.csv" />;
}
```

## Blockquote

> Generic preview for any URL — independent of timeline / dtype.

## Inline math-ish prose

The previewer dispatches on extension first, then on `Content-Type` if a
HEAD probe is enabled. Resolution is `O(1)` via a hash map.

---

End of fixture.
