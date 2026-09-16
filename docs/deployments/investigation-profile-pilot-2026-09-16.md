# DIV-77 investigation-profile pilot — stopped during release

[DIV-77](https://linear.app/divinedesign/issue/DIV-77) stopped at stage 1 on 2026-09-16. The Modal
image failed its required VNC readiness verification. **No OpenInspect model worker was launched,
and no live investigation or publication-chain claim is established.**
[DIV-78](https://linear.app/divinedesign/issue/DIV-78) records the separate repair/review task.

Mason authorized scoped dev release preparation, one smoke and A, with B gated on human selection of
A's actual published proposal. The operator honored the stop-on-failure condition: no retry,
replacement worker, verifier bypass, or downstream dispatch. DIV-76 normalization and deferred
DIV-71/DIV-72 were not changed.

## Scorecard

| Check                                                     | Result                    | Evidence / limit                                                                                             |
| --------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Fresh source and deployment integration                   | Passed                    | Main `09f152de37ca26732f66d63be1887165c68ca59c`; deployment merge `33a814b698299ddcd35295205f11a69c679df695` |
| Dev target and concurrency preflight                      | Passed                    | `mdumas38-div61-dev`, Modal `div61-dev`; no active D1 sessions or Modal sandboxes                            |
| Shared-first build and merge checks                       | Passed                    | Shared, control-plane and Linear builds; 16 model tests; commit ESLint/Prettier/Ruff checks                  |
| Compatible full-stack release                             | Failed                    | Linear updated; Modal verification failed; control-plane runtime did not advance                             |
| Restricted live smoke                                     | Not run                   | Zero model-worker executions                                                                                 |
| Live filesystem, credential, tool and network enforcement | Unproven                  | Operator probe was prepared but never executed; earlier local tests are not this live test                   |
| Wrong-profile / unsupported-target rejection              | Unproven live             | Not exercised after release failure                                                                          |
| A → durable issue → B, callback replay                    | Not run                   | No A report, published proposal, B selection or B execution                                                  |
| Safe settings and cleanup                                 | Passed, with limits below | Publication false, implementation mode, no remaining active sessions/sandboxes; existing services healthy    |

## Deployment evidence

The preserved deployment checkout incorporated merged main without copying its private configuration
into the fresh task workspace. The only manual merge integration removed the deployment branch's
duplicate OpenRouter catalog entry in favor of the identical model ID now present on main. The first
commit-hook attempt lacked Ruff on PATH; frozen dev dependencies supplied it, and the next commit
completed with all hooks passing. No hooks were bypassed.

The reviewed saved Terraform plan targeted control-plane, Linear and Modal only. It retained the
existing binding flags, proposed no D1/DO migration, secret rotation or access expansion, and used
backend bucket `open-inspect-tfstate-mdumas38-div61-dev`, key `div61-dev/terraform.tfstate`. The
plan reported seven creates, two updates and seven destroys; these were Worker version and
build/deployment-resource replacements, not database destruction. Targeted-plan warnings mean this
is not a claim of zero whole-stack drift.

| Component                      | Before                                 | After failed apply                                                                                           |
| ------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Control-plane version          | `636245f9-f0b0-4cf1-a33a-560c23839208` | Unchanged                                                                                                    |
| Linear version                 | `efea59e0-d601-4a84-8631-080f766d1786` | `48de60e5-6889-404c-a2a3-a4bf0514f334`, serving 100%                                                         |
| Modal deployment               | Existing deployment                    | History confirms v3 remains latest, deployed 2026-09-15 02:38:08 UTC with SDK 1.4.3, source label `9f437d0*` |
| Local release SDK              | 1.4.3                                  | 1.5.5 from frozen lockfile                                                                                   |
| Publication / Linear task mode | `false` / `implementation`             | Unchanged                                                                                                    |

Attempted runtime: `v66-investigation-profile`, with bubblewrap in the image recipe. Build hash:
`e503e63dd32d36c68a65798e09559f85eac654d24176d007dc61fc4f863c32df`. The build log records images
`im-4NKKN9mh1vq3Y8c2v24xF9`, `im-DrALbqaTzWLaMs1TjOftAQ`, and `im-a3GtMwEPvEXh2ykNU8oBmu`; none is
claimed as a verified released investigation artifact. The verified-image record was not replaced:
it still identifies `im-zcB0Anr80WL5fSF2518CAD`, build hash
`53a0a6a639093f8f6a94a58a687cb8d915d8a748882aa8999450360b96fc7ff1` (the previous generation-65
build).

## Failure and cleanup

The standard `terraform/modules/modal-app/scripts/deploy.sh` ran the eager image build before Modal
deployment. `packages/modal-infra/deploy.py:60` raised:

```text
RuntimeError: Modal image verification failed
RuntimeError: VNC readiness timeout
```

The failing probe is `packages/sandbox-images/verify/smoke_test.py`, `desktop()`: x11vnc starts on a
random localhost port, and a socket with a one-second timeout waits for an `RFB ` greeting. The
captured x11vnc output includes repeated `webSocketsHandshake: unknown connection error`. Whether
this is a timing issue, deterministic verifier defect or image regression is unproven. Investigation
sessions disable desktop services, but that does not justify bypassing the shared image verification
contract. The Modal provisioner ran for approximately three minutes before failure; the logged
principal image build took 110.86 seconds.

The builder's `finally` path explicitly calls `sandbox.terminate()` before propagating the error.
The subsequent provider listing at 17:30:03 UTC found zero sandboxes in app
`ap-qbOmsZyI5zLYCaqhL8d5zP`; D1 also showed no active sessions. The build sandbox ID and individual
exit code were not captured, so there is no per-sandbox termination receipt. Both existing service
health endpoints returned HTTP 200. The failed Modal Terraform deployment resource is **tainted**; a
resumed release must reconcile and review a new plan, not blindly reuse this failed one.

The enabled daily repository findings webhook automation was inspected and left unchanged. Its
external cron gate runs at 09:00 America/New_York (next scheduled opportunity September 17, 13:00
UTC), outside this test window. No unrelated automation was paused or modified.

Model-worker executions: **0 of 3**. Model-worker spend:
**$0**. Image-build/verification and
Cloudflare infrastructure cost was not available from the inspected evidence and is not included
in that figure; compliance with the $2
campaign target is therefore unproven.

There are no issue→session→message→report→published-task→B links because no worker launched. DIV-78
is an operator-created release repair task, not worker-authored emergent work. Source integrity
before/after a worker, enforcement denials, report delivery and callback deduplication remain
untested in this campaign. Private plans, logs, scripts and inspection snapshots remain under
`/home/orca/.local/state/openinspect/div77-20260916/`; credentials and raw state remain private. The
deployment checkout and prior continuation notes are preserved. No additional Greptile review was
requested for PRs #7/#8.
