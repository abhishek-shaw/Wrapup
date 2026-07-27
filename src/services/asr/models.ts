/**
 * Model file management for on-device transcription (whisper.rn) — the ASR
 * model itself and the Silero VAD model whisper.rn uses to gate transcription
 * to actual speech (see index.ts for why that matters).
 *
 * Per AGENTS.md "Model distribution": these are re-downloadable static
 * assets, not user data, so they live in the cache directory (which is
 * already excluded from iCloud/Google account backup by definition — unlike
 * `Paths.document`, which is what recorded audio uses because that IS
 * irreplaceable user data) and are fetched via a resumable download rather
 * than bundled into the app binary.
 *
 * This is scoped to the ASR models only. The LLM model download flow
 * (choose-model/download-model screens) is a separate, not-yet-implemented
 * feature — Wi-Fi-only gating and settings UI for switching/deleting models
 * belong there once it exists, not duplicated here.
 */
import { Directory, File, Paths } from "expo-file-system";

import { throttleDownloadProgress } from "@/lib/throttle-progress";

const WHISPER_MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";
const WHISPER_MODEL_FILENAME = "ggml-base.bin";
// Approximate — used only to show a progress percentage before the first
// byte arrives with a real Content-Length. Not used for correctness.
const WHISPER_MODEL_SIZE_BYTES = 148 * 1024 * 1024;

const VAD_MODEL_URL = "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin";
const VAD_MODEL_FILENAME = "ggml-silero-v6.2.0.bin";
const VAD_MODEL_SIZE_BYTES = 2 * 1024 * 1024;

function getModelsDirectory(): Directory {
  const dir = new Directory(Paths.cache, "asr-models");
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

export function getWhisperModelFile(): File {
  return new File(getModelsDirectory(), WHISPER_MODEL_FILENAME);
}

export function getVadModelFile(): File {
  return new File(getModelsDirectory(), VAD_MODEL_FILENAME);
}

/** A file is considered downloaded if it exists and isn't an empty/partial stub. */
function isFilePresent(file: File, minBytes: number): boolean {
  return file.exists && file.size > minBytes;
}

export function areAsrModelsReady(): boolean {
  return (
    isFilePresent(getWhisperModelFile(), WHISPER_MODEL_SIZE_BYTES * 0.9) &&
    isFilePresent(getVadModelFile(), VAD_MODEL_SIZE_BYTES * 0.9)
  );
}

export type AsrDownloadProgress = {
  /** 0-1 across both model files combined. */
  fraction: number;
};

async function downloadOne(
  url: string,
  destination: File,
  expectedSizeBytes: number,
  onProgress: (bytesWritten: number, totalBytes: number) => void,
): Promise<void> {
  if (destination.exists) {
    // Clear out any partial file from a previously interrupted download —
    // createDownloadTask fails if the destination already exists.
    destination.delete();
  }
  const reportProgress = throttleDownloadProgress(onProgress);
  const task = File.createDownloadTask(url, destination, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      reportProgress(bytesWritten, totalBytes > 0 ? totalBytes : expectedSizeBytes);
    },
  });
  const result = await task.downloadAsync();
  if (!result) {
    throw new Error(`Download of ${destination.name} did not complete`);
  }
}

/**
 * Downloads the whisper ASR model and the Silero VAD model whisper.rn needs,
 * if either is missing. Safe to call every time before transcribing — it's a
 * no-op once both files are already on disk.
 */
export async function ensureAsrModelsDownloaded(onProgress?: (progress: AsrDownloadProgress) => void): Promise<void> {
  if (areAsrModelsReady()) {
    onProgress?.({ fraction: 1 });
    return;
  }

  const totalExpectedBytes = WHISPER_MODEL_SIZE_BYTES + VAD_MODEL_SIZE_BYTES;
  let whisperBytes = 0;
  let vadBytes = 0;
  const report = () => onProgress?.({ fraction: Math.min(1, (whisperBytes + vadBytes) / totalExpectedBytes) });

  const whisperFile = getWhisperModelFile();
  if (!isFilePresent(whisperFile, WHISPER_MODEL_SIZE_BYTES * 0.9)) {
    await downloadOne(WHISPER_MODEL_URL, whisperFile, WHISPER_MODEL_SIZE_BYTES, (written) => {
      whisperBytes = written;
      report();
    });
  } else {
    whisperBytes = WHISPER_MODEL_SIZE_BYTES;
  }

  const vadFile = getVadModelFile();
  if (!isFilePresent(vadFile, VAD_MODEL_SIZE_BYTES * 0.1)) {
    await downloadOne(VAD_MODEL_URL, vadFile, VAD_MODEL_SIZE_BYTES, (written) => {
      vadBytes = written;
      report();
    });
  } else {
    vadBytes = VAD_MODEL_SIZE_BYTES;
  }

  onProgress?.({ fraction: 1 });
}
