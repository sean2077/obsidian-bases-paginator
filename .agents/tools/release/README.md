# Release conventions

Read this page only when a task will select a version, prepare release notes, tag, publish, or
verify a release. It is not resident guidance; the project's own release documentation links
here and owns its concrete tag format, publisher and completion boundary, which win over the
generic defaults below.

`agent-scaffold` installs and refreshes this directory as scaffold runtime while the project's
`release` convention domain is selected. Do not hand-edit it; the analyzer and extractor are
read-only helpers and need Python 3.8+.

Drive one release from read-only planning through its verified repository-owned completion boundary. Keep generic
Git and SemVer analysis deterministic; leave version authorities, build commands, signing,
and artifact publication under the target repository's policy.

## Invariants

- A valid exact version supplied by the user is the target; infer a bump only when the user
  did not choose one. Surface conflicts, but do not reopen an explicit release choice.
- Plan without mutation first. Do not edit release files until the base, target, release
  workflow, and version authority are unambiguous.
- Release from a clean attached trunk or repository-approved release line/worktree with no merge, rebase/am, cherry-pick, revert, bisect, or sequencer operation in progress. Supply the expected branch from repository policy with `--release-branch <name>`; the analyzer does not infer it from the remote default branch.
- Preserve the repository's release-note authority: committed changelog, fragments,
  generated notes, or forge-native notes. Do not invent a root changelog by default.
- Use the repository-owned release workflow and obtain authorization for infrastructure changes.
- Keep every package/version identity semantically aligned with the tag.
- Stage the exact release snapshot, run its gates, and return to a clean tree before tagging.
- Never move, replace, or recreate an existing tag.
- Treat a pushed tag as completion only when repository policy explicitly makes it terminal.
  Otherwise verify every applicable downstream publisher or handoff; never invent a forge,
  registry, artifact, or deployment surface merely because another one is absent.

## Workflow

