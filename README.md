# Burnish

> Polish your notes with an LLM, like burnishing a stone.

Burnish sends the current note (or selection) to an LLM, applies a cleanup action, and
**always shows a diff preview with per-hunk accept/reject before anything is written**. Edits
apply as a single undo step, and code, math, embeds and frontmatter are protected from changes.

Use a one-tap preset (Tidy, Restructure, Distill...), write your own reusable prompts, generate
Mermaid diagrams and tables, build a Map of Content, or merge several people's meeting notes into
one deduplicated note without losing information.

## Features

- **Diff preview, always.** Every change is shown as a per-hunk diff you accept or reject. Nothing
  is written until you click Apply, and Apply is a single Cmd/Ctrl-Z undo.
- **Presets and custom prompts** share one mechanism. Edit the built-ins or add your own, each with
  an optional hotkey, command and context-menu entry.
- **Prompt variables** — `{{title}}`, `{{date}}`, `{{selection}}`, `{{path}}`, `{{frontmatter.key}}`,
  `{{grit}}`.
- **Grit levels** (light / medium / deep) control rewrite aggressiveness.
- **Per-folder defaults** — different default action/model by path glob.
- **Merge & dedupe meeting notes** into one structured note, flagging conflicts and keeping
  anything unmergeable verbatim in an appendix.
- **Generative**: Mermaid diagrams and Markdown tables (inserted at the cursor), and Map-of-Content
  scaffolding across notes.
- **Protected regions** — fenced code, inline code, math, embeds and YAML frontmatter are masked
  before sending and restored after.
- **History & rollback** — Burnish snapshots a note before it rewrites it, so any edit (including
  batch and scheduled runs) can be rolled back.
- **Batch & scheduled** — run an action across many notes, or tidy a folder once a day.
- **Cost guard** — warns before sending very large notes.

## Network use

Burnish makes network requests **only to the LLM provider you configure**, and only when you
trigger an action. There is no other network activity. Specifically:

- **Anthropic** — requests go to `https://api.anthropic.com` (or a base URL you set).
- **OpenAI-compatible** — requests go to the **base URL you enter** (OpenAI, OpenRouter, Groq, or a
  local server such as Ollama / LM Studio / vLLM). Nothing is sent anywhere else.
- **Burnish Plus (optional, hosted)** — if you opt in and paste a license key, requests go to the
  Burnish proxy, which forwards them to a model provider. See **Privacy** below.

The content sent is the note or selection you run an action on (with code/math/embeds/frontmatter
masked) plus your instruction. Your API keys are sent only to the provider they belong to.

## Privacy & data

- **Burnish itself collects no data and contains no telemetry or analytics.**
- With your **own API key** (the default, free), your note content goes **directly from Obsidian to
  the provider you chose**. Burnish operates no server in this mode and never sees your content.
- API and license keys are stored in this plugin's settings inside your vault (`data.json`).
  **Obsidian does not encrypt plugin settings** — treat the file accordingly.
- The optional hosted **Burnish Plus** tier processes note content transiently on its server to
  proxy the model call and does not retain note content. Full details are in
  [PRIVACY.md](PRIVACY.md).

## Payment & account

- **No payment or account is required.** All features work with your own API key (or a free local
  model).
- An **optional** paid "Burnish Plus" tier (a hosted endpoint, no key needed) is planned. It is not
  required for any feature listed above.

## Install

### From the community plugin browser
Once listed: Settings → Community plugins → Browse → search "Burnish" → Install → Enable.

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest
   [release](https://github.com/johncattrall/burnish/releases).
2. Copy them into `<your vault>/.obsidian/plugins/burnish/`.
3. Reload Obsidian and enable Burnish under Settings → Community plugins.

## Setup

1. Open Settings → Burnish.
2. Choose a provider and paste your API key (or set a local base URL).
3. Open a note and run **Burnish: Tidy** from the command palette, the ✨ ribbon icon, or the
   editor right-click menu. Review the diff and Apply.

## Usage

- **Selection vs. note** — if text is selected, the action runs on the selection; otherwise the
  whole note (frontmatter excluded).
- **Merge meeting notes** — `Burnish: Merge & dedupe meeting notes` (current note, or pick files).
- **History** — `Burnish: Version history for current note` to roll back.

## Hotkeys

Every preset **and** every custom prompt is registered as its own Obsidian command, so each can have
its own hotkey:

1. Open **Settings → Hotkeys**.
2. Search for **Burnish** (or the action's name, e.g. `Burnish: Tidy`).
3. Click the **+** next to a command and press your key combination.

Notes:

- Obsidian ships with no default hotkeys for Burnish, so there are no conflicts to clear; you bind
  only the ones you want.
- Commands run on the active note's selection (or the whole note if nothing is selected), exactly
  like triggering from the palette.
- When you **add or rename a prompt** in Burnish settings, its command updates immediately — the new
  `Burnish: <name>` entry appears in the Hotkeys list ready to bind. (After **deleting** a prompt,
  its command disappears from the list on the next Obsidian reload.)
- Useful ones to bind: `Burnish: Tidy`, `Burnish: Custom instruction…`, and `Burnish: Pick an
  action…` (the fuzzy picker) for one keystroke to everything.

## Development

```bash
npm install
npm run dev      # watch build
npm run build    # typecheck + production bundle
npm test         # unit tests (diff, protect, variables, chunk, history, generative)
```

The plugin frontend is open source (MIT). The hosted Burnish Plus proxy, if/when shipped, is a
separate backend.

## License

[MIT](LICENSE) © John Cattrall

Burnish is an independent community plugin and is not affiliated with or endorsed by Obsidian.
