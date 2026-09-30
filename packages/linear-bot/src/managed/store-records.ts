import type { ManagedRun } from "./run-state";

/** Largest JSON-serialized managed record the durable store will accept. */
export const MAX_MANAGED_RECORD_BYTES = 120 * 1024;

const encoder = new TextEncoder();

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertBounded(record: unknown): void {
  const size = encoder.encode(JSON.stringify(record)).byteLength;
  if (size > MAX_MANAGED_RECORD_BYTES) {
    throw new Error(`Managed record of ${size} bytes exceeds ${MAX_MANAGED_RECORD_BYTES}.`);
  }
}

/**
 * Encode one immutable root run as bounded durable records. Metadata lives under `managed:run`;
 * each task and attempt is stored separately under a SHA-256 of its raw id so keys stay bounded
 * even as ids grow. Values are plain JSON and round-trip exactly; no storage or decoding happens
 * here.
 */
export async function encodeRunRecords(run: ManagedRun): Promise<Record<string, unknown>> {
  const records: Record<string, unknown> = {
    "managed:run": { id: run.id, admission: run.admission },
  };

  await Promise.all(
    Object.entries(run.tree.tasks).map(async ([taskId, task]) => {
      records[`managed:task:${await sha256Hex(taskId)}`] = {
        runId: run.id,
        id: taskId,
        value: task,
      };
    })
  );

  await Promise.all(
    Object.entries(run.attempts).map(async ([attemptId, attempt]) => {
      records[`managed:attempt:${await sha256Hex(attemptId)}`] = {
        runId: run.id,
        id: attemptId,
        value: attempt,
      };
    })
  );

  for (const record of Object.values(records)) assertBounded(record);
  return records;
}
