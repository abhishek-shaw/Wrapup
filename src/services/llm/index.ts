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

import { getModelFile } from "./models";
import type { ModelTier } from "@/types/models";

const N_CTX = 4096;

let cachedContext: Promise<LlamaContext> | null = null;
let cachedTier: ModelTier | null = null;

function getContext(tier: ModelTier): Promise<LlamaContext> {
  if (cachedContext && cachedTier === tier) {
    return cachedContext;
  }
  const modelFile = getModelFile(tier);
  const promise = initLlama({
    model: modelFile.uri,
    n_ctx: N_CTX,
    n_threads: 4,
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

// Keep transcripts from blowing the context window before ctx_shift even
// gets a chance to kick in — this is a rough char-based cap, not a token
// count, intentionally conservative (~3 chars/token is a safe underestimate
// for English) so the prompt + instructions + response still fit N_CTX.
const MAX_TRANSCRIPT_CHARS = N_CTX * 3;

function truncateTranscript(transcriptText: string): string {
  if (transcriptText.length <= MAX_TRANSCRIPT_CHARS) return transcriptText;
  // Keep the tail: meetings tend to wrap up decisions/action items near the
  // end, and this is a stopgap until real chunking exists (see AGENTS.md).
  return `[...earlier portion of the transcript omitted...]\n\n${transcriptText.slice(-MAX_TRANSCRIPT_CHARS)}`;
}

export async function generateMeetingSummary(transcriptText: string, tier: ModelTier): Promise<string> {
  const context = await getContext(tier);
  const result = await context.completion({
    jinja: true,
    messages: [
      {
        role: "system",
        content:
          "You are Wrapup, an on-device assistant that writes concise meeting summaries. " +
          "Write plain prose (no headings, no bullet points), 3-6 sentences, covering what was " +
          "discussed and any decisions made. Do not invent details that aren't in the transcript.",
      },
      {
        role: "user",
        content: `Meeting transcript:\n\n${truncateTranscript(transcriptText)}`,
      },
    ],
    n_predict: 400,
    temperature: 0.3,
  });
  return result.content.trim();
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
  const result = await context.completion({
    jinja: true,
    messages: [
      {
        role: "system",
        content:
          "You are Wrapup, an on-device assistant that extracts action items from meeting transcripts. " +
          "Only include concrete tasks someone committed to — not general discussion topics. " +
          'For each item, set "ownerHint" to the person\'s name if the transcript names one, otherwise "". ' +
          'Set "dueDate" to an ISO 8601 date (YYYY-MM-DD) only if the transcript states or clearly implies one, otherwise "". ' +
          "Return an empty items array if there are no clear action items. Respond with JSON only.",
      },
      {
        role: "user",
        content: `Meeting transcript:\n\n${truncateTranscript(transcriptText)}`,
      },
    ],
    response_format: { type: "json_schema", json_schema: { schema: ACTION_ITEMS_SCHEMA } },
    n_predict: 500,
    temperature: 0.1,
  });

  try {
    const parsed = JSON.parse(result.content) as { items?: unknown };
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
  } catch {
    // Local-only debug log (no transcript content) — see AGENTS.md Privacy & Network Rules.
    console.error("[LLM] failed to parse action items JSON");
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

  const result = await context.completion({
    jinja: true,
    messages: [
      {
        role: "system",
        content:
          `You are Wrapup, an on-device assistant answering questions about one specific meeting: "${meetingTitle}". ` +
          "Answer only using the transcript below — if it doesn't contain the answer, say so plainly rather than guessing. " +
          `Keep answers brief and conversational.\n\nMeeting transcript:\n\n${truncateTranscript(transcriptText)}`,
      },
      ...history.map((turn) => ({ role: turn.role, content: turn.text })),
    ],
    n_predict: 400,
    temperature: 0.4,
  });

  return result.content.trim();
}
