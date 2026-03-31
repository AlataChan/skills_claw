# CLI-First Agents, Skill-Driven Intelligence: Toward a Post-Protocol Agent Architecture

## CLI 优先、技能驱动：迈向后协议时代的 Agent 架构

> March 2026

---

## Abstract

As AI agents gain the ability to use tools, the ecosystem has converged on protocol-based solutions — most notably MCP (Model Context Protocol) — to standardize how agents discover and invoke external capabilities. This paper argues that for the majority of developer-controlled agent systems, protocols are premature abstraction. We propose a simpler, more composable architecture built on five layers: **Hook** (event-driven triggers), **Skill** (packaged knowledge in markdown), **Command** (discrete named actions — typically CLI), **Runtime** (implementation logic), and **API** (external transport). We further identify the **skill noise problem** — the degradation of agent performance when dozens of skill descriptions compete for attention in the context window — and introduce a **two-tier skill loading system** with frontmatter-based routing that reduces estimated context overhead by 80-95% while preserving accurate skill selection. The architecture is platform-agnostic and has been applied across CLI-based workflow tools, batch automation systems, and low-code multi-agent platforms.

---

## 1. Thesis

An AI agent system needs five layers, each answering one question:

![Five-layer agent architecture](assets/01-five-layer-stack.svg)

| Layer | Metaphor | Question |
|-------|----------|----------|
| **Hook** | Nervous system | *When* should something happen? |
| **Skill** | Brain | *What* to do and *how* to think? |
| **Command** | Hands | *How* to execute it? |
| **Runtime** | Muscles | *What logic* runs behind the command? |
| **API** | Blood vessels | *How* to reach external services? |

Remove any one and the system breaks:

- Hook without Skill = reflexes without judgment
- Skill without Command = knowledge without action
- Command without Runtime = interface without implementation
- Runtime without API = local-only, no external reach
- All without Hook = everything is manual, nothing is automatic

This paper defines each layer, explains their interactions, and addresses the critical problem of **skill noise** — what happens when an agent faces 50+ skills and most are irrelevant to the current task.

---

## 2. Layer definitions

### 2.1 Hook — the nervous system

Hooks are event-driven triggers that fire automatically when conditions are met. They make the system reactive.

Without hooks, every action requires the agent to decide "I should do X now." With hooks, behaviors fire automatically — like reflexes.

**Properties:**

- Fires on events: session start, file change, pre/post tool use, error, timer
- Can trigger skills, CLI commands, or runtime functions
- Acts as the bridge between external events and internal workflow
- Solves the "cold start" problem — setup happens before the agent reads any skill

**The four problems hooks solve:**

1. **Cold start** — workspace initialization before the agent loads any skill
2. **Guardrails** — pre-action hooks validate, log, or block dangerous operations
3. **Automation** — post-action hooks trigger next steps without agent decision
4. **Consistency** — certain behaviors always happen regardless of which skill is active

**Example:** A workflow tool's `SessionStart` hook initializes the project workspace before the agent thinks about what to do. The agent doesn't need to "remember" initialization — it's automatic.

### 2.2 Skill — the brain

Skills are packaged knowledge — text files that shape the agent's judgment and decision-making. A skill cannot execute anything. Its power is in directing *how the agent thinks* about a task.

**Properties:**

- Read at "think time" (before acting)
- Contains: when to act, what strategy to follow, which commands to run, how to interpret results
- Platform-agnostic — the same skill can guide Claude, GPT, Qwen, or a local model
- Can reference CLI commands, API endpoints, or other skills

**Skill vs. Plugin distinction:**

A skill in its simplest form is a `.md` file — pure knowledge. When a skill grows to include scripts, configuration, and runtime dependencies, it becomes what Claude Code calls a "plugin." The boundary is:

- **Skill** = text knowledge that guides agent reasoning
- **Plugin** = skill + executable code + configuration + dependencies

Both serve the same purpose (guiding agent behavior), but plugins carry implementation weight. The skill index system described in Section 4 treats them uniformly.

### 2.3 Command — the hands

The command layer is where discrete, named, composable actions live. Every agent system needs a surface through which the agent triggers real effects — this layer is that surface.

The command layer has consistent properties regardless of implementation:

- **Text-addressable** — actions are invoked by name, not by clicking or navigating
- **Composable** — actions can be chained: the output of one feeds the input of another
- **Inspectable** — a human can invoke the same action to verify what the agent did
- **Scriptable** — an agent can dynamically construct action invocations

The command layer takes different forms on different platforms:

