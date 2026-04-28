# MS Office Expert

Plugin/package for working with Microsoft Office files (`.xlsx`, `.docx`, `.pptx` and legacy formats), with first-class support for Azure Information Protection (AIP) sensitivity labels.

This package is dual-distributed: it works as a **Claude Code plugin** and as a **microsoft/apm package** from the same source tree.

## Skills

- **office-sensitivity-labels** — detect and read AIP-protected Office files. See [SKILL.md](./.apm/skills/office-sensitivity-labels/SKILL.md) for the full skill, and the skill's own [README.md](./.apm/skills/office-sensitivity-labels/README.md) for usage examples.

## Install (Claude Code)

```
/plugin marketplace add chkp-roniz/skills
/plugin install ms-office-expert@chkp-roniz-skills
```

## Install (microsoft/apm)

This package lives in a subdirectory of `chkp-roniz/skills`. APM installs subdirectory packages with `<owner>/<repo>/<subpath>` shorthand:

```
apm install chkp-roniz/skills/plugins/ms-office-expert
```

Or add it to your project's `apm.yml` and run `apm install`:

```yaml
dependencies:
  apm:
    - chkp-roniz/skills/plugins/ms-office-expert
```

Force the Claude target if APM doesn't auto-detect it:

```
apm install chkp-roniz/skills/plugins/ms-office-expert --target claude
```

Install to user scope (`~/.apm/`) so it's available to every project:

```
apm install -g chkp-roniz/skills/plugins/ms-office-expert
```

See the [APM CLI reference](https://github.com/microsoft/apm/blob/main/docs/src/content/docs/reference/cli-commands.md) for all options.

## Layout

```
ms-office-expert/
├── .claude-plugin/plugin.json     # Claude plugin manifest
├── apm.yml                        # APM package manifest
└── .apm/skills/
    └── office-sensitivity-labels/ # canonical skill location, used by both runtimes
        ├── SKILL.md
        ├── README.md
        ├── detect_protection.py
        ├── excel_reader.py
        ├── read_protected_excel.py
        └── requirements.txt
```

The Claude plugin manifest sets `"skills": "./.apm/skills/"` so both runtimes resolve to the same files — no duplication.
