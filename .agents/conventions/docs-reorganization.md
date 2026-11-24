<!-- agent-scaffold:convention=docs-reorganization -->
# Documentation reorganization

Generic guide installed and refreshed by agent-scaffold with the
[documentation conventions](docs.md); do not edit it here. Read it before restructuring,
merging, pruning, moving, or renumbering pages, or introducing document metadata. The
documentation conventions still apply, and the project's own documentation wins where it is
more specific. Scale the work to the change: a single move needs its destination, preserved
content, and affected links, not a project-wide inventory or reader exercise.

## Choose structure from reader tasks

For a material reorganization, inspect the affected readers, recurring tasks, search terms,
ownership, lifecycle, and site-generator constraints. Scope the inventory to the change;
a focused README can suffice for a small project. Compare viable groupings only where a
meaningful choice remains unresolved:

| Grouping | Useful when | Watch for |
|---|---|---|
| Reader role | Prerequisites, permissions, or outcomes differ | Duplicating shared facts across roles |
| Task or journey | Readers seek an outcome or incident procedure | Hiding stable owners inside cross-cutting workflows |
| Domain and ownership | Concepts and decisions have distinct owners or lifecycles | Mistaking team names or source folders for domain boundaries |
| Product or interface | Readers recognize stable products, APIs, CLIs, or SDKs | Path churn from incidental implementation boundaries |
| Content purpose | Learning, how-to, explanation, and reference need different treatment | Fragmenting a small coherent page just to fill categories |
| Lifecycle and authority | Proposals, current contracts, generated output, and history differ | Status buckets that leave subject ownership unclear |

Use representative documents and reader tasks to test whether homes are predictable, owners
are clear, and routine changes avoid unrelated moves or excessive nesting. Subtrees may use
different groupings; secondary routes should link to the same canonical information. Retain
consequential rationale in the existing decision process or PR, not a mandatory new record.
Use delegated authority; surface costly unresolved choices without blocking independent safe work.

Keep the root README focused on orientation and a useful start. A docs landing page exposes
setup, design, development, and operational routes where applicable, and distinguishes current
guidance from proposals, generated copies, and history. Neither needs to duplicate the manuals.

### Optional local ordering

Preserve coherent numbering or generator-owned navigation. Add numeric prefixes only when a
stable sibling reading/display order justifies path and link churn. Name groups by meaning;
`10-`, `20-`, and `30-` leave insertion gaps, and `00-` can mark a genuine first stop. A prefix
is a sibling position, not a universal category code. Files, directories, both, or neither may
be numbered; deeper ordering needs its own reader benefit. Reconcile consumers after renumbering.

## Lightweight metadata

Follow the project's convention. When status or freshness would otherwise be ambiguous, a
small flat header can help; neither these fields nor these status values are mandatory:

```yaml
---
status: needs-revision
updated: "2026-09-08"
---
```

`status` describes the document's condition in project terms; `updated` records the last
meaningful content change when known. Update metadata when meaning or status changes. Preserve
useful project fields and repair source/replacement links in them during migration. Add flat
fields only for an actual consumer, not a universal schema or lifecycle gate. Formats with
their own frontmatter, including `SKILL.md`, permit only fields within that schema; change
generated metadata through its source.

## Merge, prune, and migrate safely

For each affected source, identify its action and destination: keep, rename, move, split,
merge, delete, or retain as history. A small change can keep this map in the working diff or PR;
do not introduce a permanent inventory. Before deleting, establish that useful content is
preserved at a named maintained destination, is already duplicated by its canonical owner,
is no longer true and has no remaining historical need, or is generated residue with a known
source/output policy. Mere age or an unfamiliar filename is not deletion evidence.

Archive only for an identifiable reader, audit, migration, or incident-review need. Do not
use an archive as a dumping ground for uncertain active content; preserve the ambiguous part
and report unresolved ownership. Merges preserve unique facts, qualifications, rationale,
and metadata meaning; reorganization does not adopt the documents' decisions.

Search old paths, relevant filename variants, and changed headings across active consumers,
including hidden configuration directories. Update navigation/backlinks, Markdown and code
comments, contributor guides, package metadata, docs-site configuration, CI, issue templates,
release instructions, and applicable Agent authority routes. For example, from the task checkout:

```bash
rg -n --hidden --glob '!.git/**' -F -- 'old/path.md' .
```

Rebase relative links from each moved page's new location, reconcile incoming anchors, and
update generators rather than managed projections. Preserve deliberate historical references
as history instead of blanket-replacing old paths. Redirects need a publishing-system or
external-consumer reason; they are not automatic compatibility wrappers. Treat external Wikis,
issue trackers, and inaccessible consumers as coordination gaps, not surfaces already updated.

## Check the result

For a material reorganization, walk a realistic reader journey using only the resulting entry
points, not the editing conversation: for example, starting at README, find authentication
setup and identify the page that owns the requirement. Repair dead ends or missing context;
a fresh reader/subagent is optional, not a fixed reviewer count or approval gate.

Report resulting entry points, significant moves/deletions and their evidence, checks, and
unresolved external consumers or risks. A plausible directory tree or green link check alone
is not evidence that a reader can find the right current contract.
