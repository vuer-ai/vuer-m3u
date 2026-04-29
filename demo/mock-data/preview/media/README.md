# Media fixtures

This directory is intentionally empty. The demo's existing `video/` fixtures
are HLS playlists (m3u8 + .ts segments) that don't work as direct video
sources for `<FilePreview>`.

To exercise the video / audio previewers locally, drop a small MP4 or MP3 here
and add a corresponding entry to `demo/App.tsx`. For example:

```tsx
<FilePreview url="/preview/media/clip.mp4" />
<FilePreview url="/preview/media/song.mp3" />
```

Files placed in this directory are NOT committed (see `.gitignore` at the
workspace root if needed).
