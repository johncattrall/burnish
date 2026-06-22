# Releasing Burnish

How to cut a release and submit to the Obsidian community directory. Mirrors
https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin and the
[Developer policies](https://docs.obsidian.md/Developer+policies).

## Compliance checklist (Developer policies)

- [x] **LICENSE** present (MIT).
- [x] **README discloses network use** - which remote services are contacted and when.
- [x] **README discloses payment/account** - none required; optional hosted tier noted.
- [x] **No client-side telemetry / analytics.**
- [x] **No self-update mechanism.**
- [x] **No ads** (static or dynamic).
- [x] **Source is not obfuscated**; the bundle banner points back to this repo.
- [x] **Plugin `id` does not contain "obsidian"** (`burnish`).
- [x] **Does not imply official Obsidian status** (disclaimer in README).
- [x] **Privacy policy** for the hosted tier ([PRIVACY.md](../PRIVACY.md)).
- [x] Closed-source backend (Burnish Plus proxy) kept separate; the listed plugin is open source.

## Cut a release

1. Bump the version (updates `manifest.json` + `versions.json`):
   ```bash
   npm version patch   # or minor / major
   ```
   This runs `version-bump.mjs`. Commit the result.
2. Verify locally:
   ```bash
   npm run build && npm test
   ```
3. Push the tag. The version tag **must equal the manifest version, with no `v` prefix**:
   ```bash
   git push origin main --tags
   ```
4. The `release.yml` workflow builds and creates a GitHub release with `main.js`,
   `manifest.json`, and `styles.css` attached. (Or attach them manually to a release whose tag
   matches the manifest version.)

## First-time directory submission

1. Make the GitHub repo **public**.
2. Ensure a release exists with the three assets attached and the tag matching `manifest.json`.
3. Sign in to community.obsidian.md with your Obsidian account and link GitHub.
4. Plugins → New plugin → enter the repo URL.
5. **Set the payment label to "Optional payments"** (the plugin connects to a paid service / has an
   optional paid tier; this is required even though the free tier needs no payment).
6. Accept the Developer policies and confirm ongoing support. Submit.
7. Address automated-review feedback by pushing fixes and a new incremented release.

## Notes

- CI is GitHub Actions (`release.yml`) rather than the usual AWS CodePipeline default, because the
  Obsidian plugin ecosystem standardizes on a GitHub-release-asset flow and AWS auth would be
  overkill for an OSS plugin. (Logged in the project `decisions.md`.)
- `fundingUrl` in `manifest.json` is currently blank. Set it to a sponsor/donation or Plus purchase
  URL to show a "Support" link in the listing.
