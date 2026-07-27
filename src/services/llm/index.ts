/**
 * On-device summarization, action-item extraction, and meeting chat — the
 * only place in the app that talks to `llama.rn` directly (see AGENTS.md:
 * native module boundaries get a typed wrapper in services/, not ad hoc
 * calls from components).
 *
 * This pipeline only ever reads a local model file and local transcript
 * text — see AGENTS.md Privacy & Network Rules. No function in this file
 * makes a network call (model downloading is handled separately in
 * models.ts, the one explicit, narrow exception in that policy).
 *
 * Per the "Meeting chat feature note" in AGENTS.md: chat prompts are built
 * with simple context-stuffing (system instructions + full transcript +
 * prior turns + new question), no chunking/embedding/RAG. `ctx_shift` is
 * enabled below so a transcript that doesn't fit the context window gets
 * shifted rather than hard-failing — that's the cheap fallback, not a
 * retrieval pipeline.
 */
import { initLlama, releaseAllLlama, type LlamaContext } from "llama.rn";

import type { ModelTier } from "@/types/models";
import { getModelFile } from "./models";
import { LLM_PROFILES } from "./profiles";

let cachedContext: Promise<LlamaContext> | null = null;
let cachedTier: ModelTier | null = null;

async function getContext(tier: ModelTier): Promise<LlamaContext> {
  if (cachedContext && cachedTier === tier) {
    return cachedContext;
  }
  // Switching tiers is now a first-class, frequent action (multiple models
  // can be kept downloaded and switched between) — release whatever's
  // currently loaded first, so switching back and forth never holds two
  // multi-GB native contexts in memory at once.
  if (cachedContext) {
    await releaseAllLlama();
    cachedContext = null;
    cachedTier = null;
  }
  const modelFile = getModelFile(tier);
  const profile = LLM_PROFILES[tier];
  const promise = initLlama({
    model: modelFile.uri,
    n_ctx: profile.nCtx,
    n_threads: profile.nThreads,
    n_batch: profile.nBatch,
    use_mlock: profile.useMlock,
    ctx_shift: true,
  }).catch((error: unknown) => {
    cachedContext = null;
    cachedTier = null;
    throw error;
  });
  cachedContext = promise;
  cachedTier = tier;
  return promise;
}

/** Releases the native LLM context — call before deleting the active model file on disk. */
export async function releaseLlmContext(): Promise<void> {
  await releaseAllLlama();
  cachedContext = null;
  cachedTier = null;
}

/** Every tier's temperatureOffset is negative (see profiles.ts) — this is a
 * meeting-notes app, and a model that gets "creative" is a model that states
 * things nobody said, so every tier is nudged toward more deterministic
 * output, without touching the per-task base temperatures below (action
 * items still run colder than free-form chat, tier or no tier). Smaller
 * models are less well-calibrated and drift more easily, so Fast gets the
 * strongest pull. Clamped to stay non-negative. */
function applyTemperatureOffset(baseTemperature: number, tier: ModelTier): number {
  return Math.max(0, baseTemperature + LLM_PROFILES[tier].temperatureOffset);
}

// Meeting notes must never state something the transcript didn't actually
// say. Shared verbatim across summary/action-items/chat — a title carries no
// factual risk, so generateMeetingTitle is exempt — rather than each function
// hand-writing its own slightly different phrasing: one forceful, consistent
// instruction is what the weaker Fast tier especially needs to reliably follow.
const GROUNDING_RULE =
  "Base your answer only on the transcript provided. If something was not said, do not mention it, guess at it, or assume it — leave it out entirely rather than invent it.";

// Keep transcripts from blowing the context window before ctx_shift even
// gets a chance to kick in — this is a rough char-based cap, not a token
// count, intentionally conservative (~3 chars/token is a safe underestimate
// for English). Reserves room for the system/user prompt wrapper and for
// the completion itself, so prompt + instructions + response actually fit
// the tier's n_ctx — a transcript sized to fill it on its own leaves no
// budget for the model's answer, which for JSON output means it gets cut
// off mid-object and silently fails to parse (see extractActionItems)
// rather than just reading as a truncated sentence the way a cut-off
// summary would.
const CHARS_PER_TOKEN = 3;
const PROMPT_WRAPPER_TOKENS = 300; // system instructions + "Meeting transcript:" wrapper

