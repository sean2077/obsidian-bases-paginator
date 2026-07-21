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

1. Run `obsidian help` and confirm the installed CLI exposes the commands checked by the bundled runner, including `base:query`, plugin lifecycle, reload, debug/error capture, DOM, screenshot, mobile, CDP, and eval commands.
2. Run the headless CI gate first: `npm ci`, `npm run fmt:check`, `npm run lint`, `npm test`, and `npm run build`.
3. Prepare or refresh the tracked fixture only in an explicitly named disposable vault:

   ```bash
   npm run test:host:setup -- --target "/absolute/path/to/obsidian-test-vault" --adopt
   ```

4. Run the authoritative host entry against the same registered vault:

   ```bash
   npm run test:host -- --vault obsidian-test-vault --scenarios tests/fixtures/host-vault/scenarios.json
   ```

5. Treat any nonzero exit as a failed host gate. Inspect the reported stage, error buffers, and screenshots under `.oma/obsidian-host-test/`; fix and repeat. The legacy `--base`/`--embed` form is a smoke test, not the full gate.
6. Record the Obsidian version/channel, platform, fixture ID, JSON summary, performance evidence, and relevant residual manual checks.

## Pass contract

The bundled runner must prove all of the following before exiting zero:

- The CLI resolved the explicit test vault through its guarded fallbacks, native `base:query` totals matched every tracked scenario, and fixture paths were fully covered where page walks are requested.
- The packaged plugin survived disable/re-enable and repeated reloads without duplicate active views.
- Empty, one-row, exact-boundary, limited, grouped, malformed legacy, native-value, custom page-size, and 1,200-row views have bounded rows and coherent status text.
- Direct and embedded views, CDP mouse and keyboard transitions, invalid custom input, desktop/390 px mobile renders, and focus visibility passed.
- The accessibility tree exposes named navigation and table landmarks, buttons, combobox, and live status roles.
- Obsidian captured no errors or error-level console messages.
- Every vault file outside the Obsidian config directory retained the same content hash.

The runner reports timing and heap data as evidence, not a hard performance budget. It does not prove real NVDA, VoiceOver, or TalkBack speech; OS-level window focus; hover timing outside the renderer; visual quality in every theme; or physical iOS/Android behavior. Execute only the residual checks touched by the change.
