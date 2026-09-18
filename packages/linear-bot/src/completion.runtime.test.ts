import { afterEach, expect, it } from "vitest";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

let runtime: Miniflare | undefined;
let persistence: string | undefined;
afterEach(async () => {
  await runtime?.dispose();
  runtime = undefined;
  if (persistence) await rm(persistence, { recursive: true, force: true });
});
it("recovers a persisted completion via a real alarm after runtime restart with the same UUID and body", async () => {
  const bundle = await build({
    stdin: {
      contents: `import { LinearDispatch } from './dispatch';
export class TestDispatch extends LinearDispatch {
  constructor(state, env) { super(state, env); this.storage = state.storage; }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/__record') return Response.json({ ...await this.storage.get('completion:["session","message"]'), alarm: await this.storage.getAlarm() });
    if (path === '/__wake') { await this.storage.setAlarm(Date.now() + 50); return Response.json({ armed: true }); }
    return super.fetch(request);
  }
}
export default { fetch(request, env) { return env.DISPATCH.get(env.DISPATCH.idFromName('issue')).fetch(request); } };`,
      resolveDir: fileURLToPath(new URL(".", import.meta.url)),
      sourcefile: "completion-runtime-fixture.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    external: ["cloudflare:*", "node:*"],
  });
  persistence = await mkdtemp(join(tmpdir(), "linear-completion-runtime-"));
  let unavailable = true;
  let readbacks = 0;
  const writes: Array<{ id: string; body: string; issueId: string }> = [];
  const provider = new Map<string, { id: string; body: string; issue: { id: string } }>();
  const start = () =>
    new Miniflare({
      name: "completion-runtime-test",
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2024-09-23",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: { DISPATCH: { className: "TestDispatch", useSQLite: true } },
      durableObjectsPersist: persistence,
      bindings: {
        LINEAR_API_KEY: "fake-test-key",
        SERVICE_AUTH_SECRET: "fake-service-secret",
        WEB_APP_URL: "https://web.test",
      },
      serviceBindings: {
        CONTROL_PLANE: async (request: { url: string }) => {
          if (new URL(request.url).pathname.endsWith("/artifacts"))
            return Response.json({ artifacts: [] });
          return Response.json({
            events: [
              {
                id: "token",
                type: "token",
                messageId: "message",
                createdAt: 1,
                data: {
                  content: unavailable
                    ? "Original report"
                    : "Later report must not replace frozen content",
                },
              },
              {
                id: "complete",
                type: "execution_complete",
                messageId: "message",
                createdAt: 2,
                data: { success: true },
              },
            ],
            hasMore: false,
          });
        },
      },
      outboundService: async (request: { url: string; json(): Promise<unknown> }) => {
        expect(request.url).toBe("https://api.linear.app/graphql");
        const { query, variables } = (await request.json()) as {
          query: string;
          variables: { input: { id: string; body: string; issueId: string }; id: string };
        };
        if (query.includes("mutation")) {
          const input = variables.input;
          writes.push(input);
          if (!provider.has(input.id))
            provider.set(input.id, {
              id: input.id,
              body: input.body,
              issue: { id: input.issueId },
            });
          // Provider committed, but neither the create response nor readback is available.
          if (unavailable) return new Response(null, { status: 503 });
          return Response.json({ errors: [{ message: "ID already exists" }] });
        }
        readbacks++;
        return unavailable
          ? new Response(null, { status: 503 })
          : Response.json({ data: { comment: provider.get(variables.id) } });
      },
    });
  runtime = start();
  const record = async () =>
    (await (await runtime!.dispatchFetch("https://test/__record")).json()) as {
      status: string;
      deliveryId: string;
      content?: { body: string };
      delivered?: boolean;
      attempts: number;
      alarm: number | null;
    };
  const response = await runtime.dispatchFetch("https://test/complete", {
    method: "POST",
    body: JSON.stringify({
      traceId: "test",
      payload: {
        sessionId: "session",
        messageId: "message",
        success: true,
        timestamp: 1,
        signature: "internal-fixture",
        context: {
          source: "linear",
          issueId: "issue",
          issueIdentifier: "DIV-1",
          issueUrl: "https://linear.app/issue/1",
          model: "model",
        },
      },
    }),
  });
  expect(response.status).toBe(200);
  await expect.poll(() => readbacks).toBe(1);
  const before = await record();
  expect(before.status).toBe("pending");
  expect(before.alarm).toBeGreaterThan(Date.now());
  expect(before.content?.body).toContain("Original report");
  await runtime.dispose();
  runtime = undefined;
  unavailable = false;
  runtime = start();
  const restored = await record();
  expect(restored.deliveryId).toBe(before.deliveryId);
  expect(restored.alarm).toBe(before.alarm);
  expect(restored.content).toEqual(before.content);
  // Expedite the stored alarm through the platform API, never call alarm()/flush() directly.
  await runtime.dispatchFetch("https://test/__wake");
  await expect.poll(async () => (await record()).status, { timeout: 20_000 }).toBe("done");
  expect((await record()).delivered).toBe(true);
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
  expect(writes[1].id).toBe(before.deliveryId);
  expect(provider.size).toBe(1);
}, 60_000);
