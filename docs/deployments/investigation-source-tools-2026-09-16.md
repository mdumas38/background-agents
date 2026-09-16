# DIV-85: investigation source tools

The deployed smoke reached inference, but all eight persisted read/glob/grep calls failed.
This repair restores the allowed tools without enabling shell, writes, delegation or web tools.
It does not deploy a runtime or authorize another live smoke.

## Causes and reproduction

Pinned OpenCode 1.18.29's [read tool](https://github.com/anomalyco/opencode/blob/v1.18.29/packages/opencode/src/tool/read.ts)
asks permission for `path.relative(instance.worktree, filepath)`. With Git metadata masked, its
non-Git worktree is `/`, so `/workspace/background-agents/package.json` becomes
`workspace/background-agents/package.json`. The old `/workspace/**` rule never matches.
The original config denies a real source read in the offline namespace; the corrected relative
`workspace/**` pattern permits it. The separate `external_directory: deny` gate remains active.

The pinned [ripgrep loader](https://github.com/anomalyco/opencode/blob/v1.18.29/packages/core/src/ripgrep/binary.ts)
looks on PATH, then in its data directory, then downloads a release from GitHub. The image recipe
did not install ripgrep, and investigation starts with fresh scratch/data/cache directories.
The captured deployed log confirms it attempted a ripgrep download. The offline reproduction
likewise logs that download and returns `ripgrep execution failed`; mounting an existing ripgrep
binary read-only on the unchanged restricted PATH makes search succeed with networking disabled.
The deployed log does not include the nested transport exception, so the precise failed HTTP hop
is not established. Allowing download destinations is unnecessary: search requires a baked local
binary, not runtime network expansion.

A third issue becomes reachable when reads work: OpenCode's Linux external-directory check is
lexical. A source symlink to `/etc/hosts` successfully read that outside file with the corrected
read rule alone. The repair therefore rejects unsafe symlinks before constructing the namespace.
External, dangling, cyclic and directory links fail closed. Directory links are rejected even
when their target is internal, because an alias followed by `/..` can defeat lexical containment.
Internal regular-file links such as `CLAUDE.md -> AGENTS.md` remain supported. The checkout is
never rewritten to hide this admission failure.

## Changes

- Match source read requests in the coordinate system used by the pinned harness.
- Install Debian's `ripgrep` package in the image and require `/usr/bin/rg --version` in the
  existing image verifier. Runtime startup also rejects a missing/non-executable `/usr/bin/rg`.
- Validate source symlinks before mounting the immutable checkout.
- Execute allowed and forbidden tools through pinned `debug agent build --tool ... --params ...`.
  This command dispatches the real tool and evaluates its permission requests without inference.
  The test sets an explicit valid `--chdir`, so it avoids the old operator probe's deleted-cwd
  failure. Disabled/missing-tool or permission errors are required; arbitrary command failures
  cannot satisfy the negative assertions.

Trusted model registration, model ID, minimal environment, credential separation, namespace
controls and provider network rules are unchanged. No dependency is installed into the source
checkout or at investigation startup, and there is no unrestricted fallback.

## Validation

Run on a host allowing user namespaces, with the pinned OpenCode binary and a local ripgrep:

```sh
PYTHONPATH=packages/sandbox-runtime/src \
PYTHONDONTWRITEBYTECODE=1 \
OPENINSPECT_TEST_NAMESPACES=1 \
OPENCODE_TEST_BINARY=/path/to/opencode \
RIPGREP_TEST_BINARY=/path/to/rg \
python -m pytest packages/sandbox-runtime/tests/test_investigation.py -q
```

The source-tool fixture maps a temporary checkout to `/workspace/background-agents` and supplies
only the test binaries via read-only mounts. It retains production masks, permissions and
environment, uses a dummy OpenRouter key, and adds `--unshare-net`. Every tool gets fresh scratch
filesystems. Positive assertions cover absolute/relative file reads, directory reads, internal
file links, matching glob/grep and empty results. Negative assertions cover absolute/traversal
outside reads, outside searches, shell, edit/write, native delegation, web and skills. Separate
admission and real namespace tests check unsafe links, stripped credentials, hidden Git/config/
extensions, read-only source/binaries/root, and writable scratch.

Binary provenance is the same verified npm `opencode-linux-x64@1.18.29` artifact used for DIV-81,
reused read-only; version is asserted by the tests. SHA-256:
`ca6c0e1f42be3120595bf6848937e7586ec862c87fa7aa111e89c7cc6e9a4650`.

Validation on 2026-09-16: **40 focused investigation cases passed**, plus **17 image-verifier
unit tests**. On this host, the investigation file was split into the following `-k` selections
using the command above with `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1` and `-p pytest_asyncio.plugin`:

- `not pinned` (19 admission/environment/filesystem cases)
- `allowed and glob` and `allowed and grep` (two cases each)
- `allowed and read and params0` through `params3` (one case per invocation)
- `forbidden and read` (three outside-read cases)
- `forbidden and glob`, `grep`, `bash`, `edit`, `write`, `task`, `webfetch`, `websearch`, `skill`
  (each tool in its own invocation with the `forbidden and` prefix)
- `source_tool_registry` (one case)

The image command was `python -m pytest packages/sandbox-images/tests/test_verification.py -q`.
Normal repository conftest fixtures remained active in the final runs. The coordinator approved a
monitored exception for serial focused diagnostics using existing dependencies: at most 512 MiB
summed process-tree PSS, with a hard stop below 1 GiB MemAvailable. Completed final runs peaked at
370,045 KiB PSS (382,224 KiB aggregate RSS); minimum available memory was 1,215,064 KiB.

Earlier larger batches were stopped by the resource monitor and are not counted as completed runs.
The unchanged `test_pinned_model_lookup_inside_offline_boundary` was not completed under this
memory envelope; its model registration code is unchanged. Optional Modal policy tests could not
collect in the reused Python 3.12 environment (Modal SDK absent); the preserved deployment venv
has no pytest and was not modified. Provider networking code is unchanged.

No full repository build/install, image build, provider request or paid inference was performed.

## Release checklist

1. Review and merge the source repair through the normal approval process.
2. Rebuild using the documented Modal image entrypoint. Content-based build invalidation includes
   these changed runtime/image files; no arbitrary cache-buster or version bump is required.
   Record the resulting runtime/build hash and verified image identity. The existing verifier must
   pass, including the baked ripgrep check; do not reuse the old image.
3. Deploy the reviewed runtime with its verified image and confirm the exact source/image identity.
4. Under separate authorization, run a bounded dev smoke that actually reads/searches source,
   checks the forbidden operations and credential/filesystem/network controls, delivers useful
   source citations, records spend, and explicitly terminates the sandbox.
5. Only then consider DIV-77's useful-investigation gate satisfied. Offline debug dispatch establishes
   tool behavior, not end-to-end model orchestration or live deployment success.