| Platform | Command surface | Example |
|----------|----------------|---------|
| Terminal-based agents | CLI commands | `agentflow verify`, `python -m app.main --batch` |
| Low-code platforms | Workflow nodes | A "validate document" node in a visual builder |
| API-first systems | Named endpoints | `POST /api/v1/review/start` |

**Why CLI is the best implementation of the command layer for agents:**

Among these surfaces, CLI is the thinnest and most universal. Unlike GUI (needs vision model), API endpoints (need HTTP client setup), or workflow nodes (need a specific platform), CLI requires only the ability to run a string and read the output. This is the most basic capability every AI agent has. Claude Code, Codex CLI, aider — the industry is converging on CLI as the default agent execution surface.

This paper uses "CLI" and "command" interchangeably when the context is terminal-based agents — which is the primary use case. The architectural layer is "command"; CLI is its strongest instantiation.

### 2.4 Runtime — the muscles

Runtime is the actual implementation behind command-layer actions. The agent doesn't interact with it directly.

**Properties:**

- Internal implementation detail, invisible to the agent
- Can be any language (Node.js, Python, Go, Rust)
- Handles file I/O, state management, validation logic
- Testable independently of the agent
- The command layer is the stable contract; the runtime can be refactored freely

### 2.5 API — the blood vessels

API calls are communication channels to external services. REST, SSE, WebSocket — the transport choice is an implementation detail inside the runtime layer.

**Properties:**

- Called by runtime, not directly by the agent in most cases
- Includes: LLM calls, database queries, webhooks, file storage
- Can be wrapped in command-layer actions to hide complexity from the agent

**On MCP:** Model Context Protocol adds a standardized layer between skills and APIs. It is unnecessary when the tool ecosystem is bounded and stable, the developer controls what integrations exist, and duplicating some API code across skills is acceptable. MCP earns its keep at scale (10+ integrations, multi-agent shared access, third-party maintained servers). For developer-controlled systems, Skill + Command + API is simpler.

---

## 3. Layer interactions

### 3.1 The standard flow

```
Event occurs
  → Hook fires (automatic, no agent decision)
    → Skill is loaded (agent reads knowledge)
      → Command is called (agent acts)
        → Runtime executes (code runs)
          → API calls made (if external services needed)
            → Results flow back up the stack
```

### 3.2 Three composition patterns

![Three composition patterns](assets/02-composition-patterns.svg)

**Pattern 1: Skill wraps command** (most common)

The skill is primary. The agent reads the skill, which tells it which commands to run and in what order.

```
Agent reads skill → skill says "run X" → agent calls command → runtime executes
```

Example: A task planning command — the skill defines the workflow; CLI commands are steps within it.

**Pattern 2: Hook triggers command** (automation)

The hook is primary. An event fires, which directly triggers a command or runtime function. No skill reading needed.

```
Event fires → hook calls command/runtime → done
```

Example: `SessionStart` → `runtime/init.js` — automatic workspace setup.

**Pattern 3: Skill embeds API directly** (simple integrations)

No separate CLI. The skill tells the agent to make raw API calls.

```
Agent reads skill → skill says "curl this endpoint" → agent runs curl → interprets result
```

Example: A knowledge base query skill that embeds `curl -X POST https://api.example.com/search`.

### 3.3 Hooks as bookends

Without hooks:
```
Agent reads skill → agent calls command → runtime executes → API transports
```

This is purely reactive — the agent only acts when instructed.

With hooks:
```
Hook (pre)  → Setup before agent thinks
                ↓
Agent reads skill → agent calls command → runtime executes → API transports
                ↑
Hook (post) → Follow-through after agent acts
```

Hooks provide pre-action setup (cold start, context loading) and post-action follow-through (review triggers, logging, cleanup) that don't depend on agent memory or judgment.

---

## 4. The skill noise problem and the skill index

### 4.1 The problem

![The skill noise problem](assets/03-skill-noise-problem.svg)

When an agent faces 50+ skills, most are irrelevant to the current task. Loading all skill descriptions into context creates noise that degrades routing accuracy and wastes context tokens.

**Estimated impact:**

- 50 skill descriptions at ~80 words each = ~4,000 tokens consumed before the agent reads the user's message
- 50 full SKILL.md files at ~600 words each = ~30,000+ tokens — a significant fraction of the context window
- At 50 skills, the LLM must scan all descriptions to decide which one applies. Attention gets diffused across irrelevant content
- Ambiguous requests match multiple descriptions, increasing error rate

