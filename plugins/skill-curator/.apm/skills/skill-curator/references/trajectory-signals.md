# Trajectory Signals

What to look for when scanning a session transcript. These are the cues that map to candidate operations. The paper's RL training learns these signals from reward; here we encode them explicitly.

## Insert signals (positive)

Look for these patterns. Stronger signals (multiple sessions, explicit user instruction) outweigh weaker ones.

### Strong

- **Recurring workflow.** Same sequence of tool calls / commands appears in 2+ sessions in the queue, with the user not surprised by it. → strong insert candidate.
- **Explicit user instruction to remember.** "We always do X." "Remember that...". "Next time, do Y first." "In this repo, the convention is Z." → very strong; these are gold for skills.
- **User correction of Claude's approach with project-specific knowledge.** Claude tried path A, user said "no, here we use path B because of <reason>." The reason is the skill content.
- **Hard-won discovery.** Claude tried 3 things before one worked, and the user signaled the working one is the real answer ("yes, that's it" / "finally"). The successful approach plus the failure modes is the skill.

### Moderate

- **Setup or config pattern.** Recurring environment-specific commands (auth flows, internal tooling invocations, build steps with non-obvious flags).
- **Tool sequences specific to the user's stack.** Combinations that aren't generic — e.g., "JFrog → npm config → install" vs. just "npm install."
- **Domain-specific procedure.** A workflow tied to the user's domain (e.g., a security review checklist, a release procedure) that Claude wouldn't infer from training.

### Weak (do not insert from these alone)

- A single command that worked once.
- General programming idioms.
- One-off bug investigations.

## Update signals

### A skill loaded but Claude deviated from it successfully

Skill was incomplete. The deviation, if reusable, should be folded into the skill body. Diff the skill against what actually worked.

### A skill's description didn't match the task it should have

Two cases:
- Description is too narrow → broaden description, leave body alone.
- Description is too broad → narrow it, possibly split into two skills (which is then an insert + update, in that order).

### A skill's referenced commands or paths are wrong

Look for "command not found," "no such file," or the user fixing a path. Update the body with the correct command/path.

### User explicitly said an existing skill needs adjustment

"That skill should also mention X." → update.

## Delete signals

### Never loaded

A skill in the inventory has not appeared as loaded in any of the queued sessions, despite plausibly relevant prompts. Two interpretations:
- Description is broken (consider update first).
- Topic is obsolete (delete).

Decide based on whether the description actually matches recent work patterns.

### Subset of another skill

If skill A's content is fully covered by skill B (with matching trigger contexts), delete A.

### Contradicted by recent successful patterns

A skill says "do X," recent sessions consistently did "Y" with the user's blessing. Either update X to Y or delete X if it's actively misleading.

### Routing confusion

If two skills have overlapping descriptions and Claude has been picking the "wrong" one (per user reaction), the lower-quality one is a delete candidate.

## Negative signals (drop or do not propose)

Stop the candidate if any of these apply:

- **Secrets, credentials, customer data, or PII** in the would-be skill body. Drop and log a note for the user.
- **Highly session-specific context** that won't transfer (filenames the user used once, exploratory branch names).
- **General programming knowledge** (HTTP status codes, regex syntax, language features).
- **User preferences** that belong in `CLAUDE.md` or user preferences (tone, formatting). Suggest the right home if you see these.
- **Single negative experience** with no clear remedy. Don't insert a "don't do X" skill from one bad outcome — wait for a pattern.

## How to read a transcript efficiently

A Claude Code transcript is a JSONL file of message objects. You don't need to read every token:

1. Pull all `role: "user"` messages → these are the explicit instructions and corrections (richest insert signal).
2. Pull all `tool_use` and `tool_result` blocks → these show actual workflow patterns.
3. Skim assistant text messages for places where the user pushed back ("no," "actually," "instead").
4. Look at SKILL.md loads — note which skills triggered (if visible in transcript).

If a transcript is huge, focus on the first user message (task statement), the last several user messages (final corrections / approvals), and any tool_result errors that led to retries. That's usually 80% of the signal.

## Grouping across sessions

Before scoring candidates, group queued sessions by:

- **Working directory** (`cwd` in the queue entry) — sessions in the same repo are likely related.
- **Topic similarity** — task statements that share keywords/entities.

A candidate that surfaces from a group of related sessions is much stronger than one from a single session. The paper's grouped-trajectory training is approximating exactly this — here we do it heuristically at curation time.
