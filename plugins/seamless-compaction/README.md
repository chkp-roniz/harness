# seamless-compaction

A Claude Code mod that cleans old tool results out of the context when the engine compacts. No model call and no wait. Like RTK, but after the output is already in context.

When the context window fills up, Claude Code normally asks the model to summarize the whole conversation. That costs a model call, takes time, and loses detail. Most of the bulk is usually old tool output: files read twice, the same `git log` run three times, long build logs. This mod removes that bulk first. If that frees enough room, the summary is skipped and your conversation stays as it was, minus the old noise.

## Install

### Claude Code marketplace (recommended)

This repo is a Claude Code plugin marketplace (`chkp-roniz-plugins`):

```
/plugin marketplace add chkp-roniz/harness
/plugin install seamless-compaction@chkp-roniz-plugins
```

Pick a scope when asked (user, project or local). From a shell you can do the same with:

```
claude plugin marketplace add chkp-roniz/harness
claude plugin install seamless-compaction@chkp-roniz-plugins
```

### From a local folder

One session:

```
claude --plugin-dir /path/to/harness/plugins/seamless-compaction
```

Every session (set once in your shell profile):

```
export CLAUDE_CODE_PLUGIN_DIRS=/path/to/harness/plugins/seamless-compaction
```

### microsoft/apm: not supported yet

Do not install this mod with `apm install`. This mod is a function-hook module (`hooks/hooks.json` lists `register.ts`), not a skill. APM (tested with 0.29.1) copies `hooks.json` into `.claude/settings.json` as a shell-command hook entry. That entry does not load the mod. Use the marketplace install above. The other plugins in this repo are skills and do install with APM.

## How it works

The mod hooks the engine's `session.compact` event. It acts only on the engine's own compaction (`trigger=auto`, the window is full), in the main session or in a subagent. `/compact`, precompute and other plugins' compactions pass through untouched.

1. **Gate.** In the main session it runs only once the context is at least `startAt` (70%) full. This is measured against the window the engine compacts at, so a smaller `CLAUDE_CODE_AUTO_COMPACT_WINDOW` is respected. Below that, the engine compacts as before. A subagent's compaction is not gated, because it only starts when that agent's window is full. If the fill cannot be measured, the cleanup runs.
2. **Clean.** Old tool results are rewritten by these rules:

   | Rule | What |
   | --- | --- |
   | read | An older `Read` of a path that is read, edited or written again later becomes a one-line stub. |
   | dup | An older identical tool call + result becomes a stub. The newest stays. |
   | noise | Bash only: ANSI codes, `\r` progress lines and repeated lines (`line (xN)`). |
   | trim | Results over 4000 chars keep the first 40 and last 20 lines. Errors keep the first 2000 chars. |

   Every stub and cut says what was removed and how to get it back (re-read or re-run the tool).
3. **Decide.** If the cleanup frees at least `minAutoPct` (30%) of the transcript, the cleaned messages replace the summary: no model call. If it frees less, the engine summarizes the cleaned messages as usual.
4. **Record.** One log line, a toast in the main session, and the last 5 operations kept for `/seamless-compaction`.

Never touched: the last `keepTurns` (3) user prompts and everything after them, all message text, tool inputs, results under 300 chars (no stubs), and `Agent` / `Task` / `TodoWrite` results. The message count and every tool call/result pair stay the same. If anything fails, the compaction is left to the engine.

There is no cleanup between turns. The engine refuses a plugin's compaction while a turn runs. When it does run one, it skips the plugin's own `session.compact` hook. So the cleanup runs only when the engine compacts. (The experimental `proactive` option was removed in 0.1.3.)

## Commands

`/seamless-compaction` shows the status and the last 5 operations. `/seamless-compaction off` and `on` switch it for the current session.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `startAt` | 70 | Main-session context % before it cleans. 0 = every engine compaction. |
| `keepTurns` | 3 | The last N user prompts, and everything after them, are never touched. |
| `minAutoPct` | 30 | Minimum % freed to skip the engine's summary. |

Set them in the plugin config menu, or in settings:

```json
{ "pluginConfigs": { "seamless-compaction@chkp-roniz-plugins": { "options": { "keepTurns": 3 } } } }
```

With `--plugin-dir`, use the key `seamless-compaction`. A wrong key is ignored silently and every option stays at its default.

## Log

One line per operation in `~/.claude/seamless-compaction.log` (rotates to `.log.1` above 1 MiB). It holds no conversation content.

```
2026-10-06T08:41:12Z session=<id> agent=main trigger=auto before=182.4k after=121.0k compaction=33.7% rules=read:4,dup:1,trim:9,noise:3
2026-10-06T09:02:40Z session=<id> agent=a1b2c3 trigger=auto before=150.2k after=139.8k compaction=6.9% result=engine-summary
```

## Limits

- A cleanup costs one prompt-cache miss on the next request.
- `/seamless-compaction on|off` is per session.
- A trimmed `Read` result can be re-read with `offset` and `limit`.

## Development

```
claude plugin validate .
claude plugin test .
```

## License

MIT, see the repository [LICENSE](../../LICENSE).
