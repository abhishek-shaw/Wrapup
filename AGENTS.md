You are an expert React Native and Expo engineer helping me build
Wrapup.

Write clean, simple, maintainable code. Prioritize clarity over
unnecessary abstraction.
Think like a senior mobile developer.

---

## Project Overview

We are building Wrapup, a privacy-first, fully offline voice/meeting
notes app. It listens to meetings and dictation, transcribes and
summarizes them entirely on-device, links recordings to the user's
calendar events, and tracks action items through to completion.

The app includes:
- Calendar integration (read the device calendar, display events)
- Heuristic + user-confirmed detection of which events are meetings
- Manual and event-triggered audio recording, with an explicit consent
  step and a persistent recording indicator
- On-device speech-to-text transcription (no cloud ASR, ever)
- On-device LLM summarization: meeting notes + extracted action items
- Local todo tracking linked back to the source meeting, with local
  reminders/nudges for incomplete items
- A per-meeting AI chat window: ask follow-up questions about a
  recorded meeting (e.g. "what did we decide about X?") and get
  answers from the on-device LLM using that meeting's transcript as
  context — entirely offline, same as summarization
- A calendar-style view where past recordings appear as entries on
  their original event
- A Library tab: a flat, searchable list of every past recording
  (meetings and manual dictations alike), grouped by month, searching
  transcript text on-device — not just titles — so recordings that
  don't map neatly to a calendar date are still easy to find
- An on-device model download flow: during onboarding, the user picks
  a model tier (Fast / Balanced / Best quality) and downloads it with
  a resumable progress bar; the choice and downloaded state are
  manageable later from Settings (switch tier, delete to free storage)
  — see "Model distribution" below for why this isn't bundled in the
  app itself

Keep the implementation simple and readable. This is not a chat app or
a SaaS product — there is no backend, and there should never need to be
one for the core features above.

---

## Brand & Mascot

The app is called Wrapup — short for "wrapping up" a meeting into a
clean summary and action list. Keep the tone friendly and reassuring,
not corporate or surveillance-y; this app listens to people's
conversations, so warmth in the branding matters for trust.

Mascot: a puppy. Use it to soften the "this app is recording you"
feeling into something approachable.
- Side-profile-style face: a rounded head, floppy ears drawn to
  subtly echo headphones/listening, circular eyes, a rounded nose, and
  a simple curved smile. This is the original, finalized design —
  keep this one; do not revisit the front-facing/upright-ear variants
  explored afterward.
- Palette: head/face `#FCE8C8`, ears `#D8791C`, eyes/nose/mouth
  `#3D2A16`. Use these exact values everywhere the mascot appears so it
  stays visually consistent across screens.
- Use the puppy mascot for: the app icon, the small avatar/profile icon
  on the Today screen, empty states ("no recordings yet"), the
  processing/transcribing loading state (small sound-wave marks near
  one ear to suggest listening), and a celebratory state when a todo
  list is completed.
- Do not use the mascot inside the recording-consent flow or the
  recording indicator itself — those moments should stay clear and
  serious, not cute, since they are a trust/consent surface.
- Keep mascot illustrations simple and flat (no gradients/shadows) to
  match the rest of the UI rules below.

---

## Tech Stack

- Expo (custom dev client — NOT Expo Go; the app has native modules and
  cannot run in the managed Expo Go sandbox)
- React Native
- TypeScript
- Expo Router
- NativeWind
- Zustand
- expo-sqlite (or op-sqlite) for structured local data — transcripts,
  summaries, todos, event links
- AsyncStorage for lightweight preferences only (not for transcripts or
  meeting content)
- expo-calendar for calendar read access
- expo-notifications for local reminders
- whisper.rn (whisper.cpp JSI bindings) for on-device transcription.
  Decided over React Native ExecuTorch's combined useWhisper/useLLM
  approach — using two separate, more mature libraries gives more
  direct control over each pipeline stage (model loading, memory
  management, streaming) than a unified hook abstraction would. Do not
  switch to ExecuTorch without an explicit decision to revisit this.
- llama.rn (llama.cpp JSI bindings) for on-device summarization,
  action-item extraction, and meeting chat. `@react-native-ai/llama`
  (a thin wrapper around llama.rn with built-in download/progress
  handling) is worth evaluating as a convenience layer on top of
  llama.rn specifically for the model download flow — but the
  underlying inference stays on llama.rn either way, for the same
  "more control" reason as above.
