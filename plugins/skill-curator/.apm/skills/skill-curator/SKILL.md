---
name: skill-curator
description: Review past Claude Code sessions and propose insert/update/delete operations on the user's personal skills at ~/.claude/skills. Use this whenever the user asks to curate, review, audit, prune, or maintain their skills, mentions skill quality, duplicate skills, or wants to learn from past work, or when pending sessions are queued at ~/.claude/skill-curation/pending-sessions.jsonl. Apply the SkillOS curation rubric (validity, quality, compactness) and present operations in advisory mode for user approval before any file changes. Do NOT modify skill files without explicit per-operation approval.
---

# Skill Curator

Curate the user's personal skills library at `~/.claude/skills/` based on observed work in past Claude Code sessions. Adapted from the SkillOS paper (arxiv 2605.06614): the paper trains an 8B model with RL to do this; here, the rubric and operation set are translated into a prompted recipe that uses Claude as the curator directly.

## Core rule

**Advisory mode only.** Never insert, update, or delete a skill file without the user's explicit per-operation approval. If the user says "approve all," that counts as explicit batch approval — but a generic "looks good" or "thanks" does not.

## Workflow

1. **Drain the pending queue.** Read `~/.claude/skill-curation/pending-sessions.jsonl`. Each line is `{timestamp, session_id, transcript_path, cwd, reason, status}`. Filter to entries with `status: "pending"`.

2. **Inventory current skills.** List `~/.claude/skills/*/SKILL.md`. For each, extract the YAML frontmatter (`name`, `description`) and a one-line summary of the body. Hold this in working memory as `current_skills`. Also list any plugin-installed skills the user has visible (those typically live in plugin install dirs and should NOT be modified by this curator — they're upstream packages, not the user's personal library).

3. **Analyze transcripts.** For each pending session transcript, read it and scan for the signals in `references/trajectory-signals.md`. Group sessions by topic when possible (paper's grouped-trajectory framing) — if multiple sessions touch the same workflow, that's a stronger insert signal than any one alone.

4. **Generate candidate operations.** For each candidate `insert_skill` / `update_skill` / `delete_skill`, validate against the rubric in `references/rubric.md`. Drop candidates that fail validity. Operation specs and exact file actions are in `references/operations.md`.

5. **Present grouped proposal.** Use the format below. Wait for approval.

6. **On approval, perform file ops.** After each successful op, mark the relevant queue entries as `status: "applied"` (rewrite the JSONL file atomically). On rejection, mark as `status: "rejected_by_user"` so they don't resurface.

## Proposal format

Present operations grouped by type. Keep each entry scannable.

```markdown
## Curation proposal — N sessions reviewed

### Inserts (k)

**1. `<kebab-case-name>`** — from session(s) <ids/dates>
- *Signal:* <which trajectory pattern triggered this>
- *Description:* "<the proposed YAML description, slightly pushy>"
- *Body preview (first ~15 lines):*
  ```
  <preview>
  ```
- *Full body:* <link or inline if short>
- Approve? [y/n/modify]

### Updates (k)

**1. `<existing-skill>`** — from session <id>
- *Signal:* <gap observed>
- *Diff:*
  ```diff
  - old line
  + new line
  ```
- Approve? [y/n/modify]

### Deletes (k)

**1. `<existing-skill>`**
- *Signal:* <not loaded in N sessions / redundant with X / outdated>
- Approve? [y/n]
```

If there are zero candidates after rubric filtering, say so plainly and clear the queue.

## Plugin vs. personal skills

This curator only manages skills under `~/.claude/skills/` — the user's personal library. It does NOT touch plugin-installed skills (those live in plugin directories and are managed by their respective packages). If a candidate insert duplicates a plugin-installed skill, drop the candidate; suggest the user uninstall the plugin or override locally if they actually want their own version.

## When NOT to propose

These are not skill candidates:

- One-off tasks with no recurring pattern.
- General programming knowledge Claude already has.
- Personal style preferences — those belong in `CLAUDE.md` or user preferences, not a skill.
- Single-session debugging that produced a fix but no transferable procedure.
- Anything containing secrets, customer data, or anything that should not persist on disk per the user's org policy.

## Reference files

Read these as needed — don't load all up front:

- `references/rubric.md` — Quality criteria mapped from the paper's reward components. Read when validating any candidate operation.
- `references/operations.md` — Exact file actions for insert/update/delete, including atomic write patterns and what goes in YAML frontmatter.
- `references/trajectory-signals.md` — Patterns to look for in session transcripts. Read at the start of step 3.

## Edge cases

- **Empty queue:** If queue is empty and the user invoked the skill anyway, ask if they want to review the existing library for compactness (deletes/merges only) without new transcript signal.
- **Stale transcripts:** If `transcript_path` no longer exists, mark the queue entry `status: "transcript_missing"` and skip.
- **Duplicate insert candidates across sessions:** Merge. One insert proposal, cite all source sessions.
- **Skill already covers proposed insert:** Flip to `update_skill` candidate against the existing skill.
- **Conflicting proposals:** If insert and update target overlapping ground, prefer update (compactness reward).