function truncateTranscript(transcriptText: string, tier: ModelTier, maxCompletionTokens: number): string {
  const nCtx = LLM_PROFILES[tier].nCtx;
  const maxTranscriptChars = (nCtx - PROMPT_WRAPPER_TOKENS - maxCompletionTokens) * CHARS_PER_TOKEN;
  if (transcriptText.length <= maxTranscriptChars) return transcriptText;
  // Keep the tail: meetings tend to wrap up decisions/action items near the
  // end, and this is a stopgap until real chunking exists (see AGENTS.md).
  return `[...earlier portion of the transcript omitted...]\n\n${transcriptText.slice(-maxTranscriptChars)}`;
}

// Matches leaked chat-template role-header tokens, e.g. Llama 3.x's
// `<|start_header_id|>assistant<|end_header_id|>` or ChatML's `<|im_start|>assistant`.
// `content` is supposed to already have these stripped, but that filtering isn't
// reliable for every model/template (confirmed: this app's "Fast" tier leaks its
// Llama 3.2 header into `content` itself, not just the `text` fallback below).
const LEADING_CHAT_TEMPLATE_TOKENS = /^(?:<\|[^|>]*\|>\s*)+/;

/** `content` (reasoning/tool-call filtered) should be the right field to use, but
 * falls back to the raw `text` field in case a model leaves it empty, and strips
 * any leading chat-template tokens either field might still be carrying. */
function resolveCompletionText(result: { content: string; text: string }): string {
  const raw = (result.content || result.text).trim();
  return raw.replace(LEADING_CHAT_TEMPLATE_TOKENS, "").trim();
}

export async function generateMeetingSummary(transcriptText: string, tier: ModelTier): Promise<string> {
  const context = await getContext(tier);
  const profile = LLM_PROFILES[tier];
  const result = await context.completion({
    jinja: true,
    messages: [
      {
        role: "system",
        content:
          "You are Wrapup, an on-device assistant that writes concise meeting summaries. " +
          "Write plain prose (no headings, no bullet points), 3-6 sentences, covering what was " +
          `discussed and any decisions made. ${GROUNDING_RULE}`,
      },
      {
        role: "user",
        content: `Meeting transcript:\n\n${truncateTranscript(transcriptText, tier, 400)}`,
      },
    ],
    // No chain-of-thought needed for a short summary — and leaving thinking
    // on (the default whenever jinja is enabled) is what caused action-item
    // extraction to fail below, so it's turned off consistently here too.
    enable_thinking: false,
    n_predict: 400,
    temperature: applyTemperatureOffset(0.2, tier),
    top_p: profile.topP,
    min_p: profile.minP,
  });
  return resolveCompletionText(result);
}

/** Short, human-readable title for a manual dictation recorded without one
 * (calendar meetings already have a title from the calendar event). Runs off
 * the summary rather than the full transcript — it's already a concise
 * distillation of what the meeting was about, and keeps this call cheap. */
