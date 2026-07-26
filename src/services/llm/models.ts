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
import { Directory, DownloadTask, File, Paths } from "expo-file-system";
import * as Network from "expo-network";

import { sha256HexOfStream } from "@/lib/sha256";
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

/** Any downloaded tier ready to run, for screens that just need "is summarization available at all". */
export function getReadyModelTier(): ModelTier | null {
  return (Object.keys(LLM_MODEL_SPECS) as ModelTier[]).find(isModelDownloaded) ?? null;
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
  return File.createDownloadTask(spec.url, destination, {
    onProgress: ({ bytesWritten, totalBytes }) => onProgress(bytesWritten, totalBytes > 0 ? totalBytes : spec.sizeBytes),
  });
}

/**
 * Checksum-verification step required by AGENTS.md before marking a model
 * ready to use — runs once, right after a download completes. Deletes the
 * file on mismatch so a corrupt download can't silently masquerade as ready.
 */
export async function verifyDownloadedModel(
  tier: ModelTier,
  onProgress?: (fraction: number) => void,
): Promise<boolean> {
  const spec = LLM_MODEL_SPECS[tier];
  const file = getModelFile(tier);
  if (!file.exists) return false;

  const totalBytes = file.size;
  const digest = await sha256HexOfStream(file.readableStream(), (bytesRead) => {
    onProgress?.(totalBytes > 0 ? Math.min(1, bytesRead / totalBytes) : 0);
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
