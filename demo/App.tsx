import {
  useTimeline,
  ClockProvider,
  TimelineController,
  VideoPlayer,
  ActionLabelView,
  BarTrackView,
  SubtitleView,
  DetectionBoxView,
  ImuChartView,
  ImuGizmoView,
  JointAngleView,
  PoseView,
} from '@vuer-ai/vuer-m3u';
import { FilePreview, type Fetcher } from '@vuer-ai/vuer-m3u/preview';
import { TimelineDemo } from './TimelineDemo';
import { ThemeToggle } from './ThemeToggle';

// Vite's dev server (and most SPA hosts) fall back to index.html for any
// path that isn't a static file, so a "missing URL" returns 200 OK with
// HTML instead of a real 404. The 404 demo card injects this synthetic
// fetcher so ErrorState renders deterministically regardless of host.
const fakeNotFoundFetcher: Fetcher = async () =>
  new Response('Not Found', { status: 404, statusText: 'Not Found' });

const VIDEO_URL = '/video/playlist.m3u8';
const ANNOTATIONS_URL = '/annotations/playlist.m3u8';
const TRAJECTORY_URL = '/trajectory/playlist.m3u8';
const SUBTITLES_URL = '/subtitles/playlist.m3u8';
const DETECTIONS_URL = '/detections/playlist.m3u8';
const IMU_URL = '/imu/playlist.m3u8';
const JOINTS_URL = '/joints/playlist.m3u8';
const POSE_URL = '/pose/playlist.m3u8';

type SectionProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

