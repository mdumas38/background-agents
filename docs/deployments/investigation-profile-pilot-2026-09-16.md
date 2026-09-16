# DIV-77 investigation-profile pilot — release passed, smoke failed

[DIV-77](https://linear.app/divinedesign/issue/DIV-77) stopped at stage 2 on 2026-09-16. After Mason
authorized a post-reboot release retry, generation 66 deployed successfully. The single smoke
reached the restricted OpenCode runtime, then failed to resolve the approved OpenRouter model. **No
source investigation report was produced; A and B were not dispatched.**
[DIV-81](https://linear.app/divinedesign/issue/DIV-81) is the current blocker.

## Scorecard

| Check                                     | Result                                      | Evidence / limit                                                                                                                     |
| ----------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Source and dev targets                    | Passed                                      | Main `09f152de37ca26732f66d63be1887165c68ca59c`; deployment `33a814b698299ddcd35295205f11a69c679df695`; existing `div61-dev` only    |
| Build and compatible release              | Passed on authorized retry                  | Shared-first builds; 16 model tests; ESLint/Prettier/Ruff checks; full baked-image verification and Modal v4 deployment              |
| Unsupported admission                     | Passed                                      | No repository, non-OpenRouter model and non-OpenCode harness each returned HTTP 400 before session creation                          |
| Actual filesystem boundary                | Passed                                      | Source/binary/root writes denied with EROFS; scratch and temporary writes allowed; project metadata/extensions hidden                |
| Credential environment                    | Passed for inspected harness                | Environment key names contained no supervisor/SCM credential variables; only the approved model credential was present               |
| Tool restrictions                         | Configuration verified; invocation unproven | Live config retained deny-by-default policy, source read/glob/grep allowlist, empty plugins and no MCP; no model tool calls occurred |
| Network boundary                          | Partial                                     | Nonallowlisted HTTPS and raw-IP HTTP failed; allowed control-plane health reached HTTP 200; model transport was not exercised        |
| Complete live smoke                       | Failed                                      | Approved model could not be resolved; one failed message, no token/tool events                                                       |
| Wrong-profile follow-up                   | Unproven live                               | Not exercised before the smoke failure stopped further testing                                                                       |
| Durable A → published task → B and replay | Not run                                     | No A report or proposal, no B selection or dispatch                                                                                  |
| Cleanup and restored settings             | Passed                                      | Explicit sandbox termination, exit 137, no active sessions/sandboxes; publication false and implementation mode                      |

## Release history and identities

The deployment checkout retained all private configuration. Main merged cleanly; the only manual
integration removed the deployment branch's duplicate OpenRouter catalog entry in favor of main's
entry for the same ID. The first commit-hook attempt lacked Ruff on PATH; frozen dev dependencies
supplied it and all hooks then passed. No hooks were bypassed.

The initial targeted apply failed during the required VNC readiness check in
`packages/sandbox-images/verify/smoke_test.py`, called by `packages/modal-infra/deploy.py:60`. The
error was `VNC readiness timeout`; x11vnc logged repeated
`webSocketsHandshake: unknown connection error`. Only Linear version
`48de60e5-6889-404c-a2a3-a4bf0514f334` deployed on that attempt. Publication remained false,
implementation mode remained selected, and cleanup found no active sessions or sandboxes.
[DIV-78](https://linear.app/divinedesign/issue/DIV-78) retains this intermittent verifier problem.

Mason reported a second VPS memory incident, rebooted the host and explicitly authorized one retry.
The same source and image build hash passed verification without a source fix or verifier bypass. A
fresh plan used Terraform parallelism one, retaining publication off until compatible components
were verified. No D1/DO migration, secret rotation, access expansion or production rollout occurred.
The formerly tainted Modal deployment resource is now ready. Targeted-plan warnings mean this does
not establish zero whole-stack drift.

| Artifact                      | Verified retry / final identity                                    |
| ----------------------------- | ------------------------------------------------------------------ |
| Runtime                       | `v66-investigation-profile`, bubblewrap present; Modal SDK 1.5.5   |
| Image                         | `im-a3GtMwEPvEXh2ykNU8oBmu`                                        |
| Build hash                    | `e503e63dd32d36c68a65798e09559f85eac654d24176d007dc61fc4f863c32df` |
| Modal                         | v4, 2026-09-16 17:39:58 UTC, source label `33a814b`                |
| Control-plane                 | `0c4dbf1a-6392-4f61-b5fd-d2e714ae8b08`                             |
| Linear release                | `74c16835-3e8d-447c-abe0-d844ba974559`                             |
| Linear smoke configuration    | `084b6e0b-58cf-471e-86c2-adcf7f71e735`                             |
| Linear restored configuration | `47281d69-3bce-4ed4-b338-3ce67a31b1b6`, serving 100%               |

The existing backend remains `open-inspect-tfstate-mdumas38-div61-dev`, key
`div61-dev/terraform.tfstate`. Both service health endpoints passed after release. The enabled daily
repository webhook automation was inspected and unchanged; its next scheduled opportunity was
September 17, 13:00 UTC, outside this window. No unrelated jobs were stopped.

## Smoke provenance and failure

| Link                  | Identity                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue / exact prompt  | [DIV-80](https://linear.app/divinedesign/issue/DIV-80), task comment `79b9bac7-9f35-47bd-95ca-a75258a0af46`                                    |
| Native Linear session | `b744d554-4dc2-4566-963f-4288e40813cf`                                                                                                         |
| OpenInspect session   | [24ffab000790089e3a5fae323c622a12](https://open-inspect-web-mdumas38-div61-dev.mason-587.workers.dev/session/24ffab000790089e3a5fae323c622a12) |
| Message               | `59a0c0f7d188a0313a1ed982c14d0450`                                                                                                             |
| Sandbox               | `sb-X2kIYFbxixdsHMwM2TgrOh` / `sandbox-mdumas38-background-agents-1789580531330`                                                               |
| Failure delivery      | Linear comment `1565ea73-d2e7-469b-b9e6-eed3974b8f69`, with session link                                                                       |

The prompt asked for a source-only explanation of successful prompt completion versus Modal sandbox
termination, cited paths, fewer than 2,500 characters, an eight-read/search target, and final marker
`DIV77_SMOKE_COMPLETE`. It prohibited proposals, shell/tests/edits, delegation, credentials, binary
inspection and web tools. It retained the five-minute aim and ten-minute/$0.50 operator thresholds.
The exact prompt is durable in the linked comment and persisted `user_message` event.

Session creation: 17:42:10.504 UTC. Runtime ready: 17:42:28.821. Failed completion: 17:42:30.454,
**19.950 seconds** from creation. Persisted error:

```text
Model not found: openrouter/deepseek/deepseek-v4.1-flash.
Did you mean: deepseek/deepseek-v4-flash, deepseek/deepseek-v4-flash-0731,
deepseek/deepseek-v4-flash-vision-exp?
```

All four events were captured (`hasMore=false`): user message, runtime ready, error and unsuccessful
completion. No token/tool event or successful report exists. The live config selected the intended
model and only OpenRouter; the environment disabled model-catalog fetching. Shared catalog admission
is therefore insufficient to prove pinned-harness model resolution. DIV-81 requires separate review
of a correction; no suggested model was silently substituted and no replacement worker launched.

## Independent boundary evidence and cleanup

An operator probe entered the actual running OpenCode process's user/mount/PID namespaces via
`nsenter`, without changing its mounts or permissions. Opening `AGENTS.md` and `/usr/bin/python3`
for writing, and creating benign root/repository canaries, each failed with errno 30. Disposable
`/scratch` and `/tmp` canaries were written, read and deleted. Git metadata, project extension
folders, `/root` and `/app` were hidden. The environment-name inventory excluded supervisor and SCM
credentials. Values were not printed. The live OpenCode `/config` confirmed the restricted policy.
These were operator checks, not model self-reports or permission to expose shell tools to the model.

The checkout HEAD matched main and `git status --porcelain` was empty at both operator captures.
Both captures occurred after the model-resolution failure; they do not constitute a pre-execution
filesystem hash baseline. There were no model source reads or tool calls to assess.

Inside the namespace, nonallowlisted `https://example.com` and raw-IP `http://1.1.1.1` requests
failed. The first allowlisted health request received an HTTP error, which the probe initially
categorized as not connected; that is not evidence of an egress block. A later supervisor request
using a normal User-Agent returned HTTP 200 over the same Modal network. Model-route connectivity
remains unproven.

The operator explicitly terminated the sandbox at 17:44:11 UTC and confirmed exit **137** and zero
active sandboxes at 17:44:40. D1 confirmed one failed message, no active sessions and
**$0 recorded
session model cost**. The failed smoke consumes one of the campaign's three execution slots even
though it failed before model output. Image/verification/sandbox infrastructure and any classifier
cost are not available in this evidence; the $2
overall target is not established.

The reviewed cleanup apply restored implementation routing at 17:44:56 UTC; publication stayed false
throughout. A/B, callback replay and any further model worker remain stopped under the failure rule.

## VPS reliability and retained evidence

[DIV-79](https://linear.app/divinedesign/issue/DIV-79) is a high-priority Todo for the recurring
Hetzner VPS memory issue; no matching existing task was found. The rebooted host had 3.7 GiB RAM and
no swap. Sixty five-second samples during the retry observed at least 2,780,220 KiB available memory
and no sustained memory-pressure averages. Previous-boot kernel logs were unavailable to this
account; neither a culprit nor a causal link to the remote VNC failure is proven. No host sizing,
swap, permissions or unrelated automation was changed.

Private evidence is under `/home/orca/.local/state/openinspect/div77-20260916/` (first attempt) and
`/home/orca/.local/state/openinspect/div77-retry-20260916/` (authorized retry and smoke). Plans,
state, credentials and raw logs stay private. The deployment checkout and continuation notes are
preserved. DIV-76 and deferred DIV-71/DIV-72 remain unchanged. No additional Greptile review was
requested.
