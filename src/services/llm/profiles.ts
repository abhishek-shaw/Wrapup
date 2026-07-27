/**
 * Per-tier runtime tuning for llama.rn — how much context/threads/batch a
 * tier uses, and how tightly its sampling is constrained, not how good its
 * answers *could* be. Deliberately split from per-task settings (n_predict,
 * enable_thinking) in services/llm/index.ts: those stay identical across
 * tiers because shrinking them for a smaller model risks truncated/
 * incomplete output (see extractActionItems), which is a correctness bug,
 * not a legitimate speed tradeoff.
 *
 * temperatureOffset/topP/minP exist specifically to keep every tier grounded
 * in the transcript — this is a meeting-notes app, and a model that gets
 * "creative" is a model that states things nobody said. All three tiers get
 * a negative temperature offset and tightened nucleus sampling (see
 * completion() calls in index.ts); Fast gets the most conservative values
 * since smaller models are the least reliable at staying grounded.
 */
import type { ModelTier } from "@/types/models";

export type ModelProfile = {
  tier: ModelTier;
  /** Context window size, in tokens. Kept equal to today's proven value for
   * Fast/Balanced — a smaller context directly truncates more of the
   * transcript before the model ever sees it, which is a quality loss, not
   * a speed win. Only raised for Best quality, where the larger download
   * already implies a device with enough RAM to spend on it. */
  nCtx: number;
  /** CPU threads used for generation — pure speed knob, no effect on answer quality. */
  nThreads: number;
  /** Prompt-ingestion batch size — throughput/memory during prompt eval, not output correctness. */
  nBatch: number;
  /** Added to each task's own base temperature (summary/title/action-items/chat
   * keep their existing distinct values in services/llm/index.ts — extracting
   * action items still runs colder than free-form chat, tier or no tier).
   * Always negative: this app must never state something the transcript
   * didn't say, so every tier gets nudged toward more deterministic output.
   * Smaller models are less well-calibrated and drift more easily, so Fast
   * gets the strongest pull. */
  temperatureOffset: number;
  /** Nucleus sampling cutoff (llama.rn default: 0.95). Lower values discard
   * more of the low-probability "tail" of possible next tokens — often
   * exactly where a fabricated detail would come from — independent of
   * temperature. */
  topP: number;
  /** Minimum token probability, relative to the most likely token (llama.rn
   * default: 0.05). Raising this trims the same low-probability tail from a
   * different angle; used together with topP rather than instead of it. */
  minP: number;
  /** Keeps the model's pages resident in memory for faster repeated inference,
   * at the cost of OOM-kill risk under memory pressure — only worth the risk
   * on the RAM class Best quality targets. */
  useMlock: boolean;
};

export const LLM_PROFILES: Record<ModelTier, ModelProfile> = {
  fast: {
    tier: "fast",
    nCtx: 4096,
    nThreads: 3,
    nBatch: 128,
    temperatureOffset: -0.15,
    topP: 0.85,
    minP: 0.1,
    useMlock: false,
  },
  balanced: {
    tier: "balanced",
    nCtx: 4096,
    nThreads: 4,
    nBatch: 256,
    temperatureOffset: -0.05,
    topP: 0.9,
    minP: 0.08,
    useMlock: false,
  },
  best_quality: {
    tier: "best_quality",
    nCtx: 8192,
    nThreads: 6,
    nBatch: 512,
    temperatureOffset: -0.05,
    topP: 0.9,
    minP: 0.08,
    useMlock: true,
  },
};
