import { useTimeline } from '../src/react/hooks/use-timeline';
import { TimelineController } from '../src/react/TimelineController';
import { VideoPlayer } from '../src/react/players/VideoPlayer';
import { JsonlPlayer } from '../src/react/players/JsonlPlayer';
import { SubtitlePlayer } from '../src/react/players/SubtitlePlayer';
import { CanvasTrackPlayer } from '../src/react/players/CanvasTrackPlayer';

// Public HLS test stream
const VIDEO_URL =
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8';

// Local mock data (served by Vite from demo/mock-data/ via publicDir)
const ANNOTATIONS_URL = '/annotations/playlist.m3u8';
const SUBTITLES_URL = '/subtitles/playlist.m3u8';
const TRAJECTORY_URL = '/trajectory/playlist.m3u8';

export function App() {
  // Duration auto-detected from playlists — no hardcoded value needed
  const { clock, state, play, pause, seek, setPlaybackRate, setLoop } = useTimeline();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-lg font-semibold">M3U8 Extended Player Demo</h1>
        <p className="text-sm text-zinc-500 mt-1">
          A single timeline controlling multiple synchronized players — video, JSONL, canvas animation, and subtitles.
        </p>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Row 1: Video + JSONL */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-800 text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Video Player (HLS)
            </div>
            <div className="aspect-video bg-black">
              <VideoPlayer
                playlistUrl={VIDEO_URL}
                clock={clock}
                className="w-full h-full"
              />
            </div>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden h-[360px]">
            <JsonlPlayer
              playlistUrl={ANNOTATIONS_URL}
              clock={clock}
            />
          </div>
        </div>

        {/* Row 2: Canvas Track Player (chart + path) */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden h-[300px]">
          <CanvasTrackPlayer
            playlistUrl={TRAJECTORY_URL}
            clock={clock}
            mode="both"
            chartWindow={8}
          />
        </div>

        {/* Row 3: Subtitle */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
            Subtitle Track (VTT)
          </div>
          <SubtitlePlayer
            playlistUrl={SUBTITLES_URL}
            clock={clock}
            className="h-16"
          />
        </div>

        {/* Timeline Controller */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <TimelineController
            clock={clock}
            state={state}
            onPlay={play}
            onPause={pause}
            onSeek={seek}
            onPlaybackRateChange={setPlaybackRate}
            onLoopChange={setLoop}
          />
        </div>

        {/* Debug info */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
            Debug
          </div>
          <div className="grid grid-cols-4 gap-4 text-sm font-mono">
            <div>
              <span className="text-zinc-500">duration: </span>
              <span className="text-zinc-200">{state.duration}s</span>
            </div>
            <div>
              <span className="text-zinc-500">playing: </span>
              <span className="text-zinc-200">{String(state.playing)}</span>
            </div>
            <div>
              <span className="text-zinc-500">rate: </span>
              <span className="text-zinc-200">{state.playbackRate}x</span>
            </div>
            <div>
              <span className="text-zinc-500">loop: </span>
              <span className="text-zinc-200">{String(state.loop)}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
