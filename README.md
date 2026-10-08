# Claude Code Plugins Marketplace

This repository is a dual-format distribution:

- a **Claude Code plugin marketplace** (`chkp-roniz-plugins`), defined by [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json)
- a **microsoft/apm** package collection for the skill plugins, each carrying its own `apm.yml`

Each plugin lives under `plugins/<name>/`. There are two kinds:

- **Skill plugins** keep their skills under `.apm/skills/<skill-name>/SKILL.md` (the APM convention). The Claude plugin manifest in `plugins/<name>/.claude-plugin/plugin.json` sets `"skills": "./.apm/skills/"` so both runtimes load the same files — one source of truth, two manifests.
- **Mods** are function-hook modules listed in `hooks/hooks.json`. They install through the Claude Code marketplace only, because APM does not load function-hook modules yet. They have no `apm.yml`.

## Available plugins

| Plugin | Kind | Claude Code | APM |
| --- | --- | --- | --- |
| [`ms-office-expert`](./plugins/ms-office-expert/README.md) | skill | yes | yes |
| [`seamless-compaction`](./plugins/seamless-compaction/README.md) | mod | yes | no |

### `ms-office-expert`

Tools for reading, writing, and detecting protection on Microsoft Office files (`.xlsx`, `.docx`, `.pptx` and legacy `.xls`/`.doc`/`.ppt`), including Azure Information Protection (AIP) encrypted documents.

**Skills**

- `office-sensitivity-labels` — detect and read AIP-protected Office files. See [the skill](./plugins/ms-office-expert/.apm/skills/office-sensitivity-labels/SKILL.md).

See [`plugins/ms-office-expert/README.md`](./plugins/ms-office-expert/README.md) for full install and usage details.

### `seamless-compaction`

Cleans old tool results out of the context when the engine compacts, with no model call. If that frees enough room, the engine's summary is skipped. See [`plugins/seamless-compaction/README.md`](./plugins/seamless-compaction/README.md) for how it works and its options.

## Install

### Claude Code (all plugins)

Add the marketplace once, then install any plugin from it:

```
/plugin marketplace add chkp-roniz/harness
/plugin install ms-office-expert@chkp-roniz-plugins
/plugin install seamless-compaction@chkp-roniz-plugins
```

### microsoft/apm (skill plugins only)

This repo hosts APM packages as subdirectories under `plugins/`. APM supports installing a package from a subdirectory using its GitHub shorthand: `<owner>/<repo>/<subpath>`. Do not use APM for mods such as `seamless-compaction`: APM copies their `hooks.json` into `.claude/settings.json` as a shell hook, which does not load the mod.

**Imperative install (one-shot):**

```
apm install chkp-roniz/harness/plugins/ms-office-expert
```

If you don't already have an `apm.yml` in the current project, APM will auto-create a minimal one and add the package to it. To target Claude Code specifically (instead of auto-detecting):

```
apm install chkp-roniz/harness/plugins/ms-office-expert --target claude
```

**Declarative install (recommended for projects):**

Add the package to your project's `apm.yml`, then run `apm install`:

```yaml
# apm.yml
name: my-project
version: 1.0.0
dependencies:
  apm:
    - chkp-roniz/harness/plugins/ms-office-expert
```

```
apm install
```

**User-scope install (available across all projects):**

```
apm install -g chkp-roniz/harness/plugins/ms-office-expert
```

This deploys the skill into `~/.claude/skills/` (and the equivalents for other detected runtimes), so it's available to any project on the machine.

See the [APM CLI reference](https://github.com/microsoft/apm/blob/main/docs/src/content/docs/reference/cli-commands.md) for the full set of `apm install` options.

## Repository layout

```
.
├── .claude-plugin/
│   └── marketplace.json              # Claude marketplace manifest
├── plugins/
│   ├── ms-office-expert/             # skill plugin = Claude plugin + APM package
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json           # Claude plugin manifest
│   │   ├── apm.yml                   # APM package manifest
│   │   ├── README.md
│   │   └── .apm/
│   │       └── skills/
│   │           └── office-sensitivity-labels/
│   │               ├── SKILL.md
│   │               ├── README.md
│   │               └── *.py
│   └── seamless-compaction/          # mod = Claude plugin only
│       ├── .claude-plugin/
│       │   └── plugin.json           # Claude plugin manifest (options, types)
│       ├── hooks/
│       │   ├── hooks.json            # lists the hook modules
│       │   └── *.ts
│       ├── tests/
│       ├── fixtures/
│       ├── types/
│       └── README.md
├── .gitignore
├── LICENSE
└── README.md
```

## Adding a new plugin

1. Create a new directory under `plugins/<plugin-name>/`.
2. For a **skill plugin**: add `apm.yml` (APM manifest) and `.claude-plugin/plugin.json` (Claude plugin manifest, with `"skills": "./.apm/skills/"`). Add skills under `.apm/skills/<skill-name>/SKILL.md`. The frontmatter only needs `name` and `description` — both runtimes accept that minimum.
3. For a **mod**: add `.claude-plugin/plugin.json` and `hooks/hooks.json` listing the hook modules. Do not add `apm.yml`. Check it with `claude plugin validate plugins/<plugin-name>` and `claude plugin test plugins/<plugin-name>`.
4. Register the plugin in [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json).

## License

MIT — see [LICENSE](./LICENSE).
