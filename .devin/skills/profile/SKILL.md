---
name: profile
---

# User Preferences

## Git commits

- NEVER include the "Generated with [Devin](https://devin.ai)" line or the "Co-Authored-By: Devin" trailer in commit messages. Write commit messages as if the user wrote them directly.
- The shell is PowerShell on Windows. Heredoc syntax (`<<'EOF'`) does not work — write the commit message to a temp file and use `git commit -F <file>` instead.
