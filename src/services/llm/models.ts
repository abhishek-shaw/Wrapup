/**
 * Model file management for on-device summarization/chat (llama.rn) — the
 * three GGUF tiers from AGENTS.md "Model distribution". Mirrors
 * services/asr/models.ts: re-downloadable static assets live in the cache
 * directory (already excluded from iCloud/Google account backup), fetched
 * via a resumable download rather than bundled into the app binary.
 *
 * Unlike the ASR model, these are multi-GB and the download screen offers
 * pause/resume, so this module hands back the `DownloadTask` itself rather
 * than wrapping start-to-finish like `ensureAsrModelsDownloaded` does — the
 * caller (download-model.tsx) needs the task instance to pause/resume it.
 */
import { Directory, DownloadTask, File, Paths, type DownloadPauseState } from "expo-file-system";
import * as Network from "expo-network";

import { sha256HexOfStream } from "@/lib/sha256";
import { throttleDownloadProgress } from "@/lib/throttle-progress";
import type { ModelTier } from "@/types/models";

export type LlmModelSpec = {
  tier: ModelTier;
  label: string;
  filename: string;
  url: string;
  sizeBytes: number;
  /** Pulled from the Hugging Face file page's LFS metadata — see AGENTS.md Model distribution. */
  sha256: string;
};

export const LLM_MODEL_SPECS: Record<ModelTier, LlmModelSpec> = {
  fast: {
    tier: "fast",
    label: "Fast",
    filename: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    sizeBytes: 807694464,
    sha256: "6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83",
  },
  balanced: {
    tier: "balanced",
    label: "Balanced",
    filename: "microsoft_Phi-4-mini-instruct-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF/resolve/main/microsoft_Phi-4-mini-instruct-Q4_K_M.gguf",
    sizeBytes: 2491874688,
    sha256: "01999f17c39cc3074afae5e9c539bc82d45f2dd7faa3917c66cbef76fce8c0c2",
  },
  best_quality: {
    tier: "best_quality",
    label: "Best quality",
    filename: "gemma-4-E4B-it-UD-Q4_K_XL.gguf",
    url: "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-UD-Q4_K_XL.gguf",
    sizeBytes: 5126306944,
    sha256: "3cf61de12daa015ee0f7b68e7b7c541405bf220e1e942bad8b47cab827d7df80",
  },
};

function getModelsDirectory(): Directory {
  const dir = new Directory(Paths.cache, "llm-models");
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

export function getModelFile(tier: ModelTier): File {
  return new File(getModelsDirectory(), LLM_MODEL_SPECS[tier].filename);
}

/** Fast existence + size check — the same lightweight check used at every app boot. Does not re-hash. */
export function isModelDownloaded(tier: ModelTier): boolean {
  const file = getModelFile(tier);
  return file.exists && file.size === LLM_MODEL_SPECS[tier].sizeBytes;
}

/** Every tier that's downloaded and ready to run, in fast/balanced/best_quality
 * order — the source of truth for "which models does the user have," since
 * multiple tiers can be kept on disk at once and switched between freely. */
export function getDownloadedModelTiers(): ModelTier[] {
  return (Object.keys(LLM_MODEL_SPECS) as ModelTier[]).filter(isModelDownloaded);
}

/** Combined size of every currently-downloaded tier — used to warn the user
 * before starting a second/third download, since keeping multiple models
 * around at once is now supported but adds up fast (up to ~8.4GB for all
 * three). */
export function getTotalDownloadedSizeBytes(): number {
  return getDownloadedModelTiers().reduce((total, tier) => total + LLM_MODEL_SPECS[tier].sizeBytes, 0);
}

export function getModelSizeOnDiskBytes(tier: ModelTier): number | null {
  const file = getModelFile(tier);
  return file.exists ? file.size : null;
}

export function deleteModel(tier: ModelTier): void {
  const file = getModelFile(tier);
  if (file.exists) {
    file.delete();
  }
}

/**
 * Creates (but does not start) a resumable download task for the given
 * tier. Deletes any stale partial file first — createDownloadTask fails if
 * the destination already exists (same reasoning as services/asr/models.ts).
 * Caller owns the returned task: call `downloadAsync()` to start it, and
 * `pauseAsync()`/`resumeAsync()` from the UI's pause button.
 */
export function createModelDownloadTask(
  tier: ModelTier,
  onProgress: (bytesWritten: number, totalBytes: number) => void,
): DownloadTask {
  const spec = LLM_MODEL_SPECS[tier];
  const destination = getModelFile(tier);
  if (destination.exists) {
    destination.delete();
  }
  const reportProgress = throttleDownloadProgress(onProgress);
  return File.createDownloadTask(spec.url, destination, {
    onProgress: ({ bytesWritten, totalBytes }) =>
      reportProgress(bytesWritten, totalBytes > 0 ? totalBytes : spec.sizeBytes),
  });
}

/**
 * Reconstructs a paused download from state saved via `DownloadTask.savable()`
 * — used to pick a download back up after the app was killed and relaunched
 * (see store/modelDownload.ts's restorePendingDownload), when the original
 * `DownloadTask` instance no longer exists. The reconstructed task starts in
 * the `paused` state; call `resumeAsync()` on it to continue transferring.
 */
export function resumeModelDownloadTask(
  savedState: DownloadPauseState,
  onProgress: (bytesWritten: number, totalBytes: number) => void,
): DownloadTask {
  const reportProgress = throttleDownloadProgress(onProgress);
  return DownloadTask.fromSavable(savedState, {
    onProgress: ({ bytesWritten, totalBytes }) => reportProgress(bytesWritten, totalBytes),
  });
}

/**
 * Checksum-verification step required by AGENTS.md before trusting a
 * download long-term. Runs in the background after the model's already been
 * marked ready off a fast size check (see store/settings.ts's
 * verifyModelInBackground) rather than blocking the download screen — a
 * multi-GB hash is real time even natively, and the size check alone is
 * enough to unblock the user immediately. Deletes the file on mismatch so a
 * corrupt download (most likely from a bad resumable-download resume) can't
 * silently keep masquerading as ready.
 */
export async function verifyDownloadedModel(
  tier: ModelTier,
  onProgress?: (fraction: number) => void,
): Promise<boolean> {
  const spec = LLM_MODEL_SPECS[tier];
  const file = getModelFile(tier);
  if (!file.exists) return false;

  const totalBytes = file.size;
  // Hashing reports progress once per 8MB batch (see lib/sha256's batching) —
  // for a multi-GB file that's still hundreds of calls, so throttle the same
  // way download progress already is rather than flooding the store with a
  // React state update on every single batch.
  const reportProgress = onProgress && throttleDownloadProgress((bytesRead, total) => {
    onProgress(total > 0 ? Math.min(1, bytesRead / total) : 0);
  });

  const digest = await sha256HexOfStream(file.readableStream(), (bytesRead) => {
    reportProgress?.(bytesRead, totalBytes);
  });

  const verified = digest === spec.sha256;
  if (!verified) {
    file.delete();
  }
  return verified;
}

/**
 * Wi-Fi-only gating per AGENTS.md — checked before starting or resuming a
 * download. Only applies to the LLM download flow (see services/asr/models.ts
 * for why the smaller bundled-size ASR model doesn't gate on this).
 */
export async function isOnWifi(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync();
  return state.type === Network.NetworkStateType.WIFI;
}
