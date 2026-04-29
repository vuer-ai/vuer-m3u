# Demo scripts

Utility scripts for generating fixtures used by `demo/App.tsx`.

## Timeline mock data

```bash
node demo/scripts/generate-timeline-mock.mjs
```

Regenerates the `demo/mock-data/timeline/` HLS fixtures used by the
`TimelineDemo` view. See `README-timeline-mock.md` for details.

## NPY fixture (FilePreview demo)

```bash
node demo/scripts/gen-npy.mjs
```

Writes `demo/mock-data/preview/npy/joints_small.npy` — a tiny `.npy v1.0`
file with a `(7,)` `float32` array used by the FilePreview demo route.

The script constructs the binary by hand (magic + version + 64-byte aligned
header dict + little-endian float32 data) so it has no external
dependencies — only `node` from the repo's pnpm/Node toolchain.

Re-run whenever the values or shape change. The output is committed.
