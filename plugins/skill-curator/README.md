# skill-curator

Post-session skill curation for Claude Code, adapted from the [SkillOS paper](https://arxiv.org/abs/2605.06614) (Ouyang et al., Google Cloud AI Research, 2026).

The paper trains an 8B model with reinforcement learning to curate a self-evolving agent's skill repository. This plugin ports the **prompted recipe** — the operation set, the rubric mapped from the paper's composite reward, and the grouped-trajectory framing — and uses Claude itself as the curator. No model training required.

## What it does

After a Claude Code session ends, a `SessionEnd` hook silently appends session metadata to a queue at `~/.claude/skill-curation/pending-sessions.jsonl`. The hook never invokes Claude and never analyzes anything at session end — it just captures.

When you next ask Claude to curate ("review my skills", "audit my skill library", etc.), the bundled `skill-curator` skill triggers, drains the queue, analyzes transcripts against the SkillOS rubric, and presents grouped insert / update / delete proposals for your approval. Nothing on disk changes without per-operation consent.

## Install

### Claude Code

```
/plugin marketplace add chkp-roniz/skills
/plugin install skill-curator@chkp-roniz-skills
```

The hook is auto-registered via the plugin's `hooks/hooks.json`. No manual `settings.json` editing.

### APM

Imperative:

```
apm install chkp-roniz/skills/plugins/skill-curator
```

Declarative — add to your project's `apm.yml`:

```yaml
dependencies:
  apm:
    - chkp-roniz/skills/plugins/skill-curator
```

User-scope (across all projects on the machine):

```
apm install -g chkp-roniz/skills/plugins/skill-curator
```

## Dependencies

The hook script needs `jq`. `flock` is used if available, otherwise the script falls back to plain append (concurrent SessionEnd events are rare).

```
# macOS
brew install jq

# Debian/Ubuntu
sudo apt-get install -y jq
```

## Use

In any Claude Code session, after you've accumulated a few sessions of work, say:

> Review my skills

Or any of: "curate my skills", "audit my skill library", "what should I prune?"

The skill drains the pending queue, presents a grouped proposal, and waits for approval per operation. You can approve, reject, or modify each candidate.

## Tuning

`SKILL_CURATOR_MIN_TURNS` (default 3) — sessions with fewer user turns are skipped at queue-time. They're usually not real work.

```bash
# In your shell rc
export SKILL_CURATOR_MIN_TURNS=5
```

## What gets queued, what doesn't

The hook skips:
- Sessions with fewer than `SKILL_CURATOR_MIN_TURNS` user turns
- Sessions that ended via `/clear`
- Sessions where the transcript path is missing

Everything else is queued. You drain at your discretion by invoking the curator skill — there's no automatic timer.

## What this plugin does not do

- It does **not** train any model. The paper's RL training of an 8B curator is not portable to a skill — Claude is the curator here.
- It does **not** modify plugin-installed skills, only your personal `~/.claude/skills/`.
- It does **not** run Claude or any LLM call from the SessionEnd hook. The hook is a small shell script that writes a queue entry and exits.

## Verify after install

Open a fresh Claude Code session, do a few turns, exit. Then:

```bash
cat ~/.claude/skill-curation/pending-sessions.jsonl
tail ~/.claude/skill-curation/hook.log
```

You should see one entry with `status: "pending"`.

## Layout

```
plugins/skill-curator/
├── .claude-plugin/plugin.json        # Claude plugin manifest
├── apm.yml                           # APM manifest
├── README.md                         # this file
├── hooks/
│   ├── hooks.json                    # auto-registers the SessionEnd hook
│   └── session-end.sh                # the hook script
└── .apm/skills/skill-curator/
    ├── SKILL.md                      # curator skill definition
    └── references/
        ├── rubric.md                 # validity / quality / compactness criteria
        ├── operations.md             # insert / update / delete file actions
        └── trajectory-signals.md     # patterns to look for in transcripts
```

## License

MIT. See repo root.

## Citation

```
@article{ouyang2026skillos,
  title={SkillOS: Learning Skill Curation for Self-Evolving Agents},
  author={Ouyang, Siru and Yan, Jun and Chen, Yanfei and others},
  journal={arXiv preprint arXiv:2605.06614},
  year={2026}
}
```
