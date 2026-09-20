import { afterEach, it } from "vitest";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { exerciseManagedWorkflow, type FixtureState } from "./__fixtures__/runtime-sequence";

const adapterPath = fileURLToPath(new URL("./__fixtures__/runtime-adapters.ts", import.meta.url));
const managedDir = fileURLToPath(new URL(".", import.meta.url));
const EXTERNAL_ADAPTERS = new Set([
  "./session-create",
  "./prompt-enqueue",
  "./issue-create",
  "./result-reader",
  "./baseline-reader",
]);

let runtime: Miniflare | undefined;
let persistence: string | undefined;

afterEach(async () => {
  await runtime?.dispose();
  runtime = undefined;
  if (persistence) await rm(persistence, { recursive: true, force: true });
  persistence = undefined;
});

it("runs the managed split/restart scenario in Workerd", async () => {
  const bundle = await build({
    stdin: {
      contents: `export { ManagedFixture } from './__fixtures__/runtime-harness';\nexport { default } from './__fixtures__/runtime-harness';`,
      resolveDir: managedDir,
      sourcefile: "managed-workflow-runtime-fixture.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    conditions: ["workerd"],
    target: "es2022",
    external: ["cloudflare:*", "node:*"],
    plugins: [
      {
        name: "managed-runtime-adapters",
        setup(build) {
          build.onResolve(
            {
              filter:
                /^\.\/(session-create|prompt-enqueue|issue-create|result-reader|baseline-reader)$/,
            },
            (args) => {
              if (!EXTERNAL_ADAPTERS.has(args.path)) return null;
              if (!args.importer.includes("/src/managed/")) return null;
              return { path: adapterPath };
            }
          );
        },
      },
    ],
  });

  persistence = await mkdtemp(join(tmpdir(), "managed-workflow-runtime-"));
  const start = () =>
    new Miniflare({
      name: "managed-workflow-test",
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2024-09-23",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: { FIXTURE: { className: "ManagedFixture", useSQLite: true } },
      durableObjectsPersist: persistence,
      bindings: { WEB_APP_URL: "https://web.test" },
    });

  runtime = start();

  const call = async (path: string, body?: unknown): Promise<FixtureState> => {
    const response = await runtime!.dispatchFetch(`https://test${path}`, {
      method: body === undefined ? "GET" : "POST",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      throw new Error(`${path} → ${response.status}: ${await response.text()}`);
    }
    return (await response.json()) as FixtureState;
  };

  const restart = async () => {
    await runtime!.dispose();
    runtime = start();
  };

  await exerciseManagedWorkflow(call, restart);
}, 60_000);
