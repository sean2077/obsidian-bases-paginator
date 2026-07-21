---
name: obsidian-host-test
description: "Verify Bases Paginator changes in a real, running Obsidian app through the official CLI and CDP. Use after user-visible, data-flow, lifecycle, rendering, accessibility, CSS, or mobile changes need host evidence beyond Vitest, or when replacing Computer Use with a repeatable disposable-vault test."
---

# Obsidian Host Test

## Boundary

- Target only an explicitly named disposable vault. Never infer or use the active or primary vault.
- Keep note, frontmatter, Canvas, and `.base` content byte-for-byte unchanged. The runner may replace only this plugin's installed package and Obsidian-owned workspace/plugin settings.
- Exercise the real plugin view. A successful `base:query` alone does not verify pagination.
- Prefer CLI DOM, CDP input/accessibility, console capture, and screenshots. Use Computer Use only for OS dialogs or window chrome; leave real screen-reader and physical-device checks manual.

## Workflow

1. Run `obsidian help` and confirm the installed CLI exposes `plugin:reload`, `dev:errors`, `dev:console`, `dev:dom`, `dev:screenshot`, `dev:mobile`, `dev:cdp`, and `eval`.
2. Run the headless CI gate first: `npm ci`, `npm run fmt:check`, `npm run lint`, `npm test`, and `npm run build`.
3. Confirm the target vault is disposable and its fixture has at least two pages, a `.base` custom view, and an embedded named view. Do not repair fixtures in a primary vault.
4. Run the authoritative host entry:

   ```bash
   npm run test:host -- --vault obsidian-test-vault --base "Paginator QA.base" --embed "Dashboard.md"
   ```

5. Treat any nonzero exit as a failed host gate. Inspect the reported stage, Obsidian errors, console errors, and screenshots under `.oma/obsidian-host-test/`; fix and repeat.
6. Record the Obsidian version/channel, platform, fixture, JSON summary, and residual manual checks.

## Pass contract

The bundled runner must prove all of the following before exiting zero:

- The CLI resolved the explicit test vault, the packaged plugin was enabled and reloaded twice, and exactly one active paginator rendered.
- The first page, a CDP mouse transition to the second page, the embedded view, and desktop/390 px mobile renders have bounded rows and coherent status text.
- The accessibility tree exposes the four named navigation buttons, the page-size combobox, and live page status.
- Obsidian captured no errors or error-level console messages.
- Vault `.md`, `.base`, and `.canvas` hashes did not change.

The runner does not prove real NVDA, VoiceOver, or TalkBack speech; OS-level focus; hover timing outside the renderer; or physical iOS/Android behavior. Execute those residual checks when the change touches them.