1. Read repository release policy and inspect the branch, worktree, remotes, version sources,
   complete tag format, changelog or fragments, notes producer, signing requirements, publisher,
   outputs, and release workflows. Fetch tags before selecting a base. When the observed flow is
   complete and unambiguous, use that established release flow. Read
   [changelog-backed release automation](#changelog-backed-release-automation) only for a real workflow
   gap or an explicitly requested comparison/adoption. Make no infrastructure change without
   authorization; an ordinary release request does not authorize redesigning its pipeline.
2. Run the installed read-only analyzer (Python 3.8+):

   ```bash
   python .agents/tools/release/release-plan.py --repo <repo-root> --json [--target vX.Y.Z] [--release-branch <name>]
   ```

   Resolve every `attention` result before mutation. Schema 2's `analyzed` status means only that local `v`-prefixed SemVer analysis completed; repository release policy remains unverified. Inspect `other_format_tags` against that policy instead of treating a candidate as publication approval. Preserve unprefixed or custom tag formats and use [version selection](#version-selection) manually when the model does not apply or Python is unavailable; disclose checks that could not run.
3. Follow the repository-owned release-note pipeline. Read
   [release notes and committed changelogs](#release-notes-and-committed-changelogs) only when the project maintains a committed
   changelog or needs a prepared notes file. Synchronize only authoritative project version
   files using [version files](#version-files). For stable promotion after
   alpha/beta/rc tags, also read
   [prerelease promotion](#prerelease-promotion). Get the date from the
   environment rather than guessing it.
4. Run repository release gates. Stage every release file and no unrelated path; verify with
   `git diff --cached --check` and short status, create the release commit using the project convention (for example, `release: <exact-tag>`), then require a clean tree. Create the repository-required signed tag or the default annotated tag, push the
   release branch/trunk, and push the tag without force.
5. Follow [publishing and completion evidence](#publishing-and-completion-evidence) and declare the repository-owned completion
   boundary before pushing. Stop at a verified pushed tag only when policy makes it terminal;
   otherwise run or observe the established workflow, publisher, or handoff. Create a direct
   forge release only when the forge is the established release surface and no workflow owns it.
6. Verify local, remote-branch, peeled-tag, and every applicable downstream publisher identity,
   then report the selected version and rationale, files changed, commit, tag, checks, and only
   the URLs or identities that the selected boundary actually exposes.

## Version selection

### Analyzer first

After fetching tags, prefer the installed read-only analyzer:

```bash
python .agents/tools/release/release-plan.py --repo <repo-root> --json [--target vX.Y.Z]
```

It checks clean/attached state, active Git operations, incomplete shallow history, reachable
strict-SemVer tags, equal-precedence build-metadata ambiguity, conventional-commit bump signals,
target availability, and prerelease decisions. Resolve its `attention` entries before mutation.
The manual rules below are the fallback and the review contract for the analyzer.

The analyzer models only local, reachable `v`-prefixed SemVer tags. JSON schema 2 returns `status: analyzed` and exit 0 when that calculation completes; `analysis_scope: local-v-prefixed-semver` and `release_policy: not_verified` make clear that publication eligibility has not been established. This replaces schema 1's ambiguous `ready` status. Exit 1 still requires attention and exit 2 indicates an analysis error. Remote freshness, repository tag policy, and downstream publication gates remain the caller's responsibility.

Every tag outside that model is listed in `other_format_tags` with a warning. The analyzer does not guess whether `release-2.0.0`, `release-2026.10.22`, or `nightly` denotes a release, date, or other marker. When modeled tags exist, the reported candidate is only a calculation within that model, not a decision to disregard the other tags. When other tags exist but none fit the model, it returns `tag-format` attention without a selected or inferred target; it cannot establish a first release. Use the repository's documented mapping for unprefixed or custom versions and resolve ambiguity before mutation.

Pass `--release-branch <name>` only after establishing the expected branch from repository policy. The analyzer compares HEAD with that exact branch and reports a mismatch; without it, branch policy is explicitly unchecked. A remote default branch is not assumed to be the publication branch. Neither this argument nor successful local analysis establishes authorization to publish.

For a manual fallback, an attached branch and empty `git status --porcelain` are not sufficient:
run `git status --long --branch` and stop if it reports a merge, rebase/am, cherry-pick, revert,
bisect, sequencer, or unresolved-conflict state. Finish or abort the owning Git operation before
release planning; never turn its pending commit into a release commit.

When the user supplied an exact valid target, keep it as the selected version. Compare it with
the inferred bump and report any mismatch, but ask only when the requested value is invalid,
already exists, not newer than the reachable base, or conflicts with project release policy.

### Choosing the next version

#### Bump inference (highest match wins)

Read subjects **and** bodies (`git log <base>..HEAD --pretty='%h %s%n%b%n---'`):

| Trigger | Bump | Example |
|---|---|---|
| `!` before the subject colon (`feat!:`, `fix!:`) or an uppercase `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer | MAJOR | `0.4.2 → 1.0.0` |
| any `feat:` / `feat(scope):` | MINOR | `0.4.2 → 0.5.0` |
| only `fix:` / `perf:` / `refactor:` / `docs:` / `chore:` / `test:` / `build:` / `style:` / `ci:` | PATCH | `0.4.2 → 0.4.3` |

A multi-parent commit without its own Conventional Commit or breaking-footer signal remains in
the JSON report with `kind: "merge"` for audit, but it does not become an unclassified bump
blocker; its child commits carry the version signal. A merge commit with an explicit conventional
or breaking signal is classified normally.

Commit types are case-insensitive (`FEAT:` and `feat:` are equivalent). The breaking footer token remains uppercase; treat `BREAKING CHANGE:` and `BREAKING-CHANGE:` as synonymous.

Pre-1.0 caution: many projects treat a breaking change before `1.0.0` as a MINOR bump rather than jumping to `1.0.0`. When the repo is still `0.y.z`, confirm with the user before auto-promoting a breaking change to `1.0.0`.

#### When to cut a prerelease

Default to a stable release. Use a prerelease only when the user wants a preview round:

- **customer/early trial** — ship to a few users first, gather feedback, then finalize → `v0.5.0-beta.1` … `v0.5.0`.
- **large change, want a bubble** — before a MAJOR, collect a round → `v1.0.0-rc.1` → `v1.0.0-rc.2` → `v1.0.0`.

Prerelease increment rules:

- first alpha: `-alpha.1`; subsequent under the same `vX.Y.Z`: `-alpha.2`, `-alpha.3`; alpha precedes beta.
- first beta: `-beta.1`; subsequent under the same `vX.Y.Z`: `-beta.2`, `-beta.3`.
- beta → rc: switch prefix and restart at `.1` → `v0.5.0-rc.1`.
- final: drop all suffixes → `v0.5.0`.

#### Base selection

Before enumerating tags, run `git rev-parse --is-shallow-repository`. In a shallow repository that flag covers every ref, so a repository-level `true` is not sufficient to prove that HEAD history is incomplete. List each apparent HEAD root with `git rev-list --max-parents=0 HEAD`, then inspect its raw commit headers before the first blank line with `git cat-file -p <root>`. A true root has no `parent` header; an apparent root whose raw object still records a `parent` is a HEAD-reachable shallow boundary. Stop before base selection only if an apparent HEAD root has a raw `parent` header, then deepen or unshallow the checkout; fetched tag refs alone do not restore missing ancestry. Never interpret tags hidden by such a boundary as a first release.

Enumerate every HEAD-reachable `v`-prefixed candidate first with `git tag --merged HEAD --list 'v[0-9]*'`. Strip exactly one leading `v`, then validate the remainder as full SemVer 2.0.0 before ranking it. Historical base tags may use the full specification even though these conventions deliberately create the narrower stable or numbered-prerelease forms defined in the **Prerelease increment rules** above.

Strict validity requires:

- exactly three numeric core identifiers with no leading zeroes (except `0` itself);
- non-empty prerelease identifiers containing only ASCII alphanumerics or hyphens, with no leading zeroes in numeric identifiers;
- optional non-empty build identifiers containing only ASCII alphanumerics or hyphens.

Thus `v01.2.3` and `v1.2.3-rc.01` are invalid. Reject them before ordering or truncating the candidate set.

Rank valid candidates by SemVer 2.0.0 precedence: compare major, minor, and patch numerically; a prerelease is lower than the matching stable version; compare prerelease identifiers numerically when both are numeric, otherwise by the SemVer numeric/non-numeric and ASCII rules. For example, `v1.1.0-rc.1 < v1.1.0`. Build metadata is valid but build metadata does not affect precedence. Git's `version:refname` order is not SemVer precedence and can change with `versionsort.suffix`, so never use Git version sort (or `sort -V`) as the selector.

Peel each tied tag object with `git rev-parse '<tag>^{commit}'`. When highest-precedence tags differ only by build metadata, use their shared commit as `<base>` only if they all resolve to that commit; otherwise stop and report the ambiguity.

Before using the result, run `git merge-base --is-ancestor <base> HEAD`. Status 1 means it is not HEAD-reachable; another nonzero status is a Git error. Stop instead of choosing a different tag by incidental list order.

- For a **prerelease** (`v0.5.0-beta.2`): base = the previous HEAD-reachable valid SemVer tag (including an earlier prerelease of the same version). Release notes cover that incremental range. If the project maintains a committed changelog, append its next section and retain earlier prerelease sections during the preview round.
- For a **stable** `vX.Y.Z` when same-`X.Y.Z` prereleases exist: see [prerelease promotion](#prerelease-promotion).
- First-ever release means there is no HEAD-reachable valid SemVer base: base = repo root (`git log` with no range, or `--root`); default start tag `v0.1.0` or the version file's current value.

### Unsupported models

- **Signed / GPG tags** — follow the repository's signing policy; the generic analyzer does not
  create or verify signatures.
- **Monorepo / multi-package versioning** — version-file sync assumes one project version. For independently-versioned packages in one repo, run the release per package (or use a dedicated monorepo release tool); these conventions do not coordinate multiple version lines under one tag.

## Version files

### Version-file sync

Keep the manifest identity aligned with what that ecosystem will publish. A git
tag is not a substitute for a package version: publishing `v0.5.0-beta.1` from a
manifest that says `0.5.0` can occupy or mislabel the final version.

| Ecosystem | Prerelease tag `v1.2.0-beta.1` | Final `v1.2.0` | Coupled files/tooling |
|---|---|---|---|
| Node | `package.json` version `1.2.0-beta.1` | `1.2.0` | update the package lock with the repository's package manager |
| Rust | `Cargo.toml` version `1.2.0-beta.1` | `1.2.0` | let Cargo update `Cargo.lock` when the package is represented there |
| Python | PEP 440 `1.2.0b1` / `1.2.0rc1` (`alpha.N` → `aN`, `beta.N` → `bN`, `rc.N` → `rcN`) | `1.2.0` | update the authoritative static version field; respect dynamic-version tooling |
| C/C++ (CMake) | keep `project(... VERSION 1.2.0)` numeric and update the repo's separate suffix field to `beta.1` | clear the suffix | stop and ask if the project has no defined suffix mechanism but ships prerelease artifacts |
| generic `VERSION` | follow the repo's documented format; default to `1.2.0-beta.1` when it is package-facing | `1.2.0` | update any generated mirrors through their authoritative command |

#### Python prerelease mapping boundary

[SemVer 2.0.0](https://semver.org/spec/v2.0.0.html) permits arbitrary valid prerelease
identifiers, while the [Python packaging version
scheme](https://packaging.python.org/en/latest/specifications/version-specifiers/) defines
`a`, `b`, and `rc` as its prerelease phases and gives `.devN` separate ordering semantics.
Therefore `v1.2.0-canary.1` remains a valid SemVer tag for historical base selection and
non-Python ecosystems, but it has no built-in Python mapping here.

For a Python version field, map only the lowercase numbered forms shown in the table by
default. If the repository documents another mapping in its packaging or dynamic-version
tooling, follow that rule and verify the resulting package identity. Otherwise stop before
writing release files, committing, tagging, or pushing. Never silently reinterpret an unknown
label as `.devN`, a local version, or the final release; those forms have different identity or
ordering semantics. This boundary does not narrow full-SemVer historical tag validation or the
values used by Node, Rust, and generic version files.

#### Bounded coupled-file updates

Ecosystem tools synchronize release files; they do not own the release commit, tag, or push, and
they must not widen the change into dependency upgrades.

- **Node (single-package npm project with an existing `package-lock.json`).** Inspect
  `preversion`, `version`, and `postversion` before invoking npm. If one is the repository's
  authoritative version-mirror or release flow, follow the repository documentation only after
  confirming it leaves commit/tag/push ownership to this workflow; if that is unclear, stop and
  ask. When those scripts are absent or confirmed unnecessary for release-file synchronization,
  do not hand-edit `package.json` first; run:

  ```bash
  npm version <version> --no-git-tag-version --ignore-scripts
  ```

  Verify that `package.json.version`, `package-lock.json.version`, and, when present,
  `package-lock.json.packages[""].version` all equal `<version>`, then inspect the diff for only
  the intended manifest and lock changes. For workspaces or another package manager, use the
  repository's bounded, documented equivalent instead of guessing.
- **Rust (standalone or shared-version workspace).** First locate the authoritative version source.
  If the member declares `version.workspace = true`, update the root
  `[workspace.package].version` and preserve that inheritance marker; otherwise update the direct
  member `[package].version`. Independently versioned workspaces stay on the repository's release
  tooling boundary below. With an existing `Cargo.lock` that already represents the target package,
  run:

  ```bash
  cargo update --workspace
  cargo metadata --locked --format-version 1
  ```

  The metadata call resolves the dependency graph so `--locked` fails if resolution would change
  the lock; it may fetch according to the repository's Cargo configuration but cannot rewrite the
  lock. Confirm it reports the intended workspace-package version and review `Cargo.lock` so
  unrelated dependency versions remain locked. If the lock is absent, the package is not
  represented, or the pinned Cargo lacks `--workspace`, follow the repository's documented flow or
  stop; never fall back to a bare dependency update or create a lockfile implicitly.

If the project has no version file, skip this step and say so.

## Release notes and committed changelogs

### Detect the release-note authority

Inspect release docs, existing changelog or fragment directories, and tag workflows before
editing. The repository's existing release-note contract wins:

- update its committed changelog in its current location and format;
- add or compile fragments through the repository's documented tool;
- let the tag workflow or forge generate notes when that is the established owner; or
- prepare a temporary notes file for direct publication without committing a new doc system.

Do not create `CHANGELOG.md` solely because a release was requested. Create or adopt a committed changelog
only when repository policy, the user, or an existing publication consumer requires it.

Keep the semantic version and complete repository tag distinct. The tag may be `v1.2.3`,
`1.2.3`, `release-1.2.3`, or another documented form; preserve it exactly in the changelog and
publisher instead of adding or removing a prefix.

### Build the selected notes

Use the planner's `release_notes_base` through `HEAD` range. Group commits according to the
repository's format and preserve user-facing wording, required issue links, migration impact,
and breaking-change notices. Omit internal-only detail unless the project normally publishes it.

For a stable promotion after same-version prereleases, follow
[prerelease promotion](#prerelease-promotion): consolidate the full previous-stable-to-HEAD
range when the committed changelog model needs one final section.

### Fallback committed changelog

Use this only when the project explicitly chooses a committed changelog but has no established
shape. Place it at the project-selected path; `<repo-root>/CHANGELOG.md` is a conventional fallback,
not a required location.

```markdown
# Changelog

## [<exact-tag>] — YYYY-MM-DD

### ⚠ Breaking
- <impact and migration note>

### Added
- <feat subject> (`<short-hash>`)

### Fixed
- <fix subject> (`<short-hash>`)

### Changed
- <refactor or perf subject> (`<short-hash>`)
```

- Omit empty sections and add project-relevant sections such as Docs or Chore only when useful.
- Keep one canonical release section and preserve the file's existing newest-first/oldest-first order.
- Use an unambiguous Git short hash; do not hard-code seven characters when repository scale
  requires a longer abbreviation.
- Insert with a bounded edit; never overwrite an existing changelog wholesale.

`<exact-tag>` is the complete stable or prerelease tag supplied by the repository, not a fixed
`vX.Y.Z` shape. For example, `## [v1.2.3] — 2026-07-21`,
`## [1.3.0-rc.1] — 2026-07-21`, and `## [release-1.2.3] — 2026-07-21` are all valid when they
match the actual tag exactly.

### Extract the preferred-flow notes

When a repository adopts this fallback heading for the preferred automated flow, extract the
trimmed body after the one matching heading through—but not including—the next level-one or
level-two ATX (`#` / `##`) heading, including up to three leading spaces. Fenced examples,
four-space indented code, and deeper headings remain body content. The target heading uses the
same indentation rule, and indented duplicates are still rejected.
Do not include the release heading itself in the notes file. The installed reference implementation
treats the complete tag as an opaque exact string:

```bash
python .agents/tools/release/extract-changelog.py \
  --changelog <changelog-path> \
  --tag "<complete-tag>" \
  --output <temporary-notes-path>
```

The command must fail before publication when the exact heading is missing, duplicated,
malformed, tag-mismatched, calendar-invalid, or empty. It never falls back to generated notes and
does not modify an existing output unless all validation succeeds. See
[changelog-backed release automation](#changelog-backed-release-automation) for adoption and CI ordering. Otherwise
use the consumer's actual parser contract rather than reshaping the changelog to fit this example.

## Prerelease promotion

The examples use the analyzer's `v`-prefixed tag model. For an established unprefixed or custom
mapping, apply the same SemVer-core comparison while preserving each complete repository tag;
stop for owner input when the stable/prerelease mapping is not documented and unambiguous.

### Promotion range and identity

When tagging a **stable** `vX.Y.Z` and same-`X.Y.Z` prerelease tags already exist (`vX.Y.Z-beta.N` / `-rc.N` / `-alpha.N`):

- **release-notes base** = the previous HEAD-reachable stable release, or repo root if none exists (skip all same-`X.Y.Z` prereleases), so final notes cover the whole span once regardless of their storage or publication owner.
- rewrite prerelease-aware manifests from their prerelease value to the final value (for example `1.2.0-rc.2` / `1.2.0rc2` → `1.2.0`); CMake clears its separate suffix while retaining numeric `X.Y.Z`.

Equal-precedence previous-stable tags (including build-metadata variants) must resolve to one
commit before deriving the notes range. Same-commit aliases are valid and yield one
tag label; different commits are an unresolved ambiguity. The analyzer reports it as a
`release-notes-base` attention item listing each tag and commit, and leaves the notes base unset
instead of choosing. That unset value means "stop and resolve", so do not read it as the
documented no-previous-stable case above, which ranges from the repository root.

When the project maintains a committed changelog with one section per prerelease, use a
replace-style update: delete the same-`X.Y.Z` prerelease sections and insert one final section
covering the previous-stable-to-HEAD range. Preserve the project's existing heading and category
format rather than forcing the fallback example in [release notes](#fallback-committed-changelog).

Illustration:

```markdown
# before
## [v0.5.0-rc.1] — 2026-02-02
## [v0.5.0-beta.1] — 2026-01-20
## [v0.4.2] — 2026-01-10     ← keep

# after
## [v0.5.0] — 2026-02-10     ← consolidated v0.4.2..v0.5.0
## [v0.4.2] — 2026-01-10     ← keep
```

Tagging a prerelease itself (`v0.5.0-beta.2`, `v0.5.0-rc.1`) does **not** merge — it appends and leaves older prerelease sections in place.

## Publishing and completion evidence

### Declare the completion boundary before pushing

Inspect project release docs, GitHub/GitLab workflows, package or artifact publishers, deployment
handoffs, and prior release evidence before creating the tag. Record which boundary the repository
defines as complete. If policy and evidence are ambiguous, stop before downstream publication and
ask the owner; absence of a tag workflow does not authorize a new forge release. Preserve the
selected owner's release-note source—committed changelog, fragments, generated notes, or another
repository-owned file.

#### Tag-only or external handoff

Use a pushed tag as the terminal boundary only when project policy or an explicit user decision
says so. Push the release branch and tag, verify both remote identities, and record any named
external handoff. Do not create a forge release or require a release URL for a tag-only boundary.

#### Tag-triggered release workflow

Match the candidate tag to the repository-owned workflow's accepted tag pattern before pushing:
a valid SemVer prerelease label such as `v1.2.0-canary.1` may still be unsupported there, and a
pushed tag cannot be moved. Push the release branch/trunk, then the tag. Wait for the tag workflow
and verify the outputs it actually owns: packages, artifacts, deployments, a forge release, or a
downstream handoff. Do not race it with a second manual publisher or substitute the fallback
changelog format for a workflow that already owns another note-generation contract.

##### Preferred changelog-backed workflow

When the repository adopts the preferred automated release flow, the complete CI tag is the
identity shared by the changelog heading, workflow, publisher, and verification. Validate and
extract exactly one non-empty section before any forge Release creation, registry publication,
artifact upload, deployment, or external handoff. A missing, duplicate, malformed, mismatched, or
empty section is a publication failure; do not fall back to generated notes. Follow
[changelog-backed release automation](#changelog-backed-release-automation) for the adoption gate and adaptable CI
sequence.

##### Workflow-owned generated notes

When the repository already owns an established workflow that owns note generation
independently, preserve that contract rather than forcing a committed changelog or the preferred
extractor. Generated notes remain valid only because repository policy selected them, not as a
fallback after changelog validation fails.

If CI succeeds but an output required by that workflow's contract does not appear, report the
missing output as a publication failure. A workflow that intentionally publishes no forge release
is not incomplete merely because the forge has no release page.

#### Project-owned direct publisher

When the repository publishes through an explicit package, artifact, deployment, or internal
release command, use that command and its authentication and preview policy. Verify the published
version or artifact resolves to the release commit/tag. Do not replace a registry or internal
publisher with `gh release create` or `glab release create`.

#### Direct forge release

Use this only when GitHub/GitLab is the repository's established public release surface and no
workflow owns release creation. Create the release from the already-pushed tag so the forge cannot
create a different tag. Pass the repository-owned or prepared notes file; when the project
explicitly uses GitHub-generated notes, use `--generate-notes` instead of fabricating a committed
changelog:

```bash
gh release create <exact-tag> --title <exact-tag> --notes-file <release-notes.md> --verify-tag
gh release create <exact-tag> --title <exact-tag> --generate-notes --verify-tag
glab release create <exact-tag> --notes-file <release-notes.md>
```

If the required publisher or CLI is unavailable or unauthenticated, stop after the safe pushed
state and report exactly what remains. Do not substitute an unverified web flow or a different
publication surface.

### Completion evidence

Always verify:

- the release commit is reachable from the intended remote trunk or release line;
- local and remote tags exist and peel to that release commit;
- the selected repository-owned completion boundary is explicit.

Then verify only the applicable downstream evidence:

- a tag workflow completed successfully and produced every output it owns;
- a package, artifact, deployment, or external handoff carries the intended version and identity;
- a forge release exists, has the intended draft/prerelease state, and targets the tag;
- each selected surface's URL or immutable identity is recorded when that surface exposes one.

Only the evidence for the selected boundary is mandatory. Do not require a forge release, package,
artifact, deployment, or URL that repository policy does not own.

Report partial success precisely. A release commit, pushed tag, CI run, registry publication,
artifact, forge release, handoff, and deployment are distinct states; never collapse a failure in
an applicable later state into “released.”

## Changelog-backed release automation

### Adoption and scope

Use this changelog-backed sequence when the repository owns it or the user authorizes its adoption. For a requested redesign or a demonstrated gap, compare alternatives and agree the affected changelog authority, workflow, permissions, publisher, and completion boundary.

Land and validate an authorized setup change before choosing or pushing its release tag, then rerun release planning. Existing release requests follow the established project flow.

Treat the complete repository tag as the release identity: it may be `v1.2.3`, `1.2.3`,
`release-1.2.3`, or another project-owned form. Do not change a prefix to fit an example.
The planner currently models `v`-prefixed SemVer tags. Preserve custom models and use
[version selection](#version-selection) manually; resolve a missing or ambiguous mapping with the owner.
The extractor treats `--tag` as an opaque exact string, independently of the planner.

### Repository-owned contract

1. Select the semantic version and complete tag from repository policy. Synchronize every
   authoritative version file and write one matching canonical changelog section.
2. Gate and commit the complete release snapshot, create the repository-required tag, then push
   the release line and tag without force.
3. Let tag-triggered CI check out that tag's commit and validate release notes before any forge
   Release creation, registry publication, artifact upload, deployment, or external handoff.
4. Extract the trimmed body for exactly one matching heading with the installed helper or an
   equivalent repository-owned implementation:

   ```bash
   python .agents/tools/release/extract-changelog.py \
     --changelog <changelog-path> \
     --tag "<complete-ci-tag>" \
     --output <temporary-notes-path>
   ```

5. Publish that notes file through the repository's declared publisher. Do not generate fallback
   notes or publish empty notes when extraction fails.
6. Wait for CI and verify that the workflow, published release or artifacts, complete tag, and
   release commit all identify the same release. Report each downstream state separately.

CI can call the committed `.agents/tools/release/extract-changelog.py` directly. When the project
needs a different format or must not depend on scaffold runtime, copy or adapt the extractor into a
repository-owned tool path; the project then owns that copy, its tests, and future format changes.

### Adaptable GitHub Actions illustration

This is a sequencing example, not a copy-ready universal workflow. Replace the trigger, action
ref, tool path, build, artifacts, permissions, prerelease flags, and verification with the target
repository's approved contract. Omit the forge Release step when another boundary owns completion.

```yaml
name: Release
on:
  push:
    tags: ["<repository-tag-pattern>"]

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<repository-approved-ref>
      - name: Validate release notes before publication
        shell: bash
        run: |
          python <repository-tool-path>/extract-changelog.py \
            --changelog <changelog-path> \
            --tag "$GITHUB_REF_NAME" \
            --output "$RUNNER_TEMP/release-notes.md"
      # Run repository-owned build and verification steps here.
      - name: Publish the repository-owned GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "$GITHUB_REF_NAME" \
            --verify-tag \
            --notes-file "$RUNNER_TEMP/release-notes.md"
      # Verify the Release, artifacts, tag, and checked-out commit here.
```

The exact CI tag is the join key across the workflow trigger, changelog heading, publisher, and
verification. Do not reconstruct it from a package version or assume a `v` prefix.
