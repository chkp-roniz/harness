# Curation Rubric

Translated from the SkillOS paper's composite reward (operation validity + skill quality + compactness). Use this to validate every candidate operation before proposing it. If a candidate fails any required check, drop it.

## Operation validity

### `insert_skill` — required checks

- **Not a duplicate.** No existing skill in `current_skills` covers this same trigger context. Check semantically, not just by name. If a near-duplicate exists, this is an `update_skill`, not an insert.
- **Reusable.** The trigger context will plausibly occur again. One-shot tasks fail this check.
- **Executable knowledge.** The body contains a procedure, workflow, or hard-won correction — not facts, not trivia, not general programming knowledge.
- **Not in Claude's training.** The skill encodes something Claude wouldn't already know: project conventions, environment-specific commands, user-specific corrections, internal tooling patterns.

### `update_skill` — required checks

- **Targets a real skill.** The existing skill must be in `current_skills`.
- **Grounded in observed gap.** The transcript shows the skill was incomplete, had a wrong path/command, or its description didn't trigger when it should have. Speculative improvements without transcript evidence fail this check.
- **Doesn't bloat.** The change adds reusable nuance, not session-specific noise. A 3-line addition is fine; rewriting half the body to capture one session's idiosyncrasies is not.

### `delete_skill` — required checks

- **One of these is true:**
  - Skill is strictly redundant with another skill (subset).
  - Skill hasn't loaded across the queued sessions despite plausibly relevant prompts (description is too narrow or topic obsolete).
  - Skill content is contradicted by recent successful patterns and `update_skill` would gut it entirely.

## Skill quality (applies to insert and post-update)

### YAML frontmatter

- `name`: kebab-case, unique within the library, descriptive (not `helper-1`).
- `description`: this is the routing surface. Must specify both **what the skill does** and **when to use it**. Write slightly "pushy" to combat undertriggering — Claude tends to under-invoke skills, so phrasing like "Use this whenever..." beats passive descriptions. Include alternate phrasings the user might use.

### Body

- **Self-contained.** Can be loaded in isolation — does not assume another skill is also loaded.
- **Procedure-first.** Open with the workflow or rule, not background.
- **References commands and paths exactly.** If the skill is about a tool, include the actual command line and exact file paths. Don't write "run the build script" — write `npm run build:prod` or whatever it actually is.
- **Length under ~300 lines** for a single-file skill. If it's longer, split into a directory with `references/` subfiles.
- **No secrets, customer data, or PII.** Ever. If the source transcript contains any, scrub it from the proposed skill.

## Compactness (library-level)

The paper rewards a small, sharp library over a sprawling one. Apply these heuristics:

- **Prefer one comprehensive skill over three narrow overlapping ones.** If three insert candidates from this batch all touch the same domain, propose one merged skill instead.
- **Overlapping descriptions cause routing confusion.** If a candidate insert's description overlaps significantly with an existing skill's description, this is an update, not an insert.
- **Deletion is healthy.** A library that only grows is decaying in quality. If you find a skill that hasn't loaded in 5+ sessions and isn't part of the user's stated tooling, propose deletion.

## Severity weighting

When presenting proposals, order them by expected impact:

1. **Deletes of harmful or contradicted skills** (highest priority — these are actively misleading Claude).
2. **Updates that fix wrong paths/commands.**
3. **Inserts that capture a recurring pattern observed in 2+ sessions.**
4. **Updates that add nuance.**
5. **Inserts from a single strong signal in one session.**
6. **Deletes for compactness only** (lowest priority — defer if the user is reviewing fast).

## Negative checks (drop candidates that match these)

- Candidate insert is something every developer already knows.
- Candidate insert encodes a one-off bug fix with no broader pattern.
- Candidate update would inject session-specific noise into a general skill.
- Candidate delete targets a skill the user explicitly created and there's no evidence it's broken.
