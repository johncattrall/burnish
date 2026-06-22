# Burnish Architecture

## Overview

Burnish is a TypeScript Obsidian plugin bundled with esbuild into a single `main.js`. It has no
backend in the default (bring-your-own-key) mode: the plugin talks directly to the LLM provider the
user configures. An optional hosted "Burnish Plus" proxy is a separate, out-of-repo backend.

## Layers

- **`providers/`** — provider abstraction. `Provider.complete()` returns `AsyncIterable<string>`.
  `AnthropicProvider`, `OpenAIProvider` (any OpenAI-compatible base URL) and `HostedProvider`
  implement it. `http.ts` streams Server-Sent Events via `fetch`, falling back to Obsidian's
  `requestUrl` (buffered) when streaming fails (e.g. mobile/CORS). `factory.ts` builds the active
  provider from settings.
- **`core/`** — pure, Obsidian-free logic (so it is unit-testable):
  - `diff.ts` — line diff grouped into hunks; `reconstruct()` rebuilds the document from the set of
    accepted hunks (all accepted == model output, none == original).
  - `context.ts` — builds the model request; splits frontmatter from body.
  - `variables.ts` — `{{variable}}` substitution and grit guidance.
  - `actions.ts` — built-in presets (same `PromptAction` shape as user prompts).
  - `promptLibrary.ts` — action lookup, glob-to-regexp, per-folder defaults.
  - `merge.ts`, `mermaid.ts`, `tables.ts`, `moc.ts` — prompt builders for those workflows.
  - `history.ts` — snapshot store for rollback.
- **`util/`** — `protect.ts` (mask/restore code/math/embeds/frontmatter), `chunk.ts` (token
  estimate + chunking for the cost guard), `apply.ts` (write to the editor as one transaction).
- **`ui/`** — `DiffModal` (stream + per-hunk accept/reject), `ActionPicker`, `PromptInputModal`,
  `FilePickerModal`, `HistoryModal`.
- **`settings/`** — settings model + defaults and the settings tab.
- **`main.ts`** — plugin entry: loads settings, registers commands / menu / ribbon / hotkeys,
  orchestrates each run flow, and runs batch / scheduled jobs.

## Key design points

- **Diff-before-write is mandatory** for cleanup actions; generative actions (Mermaid, tables,
  MOC) insert at the cursor or write a new note and never overwrite.
- **Single-undo apply** via `editor.transaction`.
- **Protected regions** are masked before send and restored after; dropped regions are surfaced as
  a warning in the diff modal.
- **Non-previewed edits (batch, scheduled) snapshot the original to history first**, so they remain
  reversible — preserving the "never destroy notes silently" principle.
- **Mobile-safe**: no Node `fs`/`http`; network via `fetch`/`requestUrl` only.

## Data

- Settings and history snapshots live in the plugin's `data.json` (unencrypted, in-vault).
- No telemetry, no analytics, no self-update mechanism.

## Tests

`node --test` over `tests/*.test.ts` covers the pure logic: diff/reconstruct math, protect
round-trip, variable substitution, chunking, history, and the generative normalizers.
