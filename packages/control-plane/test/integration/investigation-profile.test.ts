import { beforeEach, expect, it } from "vitest";
import { SessionCoreRepository } from "../../src/session/session-core-repository";
import { cleanD1Tables } from "./cleanup";
import { initSession, waitForSandboxStatus } from "./helpers";
import { runInSessionDO } from "./session-do-access";

beforeEach(cleanD1Tables);

it("persists investigation authority and cannot relax it on repeated initialization", async () => {
  const { stub } = await initSession();
  await waitForSandboxStatus(stub, "failed");
  await runInSessionDO(stub, (_instance, state) => {
    const repository = new SessionCoreRepository(state.storage.sql, (fn) =>
      state.storage.transactionSync(fn)
    );
    const input = {
      id: "profile-test",
      sessionName: "profile-test",
      title: null,
      repoOwner: null,
      repoName: null,
      model: "openrouter/deepseek/deepseek-v4.1-flash",
      status: "created",
      createdAt: 1,
      updatedAt: 1,
    } as const;
    repository.upsertSession({ ...input, executionProfile: "investigation" });
    repository.upsertSession({ ...input, executionProfile: "implementation" });
    const row = state.storage.sql
      .exec<{
        execution_profile: string;
      }>("SELECT execution_profile FROM session WHERE id = ?", input.id)
      .one();
    expect(row.execution_profile).toBe("investigation");
  });
});
