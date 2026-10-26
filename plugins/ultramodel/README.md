# ultramodel

A Claude Code mod that switches the model for one turn when you name it in a prompt.

Type `opus`, `sonnet` or `haiku` anywhere in a prompt and that turn is answered by that model. The next prompt goes back to your session default, so there is nothing to undo. It works the way the `ultrathink` keyword does: no slash command, no settings change, just a word in the text you were already writing.

When several model names appear in one prompt, the first one wins.

## Install

### Claude Code marketplace (recommended)

This repo is a Claude Code plugin marketplace (`chkp-roniz-plugins`):

```
/plugin marketplace add chkp-roniz/harness
/plugin install ultramodel@chkp-roniz-plugins
```

Pick a scope when asked (user, project or local). From a shell you can do the same with:

```
claude plugin marketplace add chkp-roniz/harness
claude plugin install ultramodel@chkp-roniz-plugins
```

Nothing else to set up. The keyword works in the next session.

### From a local folder

One session:

```
claude --plugin-dir /path/to/harness/plugins/ultramodel
```

Every session (set once in your shell profile):

```
export CLAUDE_CODE_PLUGIN_DIRS=/path/to/harness/plugins/ultramodel
```

### microsoft/apm: not supported yet

Do not install this mod with `apm install`. This mod is a function-hook module (`hooks/hooks.json` lists `register.tsx`), not a skill. APM copies `hooks.json` into `.claude/settings.json` as a shell-command hook entry. That entry does not load the mod. Use the marketplace install above. The other plugins in this repo that are skills do install with APM.

## What it does

- **Switches the model for one turn.** The word is matched whole and case-insensitively, so `Opus` and `OPUS` both work but `opuses` does not.
- **Colors the keyword as you type.** Each letter of a recognised model name is painted in a cycling color in the prompt box, so you can see the switch before you send.
- **Shows a line above the prompt** with the model picked for the running turn, how many turns have been switched, and the session cost so far.
- **Logs the cost of every turn.** One JSON line per finished turn, written to `~/.claude/ultramodel/usage-YYYY-MM-DD.jsonl`.

## The cost log

Each line holds the time, turn id, end reason, the model requested, the model that answered, the four token counts, and an estimated cost in USD. It holds no prompt text and no response text.

Useful one-liners:

```sh
tail -f ~/.claude/ultramodel/usage-$(date -u +%F).jsonl
jq -s 'map(.usd // 0) | add' ~/.claude/ultramodel/usage-$(date -u +%F).jsonl
jq 'select(.requested != null)' ~/.claude/ultramodel/usage-$(date -u +%F).jsonl
```

The cost is an estimate from a built-in price table. Input and output rates are the published ones; the cache-write and Haiku cache-read rates are assumptions, marked as such in `hooks/logic.ts`. Treat the totals as a guide, not a bill.

## Known limits

- An ordinary sentence that happens to contain a model name, such as "write a sonnet about rain", switches the model too.
- Turns with no model named are logged as well, so the log includes some engine-internal calls you did not prompt for.
- In a resumed session, a model chosen earlier can carry into a later prompt that names no model.
- The log has no session id, so lines from parallel sessions cannot be told apart. Each turn rewrites the whole day's file, so parallel turns can race.

## Development

```sh
claude plugin validate .
claude plugin test .
```

## License

MIT, see the repository [LICENSE](../../LICENSE).
