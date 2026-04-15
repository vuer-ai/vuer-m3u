import type { ParsedPlaylist, PlaylistSegment } from './types';

/**
 * Parse an m3u8 playlist string into a structured ParsedPlaylist.
 * Supports standard HLS tags and BSS custom extensions (#BSS-*).
 */
export function parsePlaylist(content: string): ParsedPlaylist {
  const lines = content.split('\n');

  let trackType: string | undefined;
  let chunkFormat: string | undefined;
  let targetDuration = 30;
  let mediaSequence = 0;
  let programDateTime: string | undefined;
  let isLive = true;
  const customTags: Record<string, string> = {};
  const rawSegments: Array<{ duration: number; title: string; uri: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line || line === '#EXTM3U') continue;

    if (line.startsWith('#EXTINF:')) {
      const rest = line.slice(8); // skip '#EXTINF:'
      const commaIdx = rest.indexOf(',');
      const duration = parseFloat(commaIdx >= 0 ? rest.slice(0, commaIdx) : rest);
      const title = commaIdx >= 0 ? rest.slice(commaIdx + 1) : '';

      // Next non-empty, non-comment line is the URI
      let uri = '';
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next && !next.startsWith('#')) {
          uri = next;
          i = j; // skip past the URI line
          break;
        }
      }

      if (uri) {
        rawSegments.push({ duration, title, uri });
      }
    } else if (line === '#EXT-X-ENDLIST') {
      isLive = false;
    } else if (line.startsWith('#BSS-TRACK-TYPE:')) {
      trackType = line.slice(16);
    } else if (line.startsWith('#BSS-CHUNK-FORMAT:')) {
      chunkFormat = line.slice(18);
    } else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetDuration = parseInt(line.slice(22), 10);
    } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = parseInt(line.slice(22), 10);
    } else if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')) {
      programDateTime = line.slice(25);
    } else if (line.startsWith('#BSS-')) {
      // Capture unknown BSS tags
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        customTags[line.slice(1, colonIdx)] = line.slice(colonIdx + 1);
      }
    }
  }

  // Compute cumulative start/end times
  let cumulative = 0;
  const segments: PlaylistSegment[] = rawSegments.map((raw, index) => {
    const startTime = cumulative;
    cumulative += raw.duration;
    return {
      index,
      duration: raw.duration,
      uri: raw.uri,
      title: raw.title,
      startTime,
      endTime: cumulative,
    };
  });

  return {
    trackType,
    chunkFormat,
    targetDuration,
    programDateTime,
    mediaSequence,
    segments,
    isLive,
    totalDuration: cumulative,
    customTags,
  };
}