The brute-force approach ("always check everything, even at 1% probability") works at 10 skills. At 50+ it becomes the very noise it tries to prevent.

### 4.2 The solution: two-tier skill loading

Skills are divided into two tiers based on how they enter the agent's context:

**Tier 1: Core skills (always loaded)**

These are skills the agent needs on every task, regardless of domain. They define *how the agent operates*, not what it operates on.

- **Workflow skill** — the task lifecycle (plan → execute → verify → review → finish)
- **Skill router** — the meta-skill that resolves which domain skill to load (see 4.3)
- **Coding conventions** — project-specific rules that apply to all code changes
- **Memory/recall** — how to persist and retrieve learned knowledge

Typically 3-5 skills. Total context cost: ~2,000-3,000 tokens. Always in context, never routed through the index.

**Tier 2: Domain skills (lazy-loaded via index)**

Everything else — document creation, audit workflows, deployment, testing, integrations. These are loaded on demand when the agent determines they're relevant.

A domain skill is never in context until explicitly loaded. This means 45+ skills have zero context cost until needed.

### 4.3 The skill index: frontmatter-based routing

Each skill declares its own routing metadata in YAML frontmatter at the top of its SKILL.md:

```yaml
---
name: invoice-review
version: 1.2.0
tier: domain
domain: finance
triggers:
  - invoice
  - billing
  - payment review
  - accounts payable
  - vendor reconciliation
summary: "Review and validate invoices against purchase orders"
depends: [knowledge-base, pdf]
priority: normal
---
```

**Frontmatter fields:**

| Field | Required | Purpose |
|-------|----------|---------|
| `name` | yes | Unique skill identifier |
| `version` | no | Semantic version for change tracking |
| `tier` | yes | `core` or `domain` — determines loading strategy |
| `domain` | no | Logical grouping for categorized display |
| `triggers` | yes | Keywords, phrases, slash commands that activate this skill |
| `summary` | yes | One-line description (≤15 words) for the routing table |
| `depends` | no | Other skills that should co-load when this one activates |
| `priority` | no | `high`, `normal`, `low` — tiebreaker when multiple skills match |

### 4.4 The routing table

At session start, a Hook scans all SKILL.md files and extracts only the frontmatter. This produces a compact routing table:

```
SKILL INDEX (generated at session start)
══════════════════════════════════════════

[finance]
  invoice-review | Review and validate invoices     | invoice, billing, payment review
  expense-report | Process expense submissions      | expense, reimbursement, receipt

[document]
  docx           | Word document creation/editing   | .docx, report, memo, letter
  pdf            | PDF operations                   | .pdf, merge, split, fill form
  pptx           | Presentation creation            | slides, deck, presentation
  xlsx           | Spreadsheet operations           | .xlsx, .csv, spreadsheet

[devops]
  deploy         | Deployment automation            | deploy, release, staging, prod
  docker         | Container operations             | docker, container, image, compose
  ci-cd          | Pipeline configuration           | pipeline, github actions, CI

[workflow]
  task-tracker   | Batch task lifecycle             | batch, order, download, retry
  project-mgmt   | Task lifecycle management        | plan, verify, review, finish
```

**Context cost:** ~800-1,200 tokens for 50 skills. Compare to ~4,000 tokens for full descriptions or ~30,000 for full SKILL.md content.

### 4.5 The routing flow

![Skill routing flow](assets/04-routing-flow.svg)

```
1. [Hook]        SessionStart → scan all SKILL.md frontmatters
2. [Hook]        Build routing table, inject into context
3. [Core skill]  Skill router is always loaded (tier 1)
4. [User]        "Review the Q3 invoices from our top 5 vendors"
5. [LLM]         Consults routing table →
                   trigger match: "invoice" + "review" → invoice-review (score: high)
                   dependency: invoice-review depends on [knowledge-base, pdf]
6. [LLM]         Loads: invoice-review/SKILL.md + knowledge-base/SKILL.md + pdf/SKILL.md
7. [Skill]       invoice-review guides the agent through the workflow
8. [Command]    Agent calls review commands
9. [Hook]        Post-action hook logs which skills were used (feeds back into index optimization)
```

**Key properties:**

- Steps 1-2 are automatic (hook-driven, no agent decision)
- Step 5 is cheap: scan ~800 tokens, not 30,000
- Step 6 is lazy: only needed skills enter full context
- Step 9 creates a feedback loop for improving trigger accuracy

### 4.6 Multi-skill resolution

When a request matches multiple skills, the router uses these rules in order:

