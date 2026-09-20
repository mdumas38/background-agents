# Managed Work

Managed work lets one explicit Linear instruction run as a small recursive tree of coding tasks
instead of one large session. A broad objective is split into small leaf tasks, each leaf is
dispatched to a fresh sandbox, and the parent parks durably while its children run. Nothing here is
deployed by this change; it describes the intended operator-facing behavior of the managed modules
in `packages/linear-bot/src/managed/`.

## Opting in

Managed work is opt-in only. The trigger is the exact command `/manage <objective>` supplied as the
**leading explicit instruction** on a native Linear agent session. An issue description or
`promptContext` alone never opts in. Only managed enrollment is gated this way; ordinary
(non-managed) issue handling is unchanged and still applies as before enrollment.

- Only `implementation` mode and a single `repository` target are accepted. Read-only mode and
  environment targets are rejected.
- The actor must be a non-blank human distinct from the app user.
- The issue title, description, and the explicit instruction text are preserved together as the root
  objective. The required description/instruction is never truncated.
- An objective whose fully built prompt would exceed `MAX_WEB_PROMPT_CHARS` is rejected **before**
  any enrollment or allocation. There is no truncation path.
- The model, actor, repository, and settings are frozen into the run context at enrollment. The
  managed path uses the resolved model; it does not change the actual deployed model configuration.

The command parser lives in `enrollment-input.ts` (`explicitInstruction`).

## Root commands

Once a root is enrolled, inbound events for that root are handled by `root-commands.ts`:

- `/manage status` returns bounded status text; ordinary follow-ups are status-only.
- `/manage stop` (or a native stopped/cancelled signal) stops the run once.
- Status may be read by the **original actor** or by the matching stored native agent session. A
  stop is accepted from the **original actor**, or from the matching native session when no other,
  contradictory actor is present; any other actor receives a safe denial.
- A status reply reports task/attempt counts, stopped flag, reported vs. reserved cost, limits, and
  known session links. It notes when manual reconciliation is required.
- One immutable run exists per root. A new objective needs a new root issue; it cannot reuse the
  existing run. Commands never launch a session, enqueue a prompt, or retry work.

## Recursive decomposition

Every managed task is either a **work** task or, after its children finish, a **review** task.
`tree.ts` assigns deterministic child IDs (`<parent>/<generation>/<key>`) and rewrites sibling
dependency keys to those IDs.

- A split may contain between `MIN_SPLIT_CHILDREN` (1) and `MAX_SPLIT_CHILDREN` (8) children.
  `dependsOn` may reference only siblings in the same split; duplicates, self/missing deps, and
  cycles are rejected.
- A worker that judges its task too large must **split instead of coding**. Any worker may split
  again, so the tree is recursive. The root always splits broad work; it may only size the objective
  in its first turn.
- A running parent that splits becomes `waiting`; the runtime never polls and no live model is
  billed while it waits. A waiting **parent** becomes `ready` in `review` only after all of its
  direct children complete. Siblings become runnable as soon as their declared dependencies
  complete.
- A review attempt integrates and checks the direct children's pushed commits. It never takes over
  as the implementing parent; if corrections are needed it returns another split of small correction
  tasks.
- The root's first turn is sizing-only against an unresolved baseline. The trusted control-plane
  session projection then pins the immutable baseline (`baseline-reader.ts`); descendants receive
  the pinned baseline plus completed dependency and ancestor pushed commits (`launch-request.ts`).

## Final report block

Each worker's final report must end with exactly one top-level fenced JSON block whose info string
is exactly `openinspect-managed-work` (`MANAGED_WORK_FENCE`). Missing, duplicate, unclosed,
malformed, oversized, or schema-invalid blocks are rejected, and a report with no block is invalid.
The three shapes are `split`, `complete`, and `blocked` (`contracts.ts`).

A `complete` outcome needs a bounded `summary` and concrete `evidence`; if code changed it must
include a pushed 40-character lowercase hex `commitSha`. A `blocked` outcome needs a `reason` from
`scope`, `provider`, `budget`, `deadline`, or `unknown`.

Short split example with a sibling dependency:

```openinspect-managed-work
{
  "kind": "split",
  "summary": "Split the objective into small tasks.",
  "children": [
    {
      "key": "parser",
      "title": "Add parser branch",
      "objective": "Implement the parser branch.",
      "acceptance": "Focused parser check passes.",
      "dependsOn": []
    },
    {
      "key": "wiring",
      "title": "Wire parser branch",
      "objective": "Wire the parser branch into the caller.",
      "acceptance": "Focused wiring check passes.",
      "dependsOn": ["parser"]
    }
  ]
}
```

