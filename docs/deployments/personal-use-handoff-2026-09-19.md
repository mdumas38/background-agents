# Personal-use handoff — 2026-09-19

> Superseded as the completion target by Mason's subsequent direction: finish the existing Linear
> work and its recorded acceptance criteria. This page remains a basic usage reference; health
> checks and a simple web task do not close DIV-77 or DIV-84.

Use the existing deployment for Mason's bounded, reviewed work. The next step is a useful task,
not another infrastructure project. This is limited personal use, not expanded production acceptance.

## Start work

1. [Open Open-Inspect](https://open-inspect-web-mdumas38-div61-dev.mason-587.workers.dev/login)
   and sign in with GitHub as `mdumas38`.
2. Select the existing pilot repository, `mdumas38/background-agents`. Start one small task;
   use an already configured model. The earlier web acceptance used `anthropic/claude-sonnet-4-6`.
   Linear currently defaults to `openrouter/deepseek/deepseek-v4.1-flash`; keep existing routing.
3. Keep the session URL. Review its diff and test results before merging anything. Check reported
   usage and provider billing after the task. Closing the browser does not stop a sandbox.

Suggested task format:

> Fix [specific behavior] in [area]. Limit changes to [scope]. Run the relevant tests and report
> the changes, results, and uncertainties. Do not merge or deploy.

Start with one session at a time. A successful useful task with reviewed output is the practical
personal-use checkpoint; it does not require another synthetic reliability run.

## If a task stalls or its Linear report is missing

Open the original session before retrying. Check whether it is still running or has already
completed; a missing Linear report is not proof the work failed. Use the original session's result
when available. If abandoning work, use Stop and verify the session has stopped. If it does not
settle, retain its URL and investigate the associated sandbox before starting a replacement.
Do not resend the same task blindly or redeploy infrastructure as a recovery shortcut.

## Evidence and limits

Read-only live checks on September 19 returned HTTP 200 for the web login, control-plane health,
and Modal health endpoints. The login page contains GitHub sign-in; control plane reports healthy
and Modal reports success. Admission is restricted to `mdumas38`, with other allowlists empty
and unrestricted admission false. Linear is in implementation mode with follow-up publication
false and the existing default model unchanged. D1 contains 26 sessions, zero active sessions,
and zero starting/running automation runs. The prior checkpoint had 24 sessions; this handoff
does not attribute or certify the two additional sessions.

No new sign-in, model task, sandbox, deployment, configuration change, or cloud write was performed
for this audit. Earlier end-to-end task evidence is historical; today's health checks do not replace
that evidence or demonstrate a fresh end-to-end task. The next useful task supplies that check.

PR #20 is already deployed. Local tests and the isolated live receiver recovery test remain
separate evidence. Fresh provider-commit response loss and a production receiver DO crash remain
untested; no universal exactly-once guarantee is claimed. DIV-84/DIV-77 retain their existing
review status. See [the live recovery record](receiver-recovery-2026-09-18.md).

Separate production infrastructure, percentage traffic rollout, additional failure injection, and
broader monitoring/restore engineering are deferred for this personal-use scope. Revisit them
before expanding users/repositories or relying on unattended operation. Existing private evidence,
credentials, deployment configuration, and DIV-86's unsent draft are preserved.
