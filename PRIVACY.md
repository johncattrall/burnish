# Burnish Privacy Policy

_Last updated: 2026-06-22_

Burnish is designed so that, by default, your notes never touch any server we run.

## What Burnish collects

**Nothing.** The Burnish plugin contains no telemetry, analytics, crash reporting, or tracking of
any kind. It does not phone home.

## Where your data goes

### Bring-your-own-key mode (default, free)

When you configure your own API key or a local model:

- Your note content (the note or selection you run an action on, with code, math, embeds and
  frontmatter masked) and your instruction are sent **directly from Obsidian to the provider you
  chose** (Anthropic, an OpenAI-compatible endpoint, or a local server you specify).
- Burnish operates **no server** in this mode and never receives, stores, or sees your content.
- Your handling of that data is then governed by **your chosen provider's** privacy policy.

### Burnish hosted tiers - Free and Pro (optional)

If you sign up with your email to use the hosted Burnish tiers:

- You provide your **email address**, and the gateway issues an opaque **account token** (not a
  license key) that is stored locally and sent with each request to authenticate you.
- Requests are sent to the Burnish gateway, which validates your token, enforces the tier limits
  (feature gate and monthly quota), and forwards the request to a model provider using its own key.
- **Note content is processed transiently and is not retained.** We do not store the text of your
  notes after a request completes.
- We log non-content metadata required to operate the service: your account token identifier, your
  email, timestamps, and token/action counts (for quota and billing). We do not log note content.
- **Payments** for Pro are handled entirely by [Polar](https://polar.sh) as Merchant of Record.
  Your card details go to Polar, not to Burnish; Burnish receives only your subscription status.

This section applies only if you explicitly sign up for a hosted tier. It does nothing unless you
enter your email.

## Local storage of keys

Your API keys and any Burnish account token are stored in this plugin's settings file (`data.json`) inside
your vault. **Obsidian does not encrypt plugin settings.** Anyone with access to your vault files
can read them. Treat the file accordingly and do not commit it to source control.

## Contact

Questions: open an issue at https://github.com/johncattrall/burnish/issues
