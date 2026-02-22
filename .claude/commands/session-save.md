# Save Session State

Save current session state to Serena memory for context recovery.

## Instructions

1. Activate Serena project (GIFTSSITE) if not active
2. Gather current state:
   - What task is in progress
   - What files were modified (git status)
   - Recent git log (last 5 commits)
   - Any open issues or blockers
   - Architecture decisions made in this session
3. Update `session-state` memory in Serena with all gathered info
4. List all memories to confirm state is saved
5. Print summary of what was saved

## This should be run:
- Before ending a session
- After completing a major milestone
- Before context compaction is expected
- When switching to a different task
