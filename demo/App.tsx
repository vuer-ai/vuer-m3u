import { useTimeline } from '../src/react/hooks/use-timeline';
import { TimelineController } from '../src/react/TimelineController';
import { ClockProvider } from '../src/react/clock-context';
import { VideoPlayer } from '../src/react/players/VideoPlayer';
import { SubtitleView } from '../src/react/players/SubtitleView';
import { ActionLabelView } from '../src/react/players/ActionLabelView';
import { BarTrackView } from '../src/react/players/BarTrackView';

const VIDEO_URL = '/video/playlist.m3u8';
const ANNOTATIONS_URL = '/annotations/playlist.m3u8';
const SUBTITLES_URL = '/subtitles/playlist.m3u8';
const TRAJECTORY_URL = '/trajectory/playlist.m3u8';

export function App() {
  const { clock, state, play, pause, seek, setPlaybackRate, setLoop } = useTimeline();

  return (
    <ClockProvider clock={clock}>
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <header className="border-b border-zinc-800 px-6 py-4">
          <h1 className="text-lg font-semibold">vuer-m3u demo</h1>
          <p className="text-sm text-zinc-500 mt-1">
            One timeline driving several synchronized robot-data views. Wrapped in a single
            <code className="mx-1 text-sky-300">ClockProvider</code>, so none of the views need an
            explicit <code className="mx-1 text-sky-300">clock</code> prop.
          </p>
        </header>

        <main className="max-w-7xl mx-auto p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
              <div className="px-4 py-2 border-b border-zinc-800 text-xs font-medium text-zinc-400 uppercase tracking-wide">
                VideoPlayer (HLS)
              </div>
              <div className="aspect-video bg-black">
                <VideoPlayer src={VIDEO_URL} className="w-full h-full" />
              </div>
            </div>

            <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
              <div className="px-4 py-2 border-b border-zinc-800 text-xs font-medium text-zinc-400 uppercase tracking-wide">
                ActionLabelView (discrete events)
              </div>
              <ActionLabelView src={ANNOTATIONS_URL} className="m-0 rounded-none border-none" />
            </div>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-800 text-xs font-medium text-zinc-400 uppercase tracking-wide">
              BarTrackView (generic N-channel time-series; 3-ch trajectory here)
            </div>
            <BarTrackView
              src={TRAJECTORY_URL}
              title="Trajectory"
              channelNames={['X', 'Y', 'Z']}
              range={100}
              className="m-0 rounded-none"
            />
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
            <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
              SubtitleView (WebVTT)
            </div>
            <SubtitleView src={SUBTITLES_URL} className="h-16" />
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
            <TimelineController
              state={state}
              onPlay={play}
              onPause={pause}
              onSeek={seek}
              onSpeedChange={setPlaybackRate}
              onLoopChange={setLoop}
            />
          </div>
        </main>
      </div>
    </ClockProvider>
  );
}
