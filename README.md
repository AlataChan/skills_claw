# SkillCLI

CLI-first skill runtime for discovering, installing, validating, routing, and emitting AI skills.

Install (global):
- `npm i -g skills_claw`
- `npm i -g @alatachan/skills_claw`

Run:
- `skill --help`

Canonical skill file:
- `skill.md` with YAML frontmatter + Markdown body
- Legacy `skill.yaml` is still accepted as an install/import source

Implemented commands:
- `skill init [name]`
- `skill validate [file] [--target openai]`
- `skill source add|list|remove <url-or-path>`
- `skill search <keyword>` / `skill info <name>`
- `skill install <skill-ref> [--input key=value] [--with-deps]`
- `skill list` / `skill uninstall <name>` / `skill update <name|--all>`
- `skill check-deps <name>`
- `skill emit <name> --target <claude-code|openai|anthropic-api> --out <dir>`
- `skill index rebuild|show [--json]`
- `skill index match "<query>" [--json] [--threshold 0.5] [--max 5] [--exclude a,b] [--loaded-domains finance,document]`
- `skill index deps <name>` / `skill index deps --all`
- `skill index validate`
- `skill index core --json`
- `skill index load <name> [--with-deps] --json`
- `skill index emit-hook --target claude-code --out <dir>`
- `skill adapter list|install`
- `skill doctor`
- `skill evolve add <entry>`
- `skill publish`

`skill-ref` supports:
- `name@version`
- `github:user/repo@hash`
- local path (`./skill.md`, `./SKILL.md`, `./skill.yaml`)