- expo-local-authentication (optional, for locking local data at rest)
- expo-local-authentication (optional, for locking local data at rest)

Do not introduce new major libraries unless there is a strong reason.
Ask before installing anything new. This applies especially to anything
that talks to a network — see Privacy & Network Rules below.

---

## Privacy & Network Rules (non-negotiable)

- The audio recording, transcription, and summarization pipeline must
  **never** make a network call, under any circumstances, for any
  reason — no cloud ASR fallback, no cloud LLM fallback, no analytics
  on transcript content, no telemetry containing meeting data.
- If a task seems to require a network call anywhere in this pipeline,
  stop and ask before implementing it rather than adding it "to make it
  work" or "just for now."
- General app infrastructure (checking for app updates, optional future
  calendar write-back, etc.) may use the network, but must be clearly
  separated from anything touching audio/transcripts/summaries.
- Never log full transcript or summary content to any remote crash
  reporting or analytics service. Local-only debug logs are fine.
- One explicit, narrow exception: downloading the ASR/LLM model files
  themselves is a network operation (the model weights are a static
  asset, not user data) and is allowed — see "Model distribution"
  below. This exception covers fetching the model file only. It does
  not extend to sending any audio, transcript, or prompt content over
  the network at any point, before or after the model is downloaded.

---

## Model distribution

The ASR and LLM model files are NOT bundled in the app binary. A
multi-GB model in the app store package hurts install size, cellular
download warnings, and review/update friction. Instead:

- **Onboarding offers a model choice**, mapped to confirmed GGUF files
  as of July 2026 (re-verify before launch, this space moves fast —
  especially the Gemma 4 file path, flagged below):
  - **Fast** — Llama 3.2 1B Instruct, Q4_K_M, **0.81 GB**.
    Repo: `bartowski/Llama-3.2-1B-Instruct-GGUF`
    File: `Llama-3.2-1B-Instruct-Q4_K_M.gguf`
    URL: `https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf`
  - **Balanced** (recommended default) — Phi-4 Mini Instruct, Q4_K_M,
    **2.49 GB**. Currently the strongest quality-to-speed tradeoff in
    this class on flagship phones.
    Repo: `bartowski/microsoft_Phi-4-mini-instruct-GGUF`
    File: `microsoft_Phi-4-mini-instruct-Q4_K_M.gguf`
    URL: `https://huggingface.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF/resolve/main/microsoft_Phi-4-mini-instruct-Q4_K_M.gguf`
  - **Best quality** — Gemma 4 E4B Instruct (Google's current
    small-model generation, Apache 2.0, supersedes Gemma 3n),
    UD-Q4_K_XL, **5.13 GB**. Do not offer anything larger as a phone
    tier — 7B-8B+ models push past what's usable on-device today, and
    thermal throttling degrades real-world speed even when a device
    technically has the memory.
    Repo: `unsloth/gemma-4-E4B-it-GGUF`
    File: `gemma-4-E4B-it-UD-Q4_K_XL.gguf` — **verify this exact path
    against the repo's Files tab before hardcoding it**; unsloth
    sometimes nests larger quants in per-quant subfolders rather than
    the repo root, unlike the two smaller tiers above.
    URL: `https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-UD-Q4_K_XL.gguf`
  - The user can skip this step entirely and download later from
    Settings; the app should remain usable for recording (just not
    summarizing/chatting) without a model installed.
  - Pull each file's SHA256 from its Hugging Face file page at
    implementation time for the checksum-verification step below —
    do not reuse a hash from a different uploader's quant of the same
    base model, since quantization methodology differs and the hash
    will not match.
- **Download via `expo-file-system`'s resumable download API**
  (`createDownloadResumable`); `@react-native-ai/llama`'s built-in
  `model.download()` with a progress callback is worth evaluating as a
  convenience layer specifically for this step — see Tech Stack above.
  Downloads must be pausable/resumable, not all-or-nothing — mobile
  networks are unreliable for multi-GB transfers.
- **Wi-Fi-only by default**, user-toggleable, checked before starting
  or resuming a download.
- **Storage location**: app's local document/cache directory, marked
  excluded from iCloud/Google account backup (e.g.
  `NSURLIsExcludedFromBackupKeyKey` on iOS) since these are large,
  re-downloadable asset files, not user data that needs backing up.
- **Source**: download directly from a stable, versioned Hugging Face
  model repo URL (or a self-hosted mirror if HF proves unreliable in
  practice) with a checksum/hash verification step after download
  completes, before marking the model as ready to use.
