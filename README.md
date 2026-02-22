# SkillCLI (prototype)

Implemented commands:
- `skill init [name]`
- `skill validate [file] [--target openai]`
- `skill source add|list|remove <url-or-path>`
- `skill search <keyword>` / `skill info <name>`
- `skill install <skill-ref> [--input key=value]`
- `skill list` / `skill uninstall <name>` / `skill update <name|--all>`
- `skill check-deps <name>`
- `skill emit <name> --target <claude-code|openai|anthropic-api> --out <dir>`
- `skill adapter list|install`
- `skill doctor`
- `skill evolve add <entry>`
- `skill publish`

`skill-ref` supports:
- `name@version`
- `github:user/repo@hash`
- local path (`./skill.yaml`)