export async function generateMeetingTitle(summaryText: string, tier: ModelTier): Promise<string> {
  const context = await getContext(tier);
  const profile = LLM_PROFILES[tier];
  const result = await context.completion({
    jinja: true,
    messages: [
      {
        role: "system",
        content:
          "You are Wrapup, an on-device assistant that titles meetings. Read the summary below and write a " +
          'short, plain title for the meeting: at most 10 words, no quotes, no trailing punctuation, no ' +
          'prefixes like "Meeting about" or "Title:". Respond with just the title text.',
      },
      {
        role: "user",
        content: `Meeting summary:\n\n${summaryText}`,
      },
    ],
    enable_thinking: false,
    n_predict: 32,
    temperature: applyTemperatureOffset(0.3, tier),
    top_p: profile.topP,
    min_p: profile.minP,
  });
  return resolveCompletionText(result)
    .replace(/^["']|["']$/g, "")
    .replace(/[.!]+$/, "")
    .trim();
}

export type ExtractedActionItem = {
  text: string;
  ownerHint: string | null;
  dueDate: string | null;
};

const ACTION_ITEMS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          // Plain strings rather than string|null unions — grammar-constrained
          // JSON generation on small on-device models is more reliable with a
          // flat schema. Empty string means "unknown", normalized to null below.
          ownerHint: { type: "string" },
          dueDate: { type: "string" },
        },
        required: ["text", "ownerHint", "dueDate"],
      },
    },
  },
  required: ["items"],
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

export async function extractActionItems(transcriptText: string, tier: ModelTier): Promise<ExtractedActionItem[]> {
  const context = await getContext(tier);
  const profile = LLM_PROFILES[tier];
  const result = await context.completion({
    jinja: true,
    messages: [
      {
        role: "system",
        content:
          "You are Wrapup, an on-device assistant that extracts action items from meeting transcripts. " +
          "Only include concrete tasks someone committed to — not general discussion topics. " +
          `${GROUNDING_RULE} ` +
          'For each item, set "ownerHint" to the person\'s name if the transcript names one, otherwise "". ' +
          'Set "dueDate" to an ISO 8601 date (YYYY-MM-DD) only if the transcript contains an explicit, unambiguous date (like "by Friday" or "due March 15th"); do not infer or calculate relative dates. If no explicit date is stated, set "dueDate" to "". ' +
          "Return an empty items array if there are no clear action items. Respond with JSON only.",
      },
      {
        role: "user",
        content: `Meeting transcript:\n\n${truncateTranscript(transcriptText, tier, 500)}`,
      },
    ],
    // `enable_thinking` defaults to true whenever jinja is enabled, which
    // was the actual bug here: the model prepended a `<think>...</think>`
    // reasoning block before the grammar-constrained JSON, and llama.rn's
    // content/reasoning_content split failed to strip it for this model's
    // template — `content` came back empty, and falling back to the raw
    // `text` field surfaced the unstripped `<think>` tag, which isn't valid
    // JSON either. Turning thinking off skips the reasoning block entirely,
    // so the model goes straight to the JSON grammar.
    response_format: { type: "json_schema", json_schema: { schema: ACTION_ITEMS_SCHEMA } },
    enable_thinking: true,
    n_predict: 500,
    temperature: applyTemperatureOffset(0.1, tier),
    top_p: profile.topP,
    min_p: profile.minP,
  });

  const rawOutput = resolveCompletionText(result);
  // Belt-and-suspenders beyond the leading-token strip above: the schema always
  // produces a single top-level JSON object, so slicing between the outermost
  // braces discards anything a chat template still leaked before or after it
  // (e.g. a trailing `<|eot_id|>`) without needing to know that template's exact tokens.
  const jsonStart = rawOutput.indexOf("{");
  const jsonEnd = rawOutput.lastIndexOf("}");
  const jsonText = jsonStart !== -1 && jsonEnd > jsonStart ? rawOutput.slice(jsonStart, jsonEnd + 1) : rawOutput;

  try {
    const parsed = JSON.parse(jsonText) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items
      .filter((item): item is { text: string; ownerHint: string; dueDate: string } => {
        return (
          typeof item === "object" &&
          item !== null &&
          typeof (item as { text?: unknown }).text === "string" &&
          (item as { text: string }).text.trim().length > 0
        );
      })
      .map((item) => ({
        text: item.text.trim(),
        ownerHint: item.ownerHint.trim() || null,
        dueDate: ISO_DATE_PATTERN.test(item.dueDate) ? item.dueDate.slice(0, 10) : null,
      }));
  } catch (err) {
    // Local-only debug log (no transcript content) — see AGENTS.md Privacy & Network Rules.\
    console.error(rawOutput);
    console.error("[LLM] failed to parse action items JSON:", err instanceof Error ? err.message : err);
    return [];
  }
}

