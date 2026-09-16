# DIV-81: investigation model resolution

## Root cause

The approved route is valid, but the enforced profile relied on an older OpenCode model snapshot.
OpenInspect's shared catalog and OpenCode's provider registry are independent. A `model` string in
`/config` selects an identifier; it does not register that identifier with the provider.

In pinned OpenCode 1.18.29, [ModelsDev](https://github.com/anomalyco/opencode/blob/v1.18.29/packages/core/src/models-dev.ts)
loads a disk catalog first, then its bundled snapshot. The investigation process gets a fresh
`/scratch/cache`, cannot see the supervisor's cache, and sets `OPENCODE_DISABLE_MODELS_FETCH=true`.
Its allowed network destinations also exclude `models.opencode.ai`. Therefore the bundled snapshot
is the available catalog. It includes the suggested V4 Flash names but lacks
`deepseek/deepseek-v4.1-flash`. [Provider.getModel](https://github.com/anomalyco/opencode/blob/v1.18.29/packages/opencode/src/provider/provider.ts)
indexes the resolved provider's models and raises when the selected key is missing.

The implementation profile inherits the ambient environment/cache and permits normal catalog
refresh. On 2026-09-16, the [current OpenCode catalog](https://models.opencode.ai/api.json) contained
the exact route, with release date 2026-09-10. This explains why implementation success is compatible
with investigation failure. The earlier pilot's actual cache contents were not captured here, so
its precise metadata source remains an inference, not independently established evidence.

The public [OpenRouter model list](https://openrouter.ai/api/v1/models), read without authentication
on 2026-09-16, also lists the exact ID, text/image input, tool support, 1,048,576 context tokens and
384,000 maximum completion tokens. No alias substitution or paid model request is needed to verify
that listing. Listing does not establish account-specific availability or successful inference.

## Correction

`packages/sandbox-runtime/src/sandbox_runtime/investigation.py` supplies a trusted OpenCode model
definition only when the selected model is `deepseek/deepseek-v4.1-flash`. It preserves the selected
ID and inherits the pinned OpenRouter adapter and API URL. Capabilities, limits and estimated costs
come from the public catalogs above. OpenRouter has time-dependent pricing overrides; the catalog
cost fields are estimates, not a billing cap or a guarantee of actual charges.

Catalog fetching remains disabled. Environment construction, deny-by-default tool permissions,
project masking, namespace/mount controls and the Modal network contract are unchanged. Other
model selections retain their existing behavior; this is not automatic registration of arbitrary
user-supplied routes.

## Reproduction and regression

Run the opt-in regression with the pinned Linux binary on a host permitting user namespaces:

```sh
PYTHONPATH=packages/sandbox-runtime/src \
OPENINSPECT_TEST_NAMESPACES=1 \
OPENCODE_TEST_BINARY=/path/to/opencode \
python -m pytest packages/sandbox-runtime/tests/test_investigation.py -q
```

The regression runs the exact `investigation_environment` and filesystem mounts with a dummy key,
read-only pinned binary and an additional `--unshare-net` restriction. Every invocation receives
fresh scratch/cache filesystems. A hostile project config and extension directory are masked.

Without the new definition, `opencode models openrouter` lacks the selected route, and a CLI prompt
fails at `SessionPrompt.getModel` with the same missing-model error and suggestions as DIV-80.
With the definition, `opencode models openrouter --verbose` resolves the exact API model ID,
`@openrouter/ai-sdk-provider` adapter, `https://openrouter.ai/api/v1` endpoint, limits and tool
capability. This checks the actual pinned harness registry that `getModel` indexes, rather than
OpenInspect's shared catalog or the unvalidated `/config` selector. Resolved config retains only
OpenRouter, no plugins/MCP and denied default permissions; the resolved build agent enables only
read/glob/grep. The existing actual filesystem denial probe also runs.

Validation on 2026-09-16: **13 passed in 22.25 seconds**, including both opt-in namespace
tests; focused Ruff lint/format checks and `git diff --check` passed. No broad build or test suite
was run on the memory-constrained host.

Binary provenance: npm `opencode-linux-x64@1.18.29`, registry tarball SHA-512 integrity verified;
`opencode --version` returned `1.18.29`. Binary SHA-256:
`ca6c0e1f42be3120595bf6848937e7586ec862c87fa7aa111e89c7cc6e9a4650`.

No real secret, paid model call, Modal probe, image build or live worker was used. An attempted
local HTTP/noReply attachment probe timed out on health after the isolated server logged that it
was listening; that path is not counted as passed. A separate corrected CLI prompt reached the
offline timeout rather than completing, and is likewise not claimed as an inference success.
The committed positive regression deliberately stops at resolved registry/config/tool evidence.

## Release and remaining gates

This is a source correction for review, not a release. The deployed generation-66 image remains
unchanged. The coordinator must choose the next runtime/image identity, incorporate the reviewed
fix, rebuild through the documented Modal image entrypoint, and deploy before expecting live
investigation behavior to change. No control-plane catalog change is required.

A separately authorized bounded smoke must still establish the complete deployed launch,
provider acceptance, token/tool events, useful report delivery and explicit sandbox termination.
The local registry result does not authorize resuming DIV-77, changing live flags or launching a
replacement worker. Integration/deployment and resumption remain with the coordinator and human.
