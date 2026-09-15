import { afterEach, expect, it } from "vitest";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { resolve } from "node:path";

let runtime: Miniflare | undefined;
afterEach(async () => {
  await runtime?.dispose();
});
it("deduplicates concurrent deliveries using real Durable Object SQLite transactions", async () => {
  const bundle = await build({
    stdin: {
      contents: `export { LinearDispatch } from './dispatch';
export default { fetch(request, env) { return env.DISPATCH.get(env.DISPATCH.idFromName('issue')).fetch(request); } };`,
      resolveDir: resolve("src"),
      sourcefile: "runtime-fixture.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    plugins: [
      {
        name: "fake-external-dispatch",
        setup(builder) {
          builder.onResolve({ filter: /^\.\/webhook-handler$/ }, () => ({
            path: "handler",
            namespace: "fixture",
          }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: `export async function handleAgentSessionEvent(webhook, env) { await env.CONTROL_PLANE.fetch('https://test/session'); }`,
            loader: "js",
          }));
        },
      },
    ],
  });
  let calls = 0;
  let release!: () => void;
  runtime = new Miniflare({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: "2024-09-23",
    durableObjects: { DISPATCH: { className: "LinearDispatch", useSQLite: true } },
    serviceBindings: {
      CONTROL_PLANE: async () => {
        calls++;
        if (calls === 1)
          await new Promise<void>((r) => {
            release = r;
          });
        return Response.json({ ok: true });
      },
    },
  });
  const send = (action: string, deliveryId: string, activityId?: string) =>
    runtime!.dispatchFetch("https://test/event", {
      method: "POST",
      body: JSON.stringify({
        deliveryId,
        traceId: "test",
        webhook: {
          organizationId: "org",
          action,
          agentSession: { id: "linear-session" },
          agentActivity: activityId ? { id: activityId } : undefined,
        },
      }),
    });
  const results = await Promise.all([send("created", "a"), send("created", "b")]);
  expect(await Promise.all(results.map((r) => r.json()))).toContainEqual({
    ok: true,
    skipped: true,
    reason: "duplicate",
  });
  await expect.poll(() => calls).toBe(1);
  expect((await send("prompted", "follow", "activity-1")).status).toBe(503);
  release();
  await expect.poll(async () => (await send("prompted", "follow", "activity-1")).status).toBe(200);
  await expect.poll(() => calls).toBe(2);
  await send("prompted", "another-delivery", "activity-1");
  expect(calls).toBe(2);
}, 30000);
