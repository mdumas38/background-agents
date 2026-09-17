# DIV-87 publication output contract

Replacement DIV-77 A on main `47cecb61209f73917d7388f01740705e70f0676f` completed source
investigation but publication rejected its report with `Invalid proposal title or size.` The report
put a four-backtick `markdown` wrapper immediately inside the three-backtick `openinspect-follow-up`
marker, before the required title. This is a malformed publication request, not a failure to
preserve or admit input. No proposal issue or B resulted.

The exact production parser rejects the retained report offline. A private diagnostic control
removing only the two extra wrapper-fence lines parses as one proposal (3,473 characters). The
control was not published, replayed or dispatched, and the original report remains unchanged. The
report contained 6,963 characters: below the product publication limit but above A's stricter
5,000-character instruction. Thirteen allowed source-tool calls completed; source digest and
revision stayed unchanged. Provider termination returned exit 137. Safe flags were restored.

This repair makes the existing first-line/fence contract explicit and reminds workers that stricter
task-specific report limits still apply. It distinguishes missing title/framing, overlong title and
oversized proposal with static diagnostics that do not echo report contents. Accepted grammar,
limits, quoted-example rejection and evidence preservation remain unchanged. No repair or retry is
automatic; the parser still rejects the observed malformed report.

Fourteen focused parser tests passed, including the observed nested-wrapper regression, independent
title/size errors and existing inner-code-fence, quoted-example and CRLF cases. Tests used a
temporary source copy with cached dependencies; no worker checkout was edited and no dependency
installation was needed. Node heap was capped at 384 MiB; test process-tree RSS peaked at 189,224
KiB. Changed-file ESLint and repository-configured Prettier passed. Full package/monorepo checks
were not run for this narrow change. Offline validation cannot prove future model output compliance.

Review/merge and a concrete Linear-only dev release require separate authorization. Then explicitly
resume the stopped pilot and add one slot if another A plus B is desired (one slot remains). Keep
all model/time/concurrency limits and select A's actual published task before B. Do not manually
publish the diagnostic control or treat this operator-created repair as A's proposal. The passed
source-tool smoke need not repeat. DIV-84's stronger callback durability acceptance remains open;
this repair makes no exactly-once claim.