Child keys are short lowercase identifiers; titles, objectives, acceptances, summaries, and evidence
are all length-bounded.

## Limits and accounting

Defaults come from real source constants; reference them rather than restating literals:

| Limit                | Source                                                   | Value     |
| -------------------- | -------------------------------------------------------- | --------- |
| Small leaf target    | `LEAF_TARGET_MS` (`prompts.ts`)                          | 3 minutes |
| Hard worker deadline | `DEFAULT_MANAGED_WORKER_TIMEOUT_MS` (`context-store.ts`) | 600000 ms |
| `maxTasks`           | `DEFAULT_MANAGED_LIMITS` (`context-store.ts`)            | 40        |
| `maxDispatches`      | `DEFAULT_MANAGED_LIMITS`                                 | 60        |
| `maxConcurrent`      | `DEFAULT_MANAGED_LIMITS`                                 | 2         |
| `maxReportedCostUsd` | `DEFAULT_MANAGED_LIMITS`                                 | 5         |
| `maxWorkerCostUsd`   | `DEFAULT_MANAGED_LIMITS`                                 | 0.25      |

The worker deadline is measured from the durable claim and **includes** worker startup. An existing
per-session configured cost cap may lower the effective worker limit.

All nested tasks share one root ledger (`admission.ts`): tasks, dispatches, concurrency, and cost
are inherited across the tree, never multiplied per parent. Reservations are taken **before** any
IO. A worker attempt is settled from trusted control-plane accounting only after processing,
pending, and stop confirmation are clear. Reported model usage and reservations are **not**
invoice-total caps; parent, infrastructure, and unreported usage are excluded. Dispatch counts and
reservations are never refunded by timeout.

## Stop, deadlines, and uncertainty

When the root deadline elapses, the earliest unsettled attempt's deadline triggers `stopManagedRun`:
it stops new admission and requests a stop for each known, unsettled, session-bound attempt exactly
once per phase (`stop.ts`). A stop does **not** refund unknown reservations. Captured launch, issue,
or stop uncertainty fails closed: there is no automatic paid retry.

Blocked children keep their parents waiting, and status reports reconciliation. There is no public
retry or reconciliation API yet. An operator must establish the real remote outcome before modifying
durable records or starting replacement work. Do not "fix" unknown work by deleting the ledger or
clearing a reservation.

## Session identity and creation recovery

Managed creation no longer depends on a surviving HTTP response to know which session it owns:

- The launch driver generates the session UUID and durably binds it **before** calling create, so
  the identity exists locally ahead of any remote IO.
- The control plane accepts `managedSessionId` only from a verified `linear-bot` principal carrying
  a verified Linear actor. It uses that exact UUID; every other caller is rejected if it supplies
  the field.
- A unique `sessions.id` insert in D1 refuses a duplicate **before** any session init, so a repeated
  managed id fails closed rather than initializing an existing session.
- The adapter verifies that the create response carries the requested id.

Because the id is known up front, a lost response or a terminated launch driver no longer loses the
session identity, and stop/deadline handling can address the known id. This is **not** automatic
recovery:

- There is no automatic create or prompt replay, and reservations are not refunded.
- A failure before provider allocation can leave the UUID bound with no remote session behind it. A
  stop that returns 404 in that state is an uncertain outcome; it requires the manual reconciliation
  above rather than an automatic retry.

## Rollout and limitations

- Deploy the updated `shared` and `control-plane` **before** the updated `linear-bot`. An older
  control plane silently ignores the unknown `managedSessionId` field (its schema strips unknown
  keys) and generates a different id; the new linear bot rejects the mismatched response but cannot
  recover that different remote identity from its prebound ledger, so the control plane must accept
  the field first; no deployment is performed by this change.
- Rollout requires matching `shared`, `control-plane`, `linear-bot`, and `sandbox-runtime` code.
  There is no new Durable Object binding or D1 migration.
- The code in this change does **not** claim to be deployed.
- No live paid Jev experiments are required; integration tests use fake external services with a
  real workerd runtime.
- Startup and provider latency mean the 3-minute leaf target is a target, not a guarantee, and
  worker limits may stop a task before it writes a final report. Retain pushed partial work and
  evidence rather than assuming loss.
