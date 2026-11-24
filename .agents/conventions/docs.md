<!-- agent-scaffold:convention=docs -->
# Documentation conventions

Generic guide installed and refreshed by agent-scaffold; do not edit it here. The project's
own documentation, navigation, and nested `AGENTS.md` files win where they are more specific;
record project-specific facts there, not in this file.

Before restructuring, merging, pruning, moving, or renumbering pages, or introducing document
metadata, also read [documentation reorganization](docs-reorganization.md). An isolated
content or wording change does not need it.

## Find the owner before writing

- Follow the project's documentation map or navigation to the page that owns the fact. Keep
  one owner per detailed contract and link to it from overviews, recipes, and entry points
  instead of repeating it.
- Preserve the existing layout, language, filenames, numbering, and frontmatter. A directory
  name is a clue, not authority; do not restructure while making an unrelated content change.
- Change generated output (API references, rendered sites, inventories) through its generator
  or source, never by patching the output.
- Leave content owned by a Wiki, another repository, or a symlinked location with that owner;
  do not copy it in or write through it without authority.
- Add a page only for a distinct responsibility and link it from the existing navigation;
  otherwise extend the owning page. Do not seed empty directories or template catalogs.

## Current, intended, and historical content

- Distinguish implemented behavior, approved intent, drafts, and history. A plan, an
  approval, or a recent edit is not evidence of implementation. Compare current code and
  verified contracts with intended behavior; surface material disagreement rather than
  silently treating either a proposal as implemented or an implementation defect as policy.
- Keep dated evidence (release notes, validation records, measurements, external
  comparisons) as history with its date and source revision; do not rewrite it to match the
  present.
- When a plan is completed or superseded, stop it from instructing readers: keep its useful
  rationale and a pinned historical source, and point to the current owner. Use the project's
  status convention; do not keep completed steps as a parallel operating manual.
- One-off plans and audits normally belong in the issue or PR, not a permanent page, unless
  they record a durable decision.
- Read status or date metadata such as `status` and `updated` alongside the content,
  implementation, relevant decisions, and user intent; it is not proof of review, approval, or
  correctness. When a search excerpt omits it, check the source header before treating the
  text as implementation guidance. Moving or polishing a draft does not approve it.

## Changing documentation

- Update the owning page in the same change as the behavior it describes, and fix readers,
  links, and callers when content moves. Preserve unique content when merging pages.
- Take flags, routes, fields, and schemas from their implementation authority (source,
  `--help`, registrations, parsers), not from other prose. Check command cwd and effects before
  execution; even discovery wrappers are not automatically safe to run.
- Keep entry points such as root READMEs and `AGENTS.md` lean: route to detail rather than
  duplicate it. Keep translated entry points equivalent when the project maintains them.
- Recheck primary sources before changing an external claim; retain its applicable date/version
  and actual review date. An editorial edit alone is not a fresh external verification.

## Verification

Run applicable project Markdown, site-build, link, spelling, and navigation checks. Without
checkers, inspect changed relative links and anchors from their source files, active references
to removed paths, and navigation to the intended owners; run `git diff --check`. Existing
checkers may miss external links or anchors and do not prove semantic accuracy or runnable
examples. Review affected commands safely and report which were executed versus only inspected.
