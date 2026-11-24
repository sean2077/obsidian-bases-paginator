<!-- agent-scaffold:convention=environment -->
# Setup and collaboration conventions

Generic guide installed and refreshed by agent-scaffold; do not edit it here. The project's
setup instructions and contribution guide win where they are more specific; record
project-specific rules there, not in this file.

## Setup

- Use the project's package manager, lockfile, and documented setup command. Do not switch
  tools, upgrade dependencies, or regenerate lockfiles as a side effect of another change.
- Installing dependencies, starting daemons or services, touching devices or production,
  and changing global or user configuration need explicit authorization.
- Keep credentials out of commands, commits, logs, and examples; use credential-free
  examples and the project's approved secret mechanism. Do not copy secrets or local
  settings between checkouts.
- When a required environment is unavailable, report the affected check as unverified. Do
  not weaken the check or substitute a fake to pass in a restricted environment.

## Shared resources and collaboration

- One active writer owns each shared mutable surface (working tree, database, service,
  port, cache). A second session in the same checkout is not an independent copy.
- Give a collaborator or reviewer the exact absolute checkout path, base, and revision. For
  an uncommitted review, say that the live diff is the target and do not edit it during the
  review.
- Work in the checkout the user or workbench assigned. A shell `cd` does not reload
  instructions or permissions. Leave worktree creation, integration, and cleanup to their
  lifecycle owner.
- Release processes and directory handles before removing a worktree or temporary directory.
