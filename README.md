# Skills Repository

This repository contains my personal collection of skills - specialized knowledge modules that provide domain-specific guidance and instructions for various technical tasks.

## What are Skills?

Skills are structured knowledge files that contain detailed instructions, code examples, and best practices for specific technical domains. They serve as reference guides that can be used to quickly understand and implement solutions for common challenges.

## Repository Structure

```
.github/
└── skills/
    └── <skill-name>/
        └── SKILL.md
```

Each skill is stored in its own directory under `.github/skills/` with a `SKILL.md` file containing the full documentation.

## Available Skills

### Office Sensitivity Labels

**Location:** `.github/skills/office-sensitivity-labels/`

Guidelines for handling Microsoft Office files (Excel, Word, PowerPoint) that may be protected with Azure Information Protection (AIP) encryption. This skill covers:

- Detecting if files are protected/encrypted
- Reading protected files programmatically using COM automation (Windows)
- Cross-platform solutions using MIP SDK
- Ready-to-use Python scripts for common operations
- Troubleshooting common issues with protected files

**Supported file types:** `.xlsx`, `.xls`, `.xlsm`, `.docx`, `.doc`, `.docm`, `.pptx`, `.ppt`, `.pptm`

## Adding New Skills

To add a new skill:

1. Create a new directory under `.github/skills/` with the skill name
2. Add a `SKILL.md` file with the skill documentation
3. Include a YAML frontmatter with `name` and `description` fields