export type ChatTurn = { role: "user" | "assistant"; text: string };

/**
 * Generates the assistant's reply to the last entry in `history` (which
 * must be a user message). `history` before that is prior turns in this
 * meeting's chat, oldest first.
 */
export async function generateChatReply(params: {
  tier: ModelTier;
  transcriptText: string;
  meetingTitle: string;
  history: ChatTurn[];
}): Promise<string> {
  const { tier, transcriptText, meetingTitle, history } = params;
  const context = await getContext(tier);
  const profile = LLM_PROFILES[tier];
  const nCtx = LLM_PROFILES[tier].nCtx;
  const maxCompletionTokens = 400;

  // Reserve context budget for system instructions, title, wrapper text, history, and completion.
  const systemInstructionsPrefix =
    `You are Wrapup, an on-device assistant answering questions about one specific meeting: "${meetingTitle}". ` +
    `${GROUNDING_RULE} If the transcript doesn't contain the answer, say so plainly rather than guessing. ` +
    `Keep answers brief and conversational.\n\nMeeting transcript:\n\n`;
  const systemInstructionsTokens = Math.ceil(systemInstructionsPrefix.length / CHARS_PER_TOKEN);

  // Estimate history token cost (conservative: each turn has role overhead + content).
  const historyChars = history.reduce((sum, turn) => sum + turn.text.length + 20, 0); // +20 for role markers per turn
  const historyTokens = Math.ceil(historyChars / CHARS_PER_TOKEN);

  // Calculate remaining budget for transcript after reserving everything else.
  const transcriptBudgetTokens = nCtx - PROMPT_WRAPPER_TOKENS - systemInstructionsTokens - historyTokens - maxCompletionTokens;
  const maxTranscriptChars = Math.max(0, transcriptBudgetTokens * CHARS_PER_TOKEN);

  // Truncate transcript to fit the remaining budget.
  let finalTranscript = transcriptText;
  if (transcriptText.length > maxTranscriptChars) {
    finalTranscript = `[...earlier portion of the transcript omitted...]\n\n${transcriptText.slice(-maxTranscriptChars)}`;
  }

  // If history is still too large even after transcript truncation, trim oldest turns.
  let trimmedHistory = history;
  const totalEstimatedTokens = PROMPT_WRAPPER_TOKENS + systemInstructionsTokens + Math.ceil(finalTranscript.length / CHARS_PER_TOKEN) + historyTokens + maxCompletionTokens;
  if (totalEstimatedTokens > nCtx && history.length > 1) {
    // Keep at least the most recent user message (last turn must be user per contract).
    const recentTurnsToKeep = [];
    let accumulatedHistoryTokens = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const turnTokens = Math.ceil((history[i].text.length + 20) / CHARS_PER_TOKEN);
      if (accumulatedHistoryTokens + turnTokens + PROMPT_WRAPPER_TOKENS + systemInstructionsTokens + Math.ceil(finalTranscript.length / CHARS_PER_TOKEN) + maxCompletionTokens > nCtx) {
        break;
      }
      recentTurnsToKeep.unshift(history[i]);
      accumulatedHistoryTokens += turnTokens;
    }
    trimmedHistory = recentTurnsToKeep.length > 0 ? recentTurnsToKeep : [history[history.length - 1]];
  }

  const result = await context.completion({
    jinja: true,
    messages: [
      {
        role: "system",
        content: systemInstructionsPrefix + finalTranscript,
      },
      ...trimmedHistory.map((turn) => ({ role: turn.role, content: turn.text })),
    ],
    enable_thinking: true,
    n_predict: maxCompletionTokens,
    temperature: applyTemperatureOffset(0.3, tier),
    top_p: profile.topP,
    min_p: profile.minP,
  });

  return resolveCompletionText(result);
}
