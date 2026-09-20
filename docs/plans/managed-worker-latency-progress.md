# Managed-worker latency: implementation checkpoint

September 20, 2026. Root
[DIV-184](https://linear.app/divinedesign/issue/DIV-184/improve-managed-worker-latency-and-completion-reliability).
Integration branch: `mdumas38/managed-worker-latency`; accepted base:
`2614c6353544eb816fd00aee226abd7c910bc74e`.

This is the first implementation batch, not completion of the ten-slice plan. No main merge,
deployment, production acceptance, or paid benchmark has been performed.

## Reviewed foundations

| Work                                                      | Native source       | Evidence and boundary                                                                                                                                                                      |
| --------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DeepSeek reasoning catalog and request-builder forwarding | DIV-187, `0e06483f` | Exposes low/high/max and rejects unsupported explicit efforts for the exact OpenRouter route. Request-builder tests alone are not provider-wire proof.                                     |
| Independent terminal result and stop trigger              | DIV-188, `dba2be70` | Strict, bounded, identity-checked pure projection; completion before or after a deadline remains separately visible. Not yet connected to durable stop/settlement or the private operator. |

The initial broader versions of both assignments reached their watchdog without a source patch. One
narrower correction per assignment succeeded (operator-observed 389 and 317 seconds respectively).
These are coding-task observations, not a matched latency experiment. Native managed workers
authored feature code; the coordinator reviewed, tested, and mechanically integrated their commits.
The original coordinator's dirty files are untouched.

Two subsequent tasks also hit the watchdog: DIV-189 startup timing exported an uncommitted patch,
while DIV-190 provider-wire verification exported no source changes. The timing patch is withheld:
returned sync failures and nonfatal hook failures can currently produce `succeeded` timing records.
It needs native correction and validation, not mechanical acceptance as accurate telemetry. Private
source exports and session receipts preserve the recovery inputs. All six campaign sandboxes have
confirmed termination receipts; no worker is intentionally left running. Four watchdogs out of six
coding attempts is further evidence of the problem, not proof that task narrowing has solved it.

## Validation before the next integration

At integration `56c5b595`:

- Shared build and all 905 shared tests passed.
- All 552 Linear-bot tests, TypeScript checking, and bundle build passed.
- All 75 targeted web model-selection and automation-template tests passed.
- 44 bridge-message tests and 56 prompt/reasoning/repository/supervisor tests passed.
- Changed TypeScript files passed ESLint/Prettier; changed Python files passed Ruff checks.

The broader runtime run (excluding opt-in wire tests) was stopped after 326 passes and nine failures
in `TestImageBuildMode`. Its unchanged fixture invokes real credential setup, including global Git
configuration and a protected `/usr/local/bin/gh` wrapper installation; the latter fails with a
permission error before mocked sync runs. A single-test reproduction confirmed that failure. Do not
run these fixtures with elevated host privileges to make them pass. Isolation and a complete rerun
are tracked in
[DIV-191](https://linear.app/divinedesign/issue/DIV-191/isolate-runtime-entrypoint-fixtures-from-host-wrapper-installation).
The full runtime suite is not green.

The existing pinned OpenCode wire fixture failed readiness before these feature changes. A separate
diagnostic reproduced an early health request consuming its full 30-second timeout; a following
request succeeded. Short per-request health timeouts allowed readiness in roughly four seconds. This
is a fixture diagnosis, not a provider-latency conclusion.

## Remaining acceptance gates

1. Prove actual low/high/max serialization through pinned OpenCode to a localhost fake OpenRouter
   provider, including omitted effort and model switching; preserve existing provider contracts.
   Live provider acceptance and snapshot/resume remain separate gates.
2. Connect terminal evidence to durable stop and completion with race/replay tests, plus repair and
   test the private operator's demonstrated completion/deadline race.
3. Freeze versioned policy at enrollment and attempts without changing old-state behavior.
4. Add correlated producer/receipt timing and the deterministic offline audit; startup logs alone
   are not full lifecycle instrumentation.
5. Implement compact canonical prompts and bounded deadline finalization without extending the hard
   deadline or resetting the clock on readiness.
6. Use measurements to select safe startup-cache changes; add bounded recovery and progress
   projection. Preserve root budgets and unknown-launch/stop reservations.
7. Seek the separate benchmark/canary and deployment approvals defined in the parent plan.

The parent task must remain open. Passing foundation tests does not establish a lower watchdog rate,
faster accepted changes, or completion of any milestone's full exit criteria.