1. **Trigger specificity** — exact phrase match ("accounts payable") beats partial keyword match ("review")
2. **Domain coherence** — skills in the same domain as already-loaded skills get preference
3. **Priority field** — `high` > `normal` > `low` as tiebreaker
4. **Dependency pull** — if skill A depends on skill B, both load together

For ambiguous cases, the router can present the top 2-3 candidates to the agent with confidence scores, letting the LLM make the final judgment:

```
Matched skills for "review the vendor report":
  invoice-review (0.82) — Review and validate invoices      [triggers: invoice, vendor]
  expense-report (0.65) — Process expense submissions        [triggers: receipt]
  docx           (0.40) — Word document operations           [triggers: report]

→ Load: invoice-review (above threshold)
→ Skip: expense-report, docx (below threshold, available if needed)
```

### 4.7 Dependency graph

Skills can declare dependencies, creating a graph of co-loading relationships:

```
invoice-review
  └── depends: [knowledge-base, pdf]
        └── knowledge-base depends: []
        └── pdf depends: []

project-mgmt
  └── depends: [memory]
        └── memory depends: []

task-tracker
  └── depends: [pdf, browser-automation]
```

When `invoice-review` loads, `knowledge-base` and `pdf` load automatically. The agent doesn't need to know about these transitive dependencies — the index resolver handles it.

**Circular dependency protection:** If A depends on B and B depends on A, the resolver loads both once and logs a warning. No infinite loops.

### 4.8 Index maintenance

The routing table is regenerated on every session start (Hook-driven). It can also be manually refreshed:

```bash
# CLI command to rebuild the index
agentflow skill-index rebuild

# CLI command to validate all frontmatters
agentflow skill-index validate

# CLI command to show the current routing table
agentflow skill-index show
```

**Drift detection:** If a SKILL.md file is modified but its frontmatter triggers don't reflect the new content, the index validator flags it. This keeps the routing table honest.

**External skill integration:** A skill-pool meta-skill can feed external registry results into the same index format. Skills discovered from community repositories get a synthetic frontmatter generated from their README metadata, making them routable through the same system.

---

## 5. Concrete implementations

The five-layer architecture is platform-agnostic. Below are three implementation patterns that demonstrate how the same model maps to different stacks and domains.

### 5.1 Structured AI workflow tool

A CLI-based workflow manager for AI coding agents, supporting multiple agent platforms.

| Layer | Implementation |
|-------|----------------|
| Hook | Agent platform event handlers (SessionStart, PreToolUse, PostToolUse) |
| Skill (core) | Workflow lifecycle skill — always loaded, defines plan → execute → verify → review → finish |
| Skill (domain) | Domain-specific skills, loaded via index |
| Command | CLI commands: `agentflow plan`, `agentflow verify`, `agentflow review`, `agentflow finish` |
| Runtime | Node.js business logic |
| API | HTTP calls embedded in runtime as needed |
| State | `.agentflow/` (shared) + `.plans/<slug>/` (per-task) |

**Multi-platform support:** First-class support on Claude Code via `hooks + skills + runtime`. Supported on Codex via `skills + runtime` in manual mode (no hooks). The Skill layer acts as the adapter — different instruction files for different agent platforms, same CLI underneath.

### 5.2 Batch document automation tool

A Python CLI tool for batch-downloading, validating, and processing documents from a web portal.

| Layer | Implementation |
|-------|----------------|
| Hook | IDE rule files acting as session-start guidance |
| Skill | Domain knowledge files — portal navigation workflow, validation criteria, error handling |
| Command | CLI: `python -m app.main` with flags (`--order-id`, `--batch`, `--retry-failed-from`) |
| Runtime | Python modules (core logic, workflow engine, support utilities) |
| API | Playwright browser automation as the transport layer |
| State | `runtime/` (logs, session state, validated outputs, batch reports) |

### 5.3 Low-code multi-agent platform

Agent personas deployed on a visual workflow platform for domain-specific analysis tasks (e.g., grant review, data analysis, report generation).

| Layer | Implementation |
|-------|----------------|
| Hook | Workflow platform triggers (form submission, scheduled runs, webhook events) |
| Skill | Agent personas defined as structured prompts — each persona carries domain expertise, analytical frameworks, and output format rules |
| Command | Workflow nodes: discrete, named actions within the visual builder (not CLI — same layer, different surface) |
| Runtime | Workflow platform + RAG engine as the execution layer |
| API | LLM API calls, knowledge base queries, document extraction endpoints |
| State | Conversation memory + knowledge base documents |

