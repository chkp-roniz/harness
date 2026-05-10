# Skills Marketplace

This repository is a dual-format distribution:

- a **Claude Code plugin marketplace**, defined by [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json)
- a **microsoft/apm** package collection, with each plugin carrying its own `apm.yml`

Each plugin lives under `plugins/<name>/` with its skill content under `.apm/skills/<skill-name>/SKILL.md` (the APM convention). The Claude plugin manifest in `plugins/<name>/.claude-plugin/plugin.json` sets `"skills": "./.apm/skills/"` so both runtimes load the same files — one source of truth, two manifests.

## Available plugins

### `ms-office-expert`

Tools for reading, writing, and detecting protection on Microsoft Office files (`.xlsx`, `.docx`, `.pptx` and legacy `.xls`/`.doc`/`.ppt`), including Azure Information Protection (AIP) encrypted documents.

**Skills**
- `office-sensitivity-labels` — detect and read AIP-protected Office files. See [the skill](plugins/ms-office-expert/.apm/skills/office-sensitivity-labels/SKILL.md).

See [`plugins/ms-office-expert/README.md`](plugins/ms-office-expert/README.md) for full install and usage details.

### `skill-curator`

Post-session skill curation for Claude Code, adapted from the [SkillOS paper](https://arxiv.org/abs/2605.06614). A `SessionEnd` hook silently queues each session; when you ask Claude to "review my skills" it drains the queue, scores candidates against the SkillOS rubric (validity, quality, compactness), and proposes insert/update/delete operations against `~/.claude/skills/` for your approval. Advisory mode only — nothing changes without per-operation consent.

**Skills**
- `skill-curator` — drain the pending queue and propose curation ops. See [the skill](plugins/skill-curator/.apm/skills/skill-curator/SKILL.md).

**Hooks**
- `SessionEnd` → `hooks/session-end.sh` (auto-registered by the plugin)

See [`plugins/skill-curator/README.md`](plugins/skill-curator/README.md) for full install and usage details.

## Install

### Claude Code

```
/plugin marketplace add chkp-roniz/skills
/plugin install ms-office-expert@chkp-roniz-skills
/plugin install skill-curator@chkp-roniz-skills
```

### microsoft/apm

This repo hosts APM packages as subdirectories under `plugins/`. APM supports installing a package from a subdirectory using its GitHub shorthand: `<owner>/<repo>/<subpath>`.

**Imperative install (one-shot):**

```
apm install chkp-roniz/skills/plugins/ms-office-expert
apm install chkp-roniz/skills/plugins/skill-curator
```

If you don't already have an `apm.yml` in the current project, APM will auto-create a minimal one and add the package to it. To target Claude Code specifically (instead of auto-detecting):

```
apm install chkp-roniz/skills/plugins/skill-curator --target claude
```

**Declarative install (recommended for projects):**

Add the package to your project's `apm.yml`, then run `apm install`:

```yaml
# apm.yml
name: my-project
version: 1.0.0
dependencies:
  apm:
    - chkp-roniz/skills/plugins/ms-office-expert
    - chkp-roniz/skills/plugins/skill-curator
```

```
apm install
```

**User-scope install (available across all projects):**

```
apm install -g chkp-roniz/skills/plugins/skill-curator
```

This deploys the skill into `~/.claude/skills/` (and the equivalents for other detected runtimes), so it's available to any project on the machine.

See the [APM CLI reference](https://github.com/microsoft/apm/blob/main/docs/src/content/docs/reference/cli-commands.md) for the full set of `apm install` options.

## Repository layout

```
.
├── .claude-plugin/
│   └── marketplace.json              # Claude marketplace manifest
├── plugins/
│   ├── ms-office-expert/             # Claude plugin = APM package
│   │   ├── .claude-plugin/plugin.json
│   │   ├── apm.yml
│   │   ├── README.md
│   │   └── .apm/skills/office-sensitivity-labels/
│   │       ├── SKILL.md
│   │       ├── README.md
│   │       └── *.py
│   └── skill-curator/                # Claude plugin = APM package
│       ├── .claude-plugin/plugin.json
│       ├── apm.yml
│       ├── README.md
│       ├── hooks/
│       │   ├── hooks.json            # SessionEnd hook registration
│       │   └── session-end.sh        # the hook script
│       └── .apm/skills/skill-curator/
│           ├── SKILL.md
│           └── references/
│               ├── rubric.md
│               ├── operations.md
│               └── trajectory-signals.md
├── .gitignore
├── LICENSE
└── README.md
```

## Adding a new plugin

1. Create a new directory under `plugins/<plugin-name>/`.
2. Add `apm.yml` (APM manifest) and `.claude-plugin/plugin.json` (Claude plugin manifest, with `"skills": "./.apm/skills/"`).
3. Add skills under `.apm/skills/<skill-name>/SKILL.md`. The frontmatter only needs `name` and `description` — both runtimes accept that minimum.
4. If the plugin needs hooks, add `hooks/hooks.json` and any scripts under `hooks/`. Use `${CLAUDE_PLUGIN_ROOT}` in command paths so the hook resolves correctly when installed.
5. Register the plugin in [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json).

## License

MIT — see [LICENSE](LICENSE).