- **Settings must support**: viewing which model is active and its
  size on disk, switching to a different tier (which re-downloads),
  and deleting the model to free up storage. Deleting should clearly
  warn that summarization/chat won't work until a model is
  re-downloaded — recording and transcription (if using a separately
  managed, smaller Whisper model) can still be evaluated independently.
- **ASR model**: Whisper via whisper.rn is the default (see Tech
  Stack — decided over ExecuTorch for more direct control). The
  "base" tier, multilingual, is ~148 MB, small enough to bundle
  directly in the app or fold into the same onboarding download step
  as the LLM for one unified "downloading your on-device AI" moment.
  URL: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`
  (use `ggml-base.en.bin` instead if optimizing for English-only).
  Known limitation worth handling: Whisper can hallucinate text during
  silence, which matters for meetings with pauses — add a
  voice-activity-detection pass before transcription rather than
  feeding raw audio straight to Whisper. Moonshine is an emerging
  purpose-built-for-mobile alternative (as small as ~27 MB) worth a
  benchmark pass before launch, but Whisper's ecosystem maturity makes
  it the safer default today.

---

## Development Philosophy

Build feature by feature.

For every feature:
1. Read this file first.
2. Keep the implementation simple.
3. Avoid overengineering.
4. Prefer readable code over clever code.
5. Build the smallest useful version first.
6. Refactor only when repetition appears.

---

## Decision Making

If something is unclear or could be improved, suggest a better
approach. If a new library would significantly help, recommend it,
explain why, and ask before adding it.

Do not install new libraries without approval.

---

## Architecture

Use this folder structure:

```
app/
  (tabs)/
    today.tsx       # Today tab — today's calendar events + record button
    library.tsx      # Library tab — searchable list of all past recordings
    todos.tsx        # Todos tab — action items across all meetings
    settings.tsx     # Settings tab — permissions, model choice, privacy status
  meeting/[id]/
  meeting/[id]/chat/
components/
constants/
data/
hooks/
lib/
services/
  asr/            # whisper.rn wrapper, model loading, chunking
  llm/            # llama.rn wrapper, prompt templates, JSON parsing
  calendar/       # expo-calendar wrapper, meeting-detection heuristic
  recording/      # audio capture, foreground service bridge, consent flow
  chat/           # per-meeting chat: prompt construction from transcript
                  # + chat history, RAG/chunking fallback for long
                  # meetings (add only once simple context-stuffing
                  # proves insufficient on real recordings)
db/
  schema.ts
  queries/
store/
types/
assets/
```

**app/** is for routes and screens only. Screens compose components and
call hooks or stores. They should not contain large reusable UI blocks,
native module calls, or business logic — those belong in `services/`.

**components/** is for reusable UI. Create a component when it is
reused in multiple places, when it makes a screen easier to read, or
when it represents a clear UI concept. Examples for this app: EventCard,
RecordButton, RecordingIndicator, ConsentModal, TranscriptView,
ChatBubble, ChatInputBar, SuggestedQuestionChip,
SummaryCard, TodoItem, TodoProgressBadge. Do not create components too
early.

**services/** is for native/external integration boundaries — ASR,
LLM, calendar, and recording each get their own module so the rest of
the app never talks to `whisper.rn`/`llama.rn`/`expo-calendar` directly.
This keeps native-module churn isolated to one place per concern.

**db/** holds the SQLite schema and typed query functions. This is the
source of truth for meetings, transcripts, summaries, todos, and
per-meeting chat history — not AsyncStorage. Chat messages are stored
per meeting (`chat_messages` table keyed by `meeting_id`) so
conversations persist across app restarts, same as everything else.
The Library tab's search runs against transcript and summary text
on-device — use a SQLite FTS5 virtual table indexing those columns
rather than a naive `LIKE` query, so search stays fast as recordings
accumulate.

**data/** holds hardcoded content (onboarding copy, static lists). Keep
it typed.

**store/** holds Zustand stores. Examples of state to keep here:
`recordingState` (idle/recording/processing), `activeMeetingId`,
`currentTranscriptDraft`, `todos` (in-memory cache backed by db/),
`activeChatMessages` (in-memory cache for the open meeting's chat,
backed by db/), `chatGenerating` (bool, for streaming/loading state),
`settings` (model size choice, auto-record preference, consent
defaults). Persist only lightweight preference fields with AsyncStorage;
persist actual meeting content through `db/`.

The Todos tab bar icon shows a badge with the count of overdue or
due-soon (incomplete) todos — not the total count of all open todos.
An all-open count grows large over time and stops feeling actionable;
overdue/due-soon stays meaningful as a "needs attention now" signal.
Derive it directly from `todos` in the store rather than a separate
counter.

**lib/** holds small external service helpers with no natural home
elsewhere (e.g. `cn.ts` for class merging). Never expose secret keys
here — this app should not have any secret keys for its core features.

---

## UI Rules

For any UI task:
- Replicate the provided design exactly.
- Match layout, spacing, padding, font sizes, font hierarchy, colors,
  border radius, shadows, alignment, and proportions.
- Do not approximate. Do not simplify unless explicitly asked.
- The recording state (recording / processing / idle) must always be
  visually unambiguous — this is a consent and trust surface, not just
  a UI nicety.

---

## Styling Rules

Use NativeWind classes. Do not use StyleSheet unless it is not possible
to style with className.

Use the NativeWind version installed in this project. Check
package.json. Do not upgrade without approval.

Reuse class patterns through utilities in global.css.

### Style Exception List

Use StyleSheet or inline styles for:
- SafeAreaView (className not supported)
- KeyboardAvoidingView (behavior props)
- Modal (visible, transparent props)
- Animated.View (animated style values)
- Dynamic styles calculated at runtime
- Platform specific styles
- Pressable or TouchableOpacity pressed states
- Shadows (different per platform)

Everywhere else, use NativeWind.

---

## Image Rule

Use centralized image imports.

1. Check if constants/images.ts exists.
2. If not, create it.
3. Import all app images there.
4. Use them through the centralized object.

```ts
import mascot from "@/assets/images/mascot.png";

