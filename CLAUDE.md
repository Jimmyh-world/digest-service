# Claude AI Assistant Instructions

<!--
TEMPLATE_VERSION: 1.4.2
TEMPLATE_SOURCE: /home/jimmyb/templates/CLAUDE.md.template
-->

Please refer to **AGENTS.md** for complete development guidelines and project context.

This project follows the [agents.md](https://agents.md/) standard for AI coding assistants.

All AI assistants (Claude, Cursor, GitHub Copilot, Gemini, etc.) should use AGENTS.md as the primary source of project information and development guidelines.

## Quick Reference

### Core Development Principles
1. **KISS** - Keep It Simple, Stupid
2. **TDD** - Test-Driven Development
3. **SOC** - Separation of Concerns
4. **DRY** - Don't Repeat Yourself
5. **Documentation Standards** - Factual, dated, objective
6. **Jimmy's Workflow** - Red/Green Checkpoints (MANDATORY)
7. **YAGNI** - You Ain't Gonna Need It
8. **Fix Now** - Never defer known issues

### Jimmy's Workflow
Use for all implementation tasks:
- 🔴 **RED**: IMPLEMENT (write code, build features)
- 🟢 **GREEN**: VALIDATE (run tests, prove it works)
- 🔵 **CHECKPOINT**: GATE (mark complete, document rollback)

**Invoke**: *"Let's use Jimmy's Workflow to execute this plan"*

**Reference**: See **JIMMYS-WORKFLOW.md** for complete system

### Template Discovery & Compliance Auditing

**When user says** "check templates" OR "check if we're following the rules" OR mentions ~/templates/:

1. **Read ~/templates/AGENTS.md FIRST** (not just README.md)
2. **Follow** "For AI Assistants: Project Compliance Audit Workflow" section
3. **Execute** ~/templates/tools/audit-project.sh OR run 7 manual checks
4. **Generate** compliance report (formatted)
5. **Offer** remediation (initialize, sync, fill placeholders, etc.)

**Don't just read and ask - actively execute the audit workflow!**

### Critical Rules
- ✅ Write tests FIRST (TDD)
- ✅ Run explicit validation commands
- ✅ Never skip checkpoints
- ✅ Document rollback procedures
- ✅ Include actual dates in documentation
- ✅ Use `gh` CLI for all GitHub operations
- ✅ Apply YAGNI - only build what's needed NOW
- ✅ Fix vulnerabilities, warnings, test failures IMMEDIATELY
- ✅ Proactively run compliance audit when user asks about "templates" or "up to date"
- ✅ Run ~/templates/tools/audit-project.sh automatically (don't just suggest it)
- ✅ Generate compliance report and offer remediation
- ❌ Never proceed without GREEN validation passing
- ❌ Never assume - always verify
- ❌ Never use marketing language in docs
- ❌ Never add "helpful" features not explicitly required
- ❌ Never suggest "fix this later" or add suppressions without documented justification

### GitHub Operations
```bash
# Pull Requests & CI/CD
gh pr create --title "Title" --body "Description"
gh pr checks                # Monitor CI/CD status
gh pr list                  # View open PRs

# Issues
gh issue create --title "Bug" --body "Description"
gh issue list               # View open issues

# Workflow Monitoring
gh run list                 # List workflow runs
gh run watch                # Watch current run (live)
```

### Common Commands
```bash
# Development
[DEV_COMMAND]          # Start dev server
[TEST_COMMAND]         # Run tests
[BUILD_COMMAND]        # Build for production
[TYPECHECK_COMMAND]    # Type checking
[LINT_COMMAND]         # Linting

# Template Compliance
~/templates/tools/audit-project.sh     # Full compliance audit
~/templates/tools/check-version.sh     # Quick version check
```

---

*Last updated: [YYYY-MM-DD]*
*Template Version: 1.0*
