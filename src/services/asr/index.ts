/**
 * On-device transcription — the only place in the app that talks to
 * `whisper.rn` directly (see AGENTS.md: native module boundaries get a
 * typed wrapper in services/, not ad hoc calls from components).
 *
 * Whisper hallucinates when it's asked to decode silence (repeated stock
 * phrases like "Thank you." or "Bye bye." are a well-known failure mode).
 * Meetings are full of silence — pauses, muted stretches, dead air before
 * someone joins — so we run a VAD (Voice Activity Detection) pass first via
 * whisper.rn's built-in Silero VAD context, and only ever ask Whisper to
 * decode the spans VAD says contain speech. Silence in between is skipped
 * entirely rather than transcribed.
 *
 * This pipeline only ever reads a local audio file and local model files —
 * see AGENTS.md Privacy & Network Rules. No function in this file makes a
 * network call (model downloading is handled separately in models.ts, which
 * is the one explicit, narrow exception in that policy).
 */
import { initWhisper, initWhisperVad, releaseAllWhisper, releaseAllWhisperVad } from "whisper.rn";

import { getVadModelFile, getWhisperModelFile } from "./models";
import { decodeToWavFile, deleteTempWavFile, getTempWavFilePath } from "./transcode";
import { withTimeout } from "@/lib/timeout";
import type { TranscriptSegment } from "@/types/models";

// Adjacent VAD speech segments closer together than this are merged into a
// single transcribe() call — avoids chopping a sentence into pieces at every
// short pause, and avoids the overhead of a separate whisper call per gap.
const MERGE_GAP_SECONDS = 1.5;
// Keep merged windows comfortably under whisper's ~30s encoder window rather
// than relying on undocumented behavior for longer spans in one call.
const MAX_WINDOW_SECONDS = 28;
// How much of the previous window's text to carry forward as a prompt, so
// wording/vocabulary stays consistent across a merge boundary.
const PROMPT_CONTEXT_CHARS = 200;

// Generous but bounded — a native call that's genuinely still working
// shouldn't hit these, but a wedged JSI bridge or a corrupt model file must
// never leave the processing screen spinning forever with no way out.
const MODEL_INIT_TIMEOUT_MS = 60_000;
const VAD_DETECT_TIMEOUT_MS = 60_000;
const TRANSCRIBE_WINDOW_TIMEOUT_MS = 60_000;
const TRANSCODE_TIMEOUT_MS = 120_000;

/**
 * Caches the promise returned by `init`, clearing the cache if it rejects so
 * the next call retries from scratch instead of permanently caching a
 * failure (e.g. a corrupt model file after an interrupted download).
 */
function lazyContext<T>(init: () => Promise<T>): { get: () => Promise<T>; reset: () => void } {
  let cached: Promise<T> | null = null;
  return {
    get: () => {
      const promise: Promise<T> =
        cached ??
        init().catch((error: unknown) => {
          cached = null;
          throw error;
        });
      cached = promise;
      return promise;
    },
    reset: () => {
      cached = null;
    },
  };
}

const whisperContextCache = lazyContext(() =>
  initWhisper({
    filePath: getWhisperModelFile().uri,
    // We only ever download the plain ggml model, never a companion CoreML
    // asset (see models.ts) — without this, whisper.rn's iOS init probes
    // for a co-located `<model>-encoder.mlmodelc` by naming convention and
    // fails to initialize when it isn't there instead of just skipping it.
    useCoreMLIos: false,
  }),
);
const vadContextCache = lazyContext(() => initWhisperVad({ filePath: getVadModelFile().uri }));

/** Releases native ASR contexts — call before deleting the model files on disk. */
export async function releaseAsrContexts(): Promise<void> {
  await Promise.all([releaseAllWhisper(), releaseAllWhisperVad()]);
  whisperContextCache.reset();
  vadContextCache.reset();
}

type SpeechWindow = { t0: number; t1: number };

/** Merges nearby VAD speech segments into transcribe-sized windows. Exported for tests. */
export function mergeSpeechSegments(segments: SpeechWindow[]): SpeechWindow[] {
  const sorted = [...segments].sort((a, b) => a.t0 - b.t0);
  const merged: SpeechWindow[] = [];

  for (const segment of sorted) {
    const last = merged[merged.length - 1];
    const gap = last ? segment.t0 - last.t1 : Infinity;
    const wouldExceedMaxWindow = last ? segment.t1 - last.t0 > MAX_WINDOW_SECONDS : false;

    if (last && gap < MERGE_GAP_SECONDS && !wouldExceedMaxWindow) {
      last.t1 = segment.t1;
    } else {
      merged.push({ ...segment });
    }
  }

  return merged;
}

export type TranscribeMeetingResult = {
  text: string;
  segments: TranscriptSegment[];
  language: string | null;
};

