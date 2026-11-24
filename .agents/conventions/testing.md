<!-- agent-scaffold:convention=testing -->
# Testing conventions

Generic guide installed and refreshed by agent-scaffold; do not edit it here. The project's
test guide, runner configuration, and CI win where they are more specific; record
project-specific rules there, not in this file. Adapted in part from MIT-licensed material;
see [NOTICE](NOTICE.md).

## Use the project's harness

- Put tests where the project's discovery configuration finds them, and follow its
  framework, naming, fixtures, and test data. Confirm a new test is actually selected: zero
  discovered tests, a skipped suite, or stale build artifacts are not a pass.
- Keep the project's test-first scope and coverage gates. Where test-first is not required,
  a changed behavior still needs a test that fails without the change. Do not lower gates,
  add retries, or regenerate goldens to turn a legitimate failure green.

## Trustworthy expectations

- Derive expected values from the contract: a specification, protocol or schema,
  hand-checkable literals, or an independent model or invariant. Never compute them by
  calling or copying the implementation under test.
- Assert behavior and contractual effects through a stable public seam. Avoid private names,
  incidental ordering, and wording unless they are the contract. Inspect storage, files,
  queues, or the wire directly only when that representation is the subject.
- Check interactions when the interaction is the contract: a required frame, a single send,
  an audit event, or a forbidden contact.
- Correct a wrong oracle with evidence and an explained change, not a bulk update.

## Level and test doubles

- Choose the smallest level that exposes the risk. Use real entry points, processes, storage
  engines, or target devices when wiring, packaging, working directory, persistence
  semantics, or hardware is the risk. Not every change needs an end-to-end test.
- Use doubles for isolation, cost, control, or safety, not by default for every owned
  collaborator. A mock, fake, fixture, or simulator does not certify a vendor service, live
  authentication, engine-specific locking, or physical hardware; say what it cannot prove.

## Reproducibility and sensitivity

- Control clocks, randomness, and shared state through existing seams. Coordinate
  concurrency with barriers or controlled delivery, not sleeps. Isolate concurrent fixtures
  and clean up only test-owned resources.
- Diagnose flaky tests instead of hiding them with retries. A skip or quarantine is not a
  pass.
- For a high-risk or suspiciously green test, show sensitivity with a small counterexample
  or local fault injection that actually reaches the production boundary.
- Keep real credentials and production data out of fixtures. Performance and model-quality
  thresholds need the project's baseline and sampling policy, not a one-shot assertion.

## Difficult boundaries

- Avoid production-only test hooks. Prefer an existing dependency boundary, or a small
  behavior-preserving seam extraction while existing checks stay green.
- Keep minimized regressions and replay data from fuzz or property tests.
- Test the supported old/new compatibility window and interrupted migrations against the
  real engine's semantics.
- For security behavior, check both the rejection and the absence of the forbidden effect.
- A characterization test records current behavior; it does not approve every legacy
  defect.

## Explicit test-first work

When test-first is required or requested, watch the new test fail because the behavior is
missing (not because of a setup error or zero selected tests), implement, rerun the same
check, then refactor while it stays green. Do not stage a ceremonial failure for a
mechanical change whose authoritative verifier is different.

## Reporting

Report which checks ran and their results. Keep unit and offline results, integration
results, and real external or device evidence separate, and name the checks that could not
run.
