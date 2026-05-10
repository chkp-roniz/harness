# Curation Operations

Exact file actions for each operation. All operations target `~/.claude/skills/`. Always validate the path expands correctly before writing.

## `insert_skill`

Creates a new skill directory.

### Action

1. Compute path: `~/.claude/skills/<kebab-case-name>/`
2. If path exists, abort and reclassify as `update_skill`.
3. Create directory.
4. Write `SKILL.md` with the proposed YAML frontmatter and body.
5. If the skill needs scripts or references, create the subdirectories and files.

### Atomic write pattern

Write to `<path>/SKILL.md.tmp`, then `mv` to `<path>/SKILL.md`. This prevents a partially-written skill from being loaded on a concurrent session.

### YAML template

```yaml
---
name: <kebab-case-name>
description: <what it does> Use this whenever <triggering contexts including alternate phrasings the user might use>.
---
```

The `description` field is the only thing Claude sees during routing. Make it specific and slightly pushy. Bad: "Helps with deployments." Good: "Deploy the production frontend via the internal `deploy-fe` script. Use this whenever the user asks to deploy, ship, push, or release the frontend, or mentions production/prod deploys."

## `update_skill`

Modifies an existing skill's SKILL.md (or supporting files).

### Action

1. Read the existing `~/.claude/skills/<name>/SKILL.md`.
2. Apply the proposed change as a precise edit (description rewrite, body section addition, command correction). Do NOT regenerate the whole file from scratch unless the user explicitly approves a full rewrite.
3. Atomic write via `.tmp` + `mv`.
4. If updating the YAML `description`, the body usually doesn't need changing too — and vice versa. Don't bundle unrelated changes.

### Diff surface

Always present the change to the user as a unified diff so they can see exactly what's changing. Diffs over full rewrites unless the user requested a rewrite.

## `delete_skill`

Removes a skill directory.

### Action

1. Verify path exists: `~/.claude/skills/<name>/`
2. Move to a tombstone directory: `~/.claude/skill-curation/deleted/<name>-<timestamp>/`. **Do not `rm -rf`.** This gives the user a recovery path.
3. Tombstone retention is the user's responsibility; don't auto-prune.

### Confirmation requirement

Even within an "approve all" batch, deletes require a final confirmation listing every skill name about to be deleted. The user can still cancel at this point.

## Queue updates

After every applied or rejected operation, update the queue file `~/.claude/skill-curation/pending-sessions.jsonl`:

- `status: "applied"` for sessions that contributed to an approved op.
- `status: "rejected_by_user"` for sessions whose only candidates were rejected.
- `status: "transcript_missing"` if the transcript file was gone.
- Sessions with mixed outcomes (one candidate approved, another rejected) → `status: "applied"`.

Atomic queue rewrite: write to `pending-sessions.jsonl.tmp`, `mv` over the original.

## Failure modes

- **Path expansion failed:** abort the operation, surface the literal path, ask the user.
- **Concurrent session:** if `~/.claude/skills/<name>/SKILL.md` was modified externally between the read and the write, abort and re-propose against the new content.
- **Disk write failure:** report which operation failed, leave queue entry as `pending` so it can be retried.