/**
 * Transcribes a recorded meeting's audio file. Assumes the ASR + VAD model
 * files are already on disk — call `ensureAsrModelsDownloaded()` from
 * services/asr/models first.
 */
export async function transcribeMeetingAudio(
  audioFilePath: string,
  options?: { onProgress?: (fraction: number) => void },
): Promise<TranscribeMeetingResult> {
  let whisperContext: Awaited<ReturnType<typeof initWhisper>>;
  let vadContext: Awaited<ReturnType<typeof initWhisperVad>>;
  try {
    [whisperContext, vadContext] = await Promise.all([
      withTimeout(whisperContextCache.get(), MODEL_INIT_TIMEOUT_MS, "Whisper model load"),
      withTimeout(vadContextCache.get(), MODEL_INIT_TIMEOUT_MS, "VAD model load"),
    ]);
  } catch (error) {
    // A stuck native init leaves the cached promise permanently pending —
    // reset both so the next attempt (e.g. the user retrying from Today)
    // starts a fresh native context instead of awaiting the same wedged one
    // forever, which is what turns one bad init into a permanently-stuck
    // recording with no way to recover short of reinstalling the app.
    whisperContextCache.reset();
    vadContextCache.reset();
    throw error;
  }

  // whisper.rn's file-based transcribe()/detectSpeech() do no real audio
  // decoding — see transcode.ts. Recorded meetings are AAC (.m4a), so decode
  // to a temp 16kHz mono WAV once up front and point both VAD and transcribe
  // at that instead of the original recording. Allocate the path synchronously
  // before wrapping the decode in withTimeout so cleanup can run on timeout.
  const wavFilePath = getTempWavFilePath();

  try {
    await withTimeout(
      decodeToWavFile(audioFilePath, wavFilePath),
      TRANSCODE_TIMEOUT_MS,
      "Decoding audio for transcription",
    );
  } catch (error) {
    deleteTempWavFile(wavFilePath);
    throw error;
  }

  try {
    let rawSpeechSegments: Awaited<ReturnType<typeof vadContext.detectSpeech>>;
    try {
      rawSpeechSegments = await withTimeout(
        vadContext.detectSpeech(wavFilePath, {
          threshold: 0.5,
          minSpeechDurationMs: 250,
          minSilenceDurationMs: 300,
          speechPadMs: 200,
        }),
        VAD_DETECT_TIMEOUT_MS,
        "Speech detection",
      );
    } catch (error) {
      vadContextCache.reset();
      throw error;
    }

    if (rawSpeechSegments.length === 0) {
      options?.onProgress?.(1);
      return { text: "", segments: [], language: null };
    }

    // whisper.rn 0.4.x's VAD returns t0/t1 in centiseconds (whisper.cpp's
    // internal `cs_to_samples` convention — hundredths of a second), not
    // plain seconds. Convert once here so every downstream calculation
    // (merging, offset/duration math) can just work in real seconds.
    const speechSegments = rawSpeechSegments.map((segment) => ({
      t0: segment.t0 / 100,
      t1: segment.t1 / 100,
    }));

    // Defensive: a window with zero/negative duration (shouldn't happen given
    // VAD's minSpeechDurationMs, but merging math is exactly the kind of thing
    // that grows an edge case) would hand whisper.cpp a nonsensical duration —
    // drop those rather than risk an undefined native decode.
    const windows = mergeSpeechSegments(speechSegments).filter((window) => window.t1 - window.t0 > 0);
    const segments: TranscriptSegment[] = [];
    let previousText = "";

    for (let i = 0; i < windows.length; i++) {
      const window = windows[i];
      let result: Awaited<ReturnType<typeof whisperContext.transcribe>["promise"]>;
      try {
        const { promise } = whisperContext.transcribe(wavFilePath, {
          language: "auto",
          offset: Math.round(window.t0 * 1000),
          duration: Math.round((window.t1 - window.t0) * 1000),
          prompt: previousText ? previousText.slice(-PROMPT_CONTEXT_CHARS) : undefined,
        });
        result = await withTimeout(promise, TRANSCRIBE_WINDOW_TIMEOUT_MS, "Transcribing a segment");
      } catch (error) {
        whisperContextCache.reset();
        throw error;
      }

      const text = result.result.trim();
      previousText = text;

      if (text.length > 0) {
        segments.push({
          speakerLabel: null,
          startSeconds: window.t0,
          endSeconds: window.t1,
          text,
        });
      }

      options?.onProgress?.((i + 1) / windows.length);
    }

    return {
      // whisper.rn 0.4.x's TranscribeResult doesn't report detected language
      // (that field wasn't added until 0.5.5 — see models.ts for why we're
      // pinned to 0.4.3, well before both that and the JSI install mechanism).
      text: segments.map((segment) => segment.text).join("\n\n"),
      segments,
      language: null,
    };
  } finally {
    deleteTempWavFile(wavFilePath);
  }
}