All three follow the same five-layer pattern despite being built on completely different stacks (Node.js CLI, Python CLI, visual workflow platform). The architecture is platform-agnostic.

### 5.4 When protocol-first architecture is the right choice

This paper argues that skill-first, CLI-driven architecture is simpler and sufficient for bounded, developer-controlled systems. That claim has limits. Protocol-based architectures — MCP or similar — become the better choice under specific conditions:

**Scale of integrations.** When an agent system needs to connect to 15+ external services, maintaining API calls inside individual skills becomes a maintenance burden. Each skill carries its own auth handling, error parsing, and schema knowledge. A protocol layer centralizes this. The crossover point varies, but somewhere between 10-20 integrations, protocol abstraction starts paying for itself.

**Third-party maintained servers.** When service providers (Figma, Slack, Salesforce) maintain their own MCP servers, the integration cost drops to zero — you connect, not build. The skill-first approach requires someone on your team to write and maintain every integration. If high-quality MCP servers exist for your services, using them is pragmatic, not ideological.

**Multi-tenant agent platforms.** When you're building a platform where end users connect their own tools at runtime — not a fixed set chosen by the developer — dynamic discovery via `tools/list` is a genuine requirement. Skills can't be pre-written for tools that don't exist yet.

**Compliance and audit.** Protocol layers create a natural chokepoint for logging, rate-limiting, and access control. A skill that embeds raw `curl` calls gives the agent unrestricted access to whatever the API key allows. An MCP server can enforce "read but not write" or "requires user confirmation" at the protocol level.

The position of this paper is not that protocols are wrong — it is that they are frequently premature. Most agent systems today are built by small teams with bounded integration surfaces. For these systems, adding a protocol layer before it's needed adds complexity without proportional benefit. Start with Skill + Command + API. Introduce MCP when the conditions above are met.

---

## 6. Design principles

### 6.1 Skills are lazy, hooks are eager

Skills should never be eager-loaded into context. The default state is: the agent knows *what skills exist* (via the index) but doesn't carry their full content. Only when a task requires a specific skill does it enter working context.

Hooks are the opposite — they must be eager. A hook that fires late is useless. All hook registrations happen at session start, before any user interaction.

### 6.2 The command layer is the stable contract

The command layer is the interface that must not break. Runtime can be refactored, skills can be rewritten, hooks can be reconfigured — but `agentflow verify` must always do the same thing. This is what makes the system agent-agnostic: any LLM that can run a named action can use the command layer. And since CLI is the most universal command surface, any LLM that can run bash can use it.

### 6.3 Skills are the adapter layer

Different LLMs need different skill formats. Claude Code reads CLAUDE.md. Codex reads AGENTS.md. Cursor reads .cursorrules. The skill layer absorbs this variation. The same command layer and runtime serve all agents; only the skill (the instruction text) changes per platform.

### 6.4 Frontmatter is the single source of truth

A skill's routing metadata lives in the skill file itself, not in a separate index. The index is always a derived artifact — generated by scanning frontmatters, never hand-edited. This eliminates drift between what a skill does and how the system routes to it.

### 6.5 The agent should not need to manage the machinery

The agent doesn't need to understand frontmatter parsing, dependency resolution, or index generation. From the agent's perspective: it receives a task, consults available skills, picks the right one, and acts. The two-tier system and routing table are infrastructure that makes this selection fast and accurate. The agent experiences it as "I know what tools I have."

The agent *can* see routing results — knowing which skill was selected and why helps it self-correct if the match was wrong. What the agent should never need to do is build, maintain, or debug the routing infrastructure itself.

---

## 7. The complete formula

![The complete formula](assets/05-complete-formula.svg)

