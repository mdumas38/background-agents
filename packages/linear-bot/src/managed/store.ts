import type { AdmissionState } from "./admission";
import type { ManagedAttempt, ManagedRun } from "./run-state";
import { encodeRunRecords } from "./store-records";
import type { Task } from "./tree";

/**
 * Minimal structural view of DurableObjectStorage / transaction storage. The caller owns the
 * transaction; this module performs no scheduling, concurrency, or network IO beyond these calls.
 */
export interface ManagedRunStorage {
  get<T>(key: string): Promise<T | undefined>;
  list<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
  put(entries: Record<string, unknown>): Promise<void>;
}

interface RunMetaRecord {
  id: string;
  admission: AdmissionState;
}

interface ShardRecord<T> {
  runId: string;
  id: string;
  value: T;
}

function readShards<T>(metaId: string, records: Map<string, ShardRecord<T>>): Record<string, T> {
  const shards: Record<string, T> = Object.create(null);
  for (const record of records.values()) {
    if (record.runId !== metaId) {
      throw new Error(`Managed record ${record.id} belongs to run ${record.runId}, not ${metaId}.`);
    }
    shards[record.id] = record.value;
  }
  return shards;
}

/**
 * Rebuild one immutable root run from its durable records. Returns undefined only when no metadata
 * and no shards exist; partial state (shards without metadata) is rejected.
 */
export async function loadRun(storage: ManagedRunStorage): Promise<ManagedRun | undefined> {
  const [meta, taskRecords, attemptRecords] = await Promise.all([
    storage.get<RunMetaRecord>("managed:run"),
    storage.list<ShardRecord<Task>>({ prefix: "managed:task:" }),
    storage.list<ShardRecord<ManagedAttempt>>({ prefix: "managed:attempt:" }),
  ]);

  if (!meta) {
    if (taskRecords.size > 0 || attemptRecords.size > 0) {
      throw new Error("Managed run records exist without metadata.");
    }
    return undefined;
  }

  return {
    id: meta.id,
    admission: meta.admission,
    tree: { tasks: readShards(meta.id, taskRecords) },
    attempts: readShards(meta.id, attemptRecords),
  };
}

/**
 * Persist one immutable root run. Encoding performs all size checks before any write, and existing
 * metadata for a different run is refused so a run is never silently overwritten.
 */
export async function saveRun(storage: ManagedRunStorage, run: ManagedRun): Promise<void> {
  const records = await encodeRunRecords(run);
  const existing = await storage.get<RunMetaRecord>("managed:run");
  if (existing && existing.id !== run.id) {
    throw new Error(`Managed run ${existing.id} is already stored; refusing to save ${run.id}.`);
  }
  await storage.put(records);
}
