# Git & GitHub Setup

Git and GitHub CLI are configured. You can directly commit, push, and create PRs without authentication.

## Commit Workflow

1. `git status` - Check modified files
2. `git diff` - Review changes
3. **Security check**: No API keys, tokens, passwords, or secrets
4. **Skip temp files**: `temp*`, `test_*`, `*.log`, `*.tmp`, `.DS_Store`, `node_modules/`, `__pycache__/`
5. `git add <file1> <file2>` - Stage relevant files only (never `git add .`)
6. `git commit -m "message"` - Commit with clear message
7. `git push` - Push to remote (unless told not to)

**Rules**:
- Commit after completing each change (except during bug fixing - wait for user confirmation)
- Each commit must be functional, no broken code
- Never commit secrets

## GitHub Commands

- Push: `git push`
- Create PR: `gh pr create --title "..." --body "..."`
- Other: `gh pr list`, `gh pr view`, `gh issue create`, `gh repo clone`
