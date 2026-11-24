<!-- agent-scaffold:convention=specs -->
# Specification conventions

Generic guide installed and refreshed by agent-scaffold; do not edit it here. The project's
specification, RFC, and design-record conventions win where they are more specific; record
project-specific rules there, not in this file.

- Use the project's existing home, template, language, and numbering for specifications and
  design records. Not every change needs a specification; follow the project's threshold.
- Distinguish draft, approved intent, and implemented behavior with the project's status
  convention. A recent edit, a merged file, or an answer to one question is not approval of a
  whole design, and approval is not evidence of implementation.
- When revising, preserve exact identifiers, values, units, compatibility windows, and
  normative strength (must/should/may). Do not strengthen, weaken, or broaden a requirement
  through editorial rewording; explain a consequential change.
- Keep material assumptions and open decisions visible. Do not settle a product question by
  choosing wording; ask the owner or leave it open.
- Describe the main behavior, responsibilities, important failure and recovery paths, and
  observable acceptance. Make decision-bearing requirements traceable to behavior and
  verification in the project's format; a small change may need only a sentence.
- Define each concept once and link to its owner (glossary, schema, protocol document).
  Summarize executable contracts instead of copying them, keeping only details the
  specification itself owns.
- Keep transcripts, test output, and historical debate out of the current reader narrative;
  link to them as evidence instead.
- When the implementation lands, update the specification's status or retire the plan so it
  no longer instructs readers to implement it.