```
┌─────────────────────────────────────────────────────┐
│                    HOOK LAYER                        │
│  SessionStart → build skill index, load core skills │
│  PreToolUse  → validate, log                        │
│  PostToolUse → trigger follow-up, update memory     │
└──────────────────────┬──────────────────────────────┘
                       │ automatic
                       ▼
┌─────────────────────────────────────────────────────┐
│                   SKILL LAYER                       │
│                                                     │
│  ┌─────────────┐    ┌──────────────────────────┐   │
│  │  Tier 1:    │    │  Tier 2:                 │   │
│  │  Core       │    │  Domain (lazy-loaded)    │   │
│  │  (always on)│    │                          │   │
│  │             │    │  ┌────────────────────┐  │   │
│  │  • workflow │    │  │  Skill Index       │  │   │
│  │  • router   │◄───┤  │  (frontmatter)     │  │   │
│  │  • conventions   │  │  ~800 tokens       │  │   │
│  │  • memory   │    │  │  for 50+ skills    │  │   │
│  │             │    │  └───────┬────────────┘  │   │
│  └─────────────┘    │         │ match + load   │   │
│                     │         ▼                │   │
│                     │  ┌────────────────────┐  │   │
│                     │  │ Full SKILL.md      │  │   │
│                     │  │ loaded on demand   │  │   │
│                     │  └────────────────────┘  │   │
│                     └──────────────────────────┘   │
└──────────────────────┬──────────────────────────────┘
                       │ instructs
                       ▼
┌─────────────────────────────────────────────────────┐
│                  COMMAND LAYER                       │
│  The stable contract — CLI, workflow nodes, or API  │
│  calls. Any named action the agent can invoke.      │
│                                                     │
│  agentflow plan   agentflow verify   agentflow finish│
│  python -m app.main --batch --retry-failed          │
└──────────────────────┬──────────────────────────────┘
                       │ executes
                       ▼
┌─────────────────────────────────────────────────────┐
│                  RUNTIME LAYER                       │
│  Implementation behind commands                     │
│  Node.js / Python / any language                    │
└──────────────────────┬──────────────────────────────┘
                       │ calls (when needed)
                       ▼
┌─────────────────────────────────────────────────────┐
│                    API LAYER                         │
│  HTTP / SSE / WebSocket to external services        │
│  Embedded in runtime, invisible to the agent        │
└─────────────────────────────────────────────────────┘
```

---

## 8. Open directions

### 8.1 Agent-agnostic skill format

If skills become the adapter layer for different LLMs, a standardized frontmatter schema could enable skill portability across agent platforms. A skill written for Claude Code could work in Codex, Cursor, or a local model — only the presentation format changes, not the knowledge.

### 8.2 Skill index as a shared service

In multi-agent systems, the skill index could be a shared resource. Agent A discovers that skill X is effective for task type Y; this routing knowledge becomes available to Agent B. The index evolves through collective use, not just static declaration.

### 8.3 Dynamic skill generation

Instead of only loading pre-written skills, an agent could generate a temporary skill on the fly — a mini SKILL.md synthesized from context, past experience, and the current task. This temporary skill guides the immediate workflow, then either gets discarded or promoted to a permanent skill if the pattern recurs.

### 8.4 Hook standardization

Claude Code hooks, Cursor rules, Codex agents — each platform has its own event system. A platform-agnostic hook specification (similar to git hooks but for AI agent lifecycles) would complete the portability story. The events are universal: session start, pre-action, post-action, error, idle. Only the wiring is platform-specific.

---

## Appendix A: Frontmatter schema reference

```yaml
---
# Required fields
name: string              # Unique identifier, kebab-case
tier: core | domain       # Loading strategy
triggers: string[]        # Keywords and phrases that activate this skill
summary: string           # One-line description, ≤15 words

# Optional fields
version: string           # Semantic version (e.g., "1.2.0")
domain: string            # Logical grouping (e.g., "finance", "devops", "document")
depends: string[]         # Skills that co-load when this one activates
priority: high | normal | low  # Tiebreaker for multi-match resolution
platform: string[]        # Supported platforms (e.g., ["claude-code", "codex", "cursor"])
author: string            # Skill creator
updated: date             # Last modification date
---
```

## Appendix B: Skill index CLI reference

```bash
# Rebuild the routing table from all SKILL.md frontmatters
agentflow skill-index rebuild

# Validate all frontmatters for required fields and format
agentflow skill-index validate

# Display the current routing table
agentflow skill-index show

# Test routing: which skill would be selected for a given query?
agentflow skill-index match "review the quarterly invoices"

# Show dependency graph
agentflow skill-index deps invoice-review

# Export index as JSON (for programmatic consumption)
agentflow skill-index export --format json > skill-index.json
```

## Appendix C: Migration path

For existing projects adopting this architecture:

1. **Add frontmatter to existing skills** — no behavior change, just metadata
2. **Mark 3-5 skills as `tier: core`** — these stay always-loaded
3. **Add a SessionStart hook** — scans frontmatters, builds routing table
4. **Replace brute-force skill checking** with index-based routing
5. **Add `depends` fields** where skills naturally co-occur
6. **Monitor and tune triggers** — post-action hooks log which skills were used, revealing gaps in trigger coverage

The migration is incremental. Each step improves routing without breaking existing behavior.