function Section({ title, description, children }: SectionProps) {
  return (
    <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <header className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        {description ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
            {description}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

type WithControllerProps = {
  children: (clock: ReturnType<typeof useTimeline>['clock']) => React.ReactNode;
};

function WithController({ children }: WithControllerProps) {
  const { clock, state, play, pause, seek, setPlaybackRate, setLoop } =
    useTimeline();

  return (
    <ClockProvider clock={clock}>
      {children(clock)}
      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
        <TimelineController
          state={state}
          onPlay={play}
          onPause={pause}
          onSeek={seek}
          onSpeedChange={setPlaybackRate}
          onLoopChange={setLoop}
        />
      </div>
    </ClockProvider>
  );
}

export function App() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-5 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold">vuer-m3u demo</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-1">
            A gallery of the pre-built views in{' '}
            <code className="text-indigo-600 dark:text-indigo-300">
              @vuer-ai/vuer-m3u
            </code>
            . Each panel has its own{' '}
            <code className="text-indigo-600 dark:text-indigo-300">
              TimelineClock
            </code>
            , matching the per-view demos in the docs.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lg:col-span-2">
          <Section
            title="Multi-track Timeline"
            description="A config-driven TimelineContainer with four lane primitives: VideoLane (segment cards), LineChartLane (canvas polyline), PillLane, MarkerLane. Click or drag the ruler / lane area to scrub; shift+wheel pans, cmd/ctrl+wheel zooms at cursor."
          >
            <TimelineDemo />
          </Section>
        </div>

        <Section
          title="VideoPlayer"
          description="HLS video playback via hls.js. Timeline duration is auto-synced to the <video> element."
        >
          <WithController>
            {() => (
              <div className="aspect-video bg-black">
                <VideoPlayer src={VIDEO_URL} className="w-full h-full" />
              </div>
            )}
          </WithController>
        </Section>

        <Section
          title="DetectionBoxView over VideoPlayer"
          description="Bounding boxes overlay. Coordinates are in pixel space of the video."
        >
          <WithController>
            {() => (
              <div className="relative aspect-video bg-black">
                <VideoPlayer src={VIDEO_URL} className="w-full h-full" />
                <DetectionBoxView src={DETECTIONS_URL} />
              </div>
            )}
          </WithController>
        </Section>

        <Section
          title="ActionLabelView"
          description="Discrete action annotations ({ts, te, label, ...}) rendered as labeled segments."
        >
          <WithController>
            {() => (
              <div className="h-[280px] overflow-auto">
                <ActionLabelView src={ANNOTATIONS_URL} />
              </div>
            )}
          </WithController>
        </Section>

        <Section
          title="BarTrackView"
          description="Generic N-channel time-series rendered as bars. Trajectory fixtures use 3 channels (X, Y, Z)."
        >
          <WithController>
            {() => (
              <BarTrackView
                src={TRAJECTORY_URL}
                title="Trajectory"
                channelNames={['X', 'Y', 'Z']}
                range={100}
              />
            )}
          </WithController>
        </Section>

        <Section
          title="SubtitleView"
          description="WebVTT cues; one active cue displayed at a time."
        >
          <WithController>
            {() => (
              <div className="h-24 flex items-center justify-center bg-zinc-900">
                <SubtitleView src={SUBTITLES_URL} />
              </div>
            )}
          </WithController>
        </Section>

        <Section
          title="ImuChartView"
          description="6-axis IMU (accel + gyro) continuous readout."
        >
          <WithController>{() => <ImuChartView src={IMU_URL} />}</WithController>
        </Section>

        <Section
          title="ImuGizmoView"
          description="Same IMU data, rendered as an orientation gizmo."
        >
          <WithController>{() => <ImuGizmoView src={IMU_URL} />}</WithController>
        </Section>

        <Section
          title="JointAngleView"
          description="Per-joint angles displayed as a live bar readout."
        >
          <WithController>
            {() => (
              <JointAngleView
                src={JOINTS_URL}
                jointNames={[
                  'shoulder_pan',
                  'shoulder_lift',
                  'elbow',
                  'wrist_1',
                  'wrist_2',
                  'wrist_3',
                  'gripper',
                ]}
              />
            )}
          </WithController>
        </Section>

        <Section
          title="PoseView"
          description="6-DoF pose (position + quaternion) displayed as a live readout. Interpolation is slerp-aware."
        >
          <WithController>{() => <PoseView src={POSE_URL} />}</WithController>
        </Section>

        <div className="lg:col-span-2">
          <Section
            title="File Preview"
            description="Generic preview for any URL — independent of timeline / dtype. Dispatches on file extension to the appropriate previewer (image, markdown, csv, jsonl, code, npy, …) with hard / soft size limits."
          >
            <div className="p-4 space-y-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Each card below renders{' '}
                <code className="text-indigo-600 dark:text-indigo-300">
                  &lt;FilePreview&gt;
                </code>{' '}
                from{' '}
                <code className="text-indigo-600 dark:text-indigo-300">
                  @vuer-ai/vuer-m3u/preview
                </code>{' '}
                against a fixture under{' '}
                <code className="text-indigo-600 dark:text-indigo-300">
                  /preview/
                </code>
                .
              </p>

              <FilePreview
                url="/preview/images/sample.svg"
                filename="sample.svg"
                size={1500}
              />
              <FilePreview url="/preview/markdown/README.md" />
              <FilePreview url="/preview/tabular/small.csv" />
              <FilePreview url="/preview/tabular/events.jsonl" />
              <FilePreview url="/preview/code/sample.py" />
              <FilePreview url="/preview/code/sample.json" />
              <FilePreview url="/preview/code/sample.yaml" />
              <FilePreview url="/preview/code/sample.txt" />
              <FilePreview url="/preview/npy/joints_small.npy" />
              <FilePreview url="/preview/mcap/sample.mcap" />

              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                Edge cases
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 -mt-3">
                The three cards below intentionally trigger non-happy-path
                states so you can see the fallback UIs.
              </p>

              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                  <strong>Too large</strong> — passes a fake{' '}
                  <code>size=50&nbsp;MB</code> with{' '}
                  <code>filename="huge.png"</code> so the image hard-limit
                  triggers <code>TooLargeState</code>.
                </p>
                <FilePreview
                  url="/preview/images/sample.svg"
                  filename="huge.png"
                  size={50_000_000}
                />
              </div>

              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                  <strong>Unsupported extension</strong> — <code>.zip</code>{' '}
                  isn't in the dispatch table, so dispatch resolves to{' '}
                  <code>UnsupportedState</code> with a download button.
                </p>
                <FilePreview
                  url="/preview/misc/archive.zip"
                  filename="archive.zip"
                />
              </div>

              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                  <strong>Fetch failure (404)</strong> — uses a custom{' '}
                  <code>fetcher</code> that synthesizes a 404 response so
                  the CSV previewer renders <code>ErrorState</code>{' '}
                  deterministically (Vite's SPA fallback would otherwise
                  serve <code>index.html</code> for missing paths).
                </p>
                <FilePreview
                  url="/preview/missing/nonexistent.csv"
                  fetcher={fakeNotFoundFetcher}
                />
              </div>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}
