# Compaction Survival Protocol

## On Every Session Start
1. Activate Serena project: `activate_project("GIFTSSITE")`
2. Read `session-state` memory — contains current task, git state, next steps
3. Read `list_memories` — check for relevant context
4. Resume work from last checkpoint

## Before Compaction (automatic via PreCompact hook reminder)
1. Save progress to Serena `session-state` memory
2. Include: current task, modified files, decisions made, next steps
3. Note any running background agents and their task_ids

## What Survives Compaction
- This file (auto-loaded from .claude/rules/)
- CLAUDE.md (auto-loaded)
- Serena memories (external, always available)
- Files on disk (docs/plans/, code)

## What Gets Lost
- Conversation details and intermediate reasoning
- Tool outputs and search results
- Background agent results (unless saved to memory)

## Recovery Checklist
After compaction, if context seems missing:
- [ ] Is Serena project active? → `activate_project`
- [ ] Read `session-state` → current task + progress
- [ ] Read `project-overview` → tech stack + features
- [ ] Read `style-conventions` → code patterns
- [ ] Check `git status` → what changed