export const images = {
  mascot,
};
```

```tsx
<Image source={images.mascot} />
```

Do not import image assets directly inside screens or components.

---

## State Management

- Zustand for global client state (recording state, active meeting,
  in-memory todo cache, settings).
- Local state for temporary UI state (form inputs, modal open/closed).
- AsyncStorage for lightweight preference persistence only.
- SQLite (`db/`) for all durable meeting content — transcripts,
  summaries, todos, event links. This is not optional: meeting content
  must never live only in AsyncStorage or in-memory state.

---

## TypeScript

- Strict mode.
- No `any`.
- Keep types simple and readable.
- Native module boundaries (whisper.rn, llama.rn, expo-calendar) should
  be wrapped with typed function signatures in `services/`, not called
  ad hoc from components.

---

## Feature Implementation

When building a feature:
1. Read this file first.
2. Identify the files to change.
3. Keep changes focused.
4. Do not rewrite unrelated code.
5. Follow existing patterns.
6. Make sure the feature works end to end.
7. Fix lint and type errors before finishing.
8. If the feature touches recording, transcription, or summarization,
   re-check it against Privacy & Network Rules before finishing.

### Meeting chat feature note

Start with the simplest version: construct each prompt as
`[system instructions] + [full transcript] + [prior chat turns in this
session] + [new question]` and send directly to `llama.rn`. Do not
build chunking/embedding/RAG retrieval up front — only add it once a
real recorded meeting's transcript is confirmed to overflow the
model's practical context window. This is the same "build the smallest
useful version first" rule as everywhere else in this file; a
meeting-chat RAG pipeline is a much bigger feature than it looks and
isn't worth it until the simple version actually breaks.

---

## Secrets

- This app has no server and should need no secret API keys for its
  core features (calendar, recording, transcription, summarization,
  todos). If a task seems to require one, stop and ask — it likely
  means a cloud dependency has crept in where it shouldn't be.
- Never expose secret keys in client code.
- Any future optional cloud feature (e.g. opt-in backup/sync) must be
  clearly separated from the core offline pipeline and requires
  explicit approval before implementation.

---

## Authentication

No cloud authentication and no user accounts are required for this app
— all data is local to the device. Optionally, use
`expo-local-authentication` to gate app access with device
biometrics/passcode as a local data-at-rest protection, not as identity
or account auth. Do not build or introduce a cloud auth provider unless
explicitly requested.

---

## Communication

Be concise. Explain what changed and how to test it. For any change
touching the recording/ASR/LLM pipeline, explicitly confirm no network
call was introduced.

---

## Final Reminder

Before every feature:
- Read this file.
- Follow it strictly.
- Build clean, simple code.
- Replicate UI exactly when designs are provided.
- Never let audio, transcripts, or summaries touch the network.