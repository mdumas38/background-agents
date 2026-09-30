import {
  SESSION_DIFF_VERSION,
  sessionDiffFailureSchema,
  sessionDiffStateSchema,
  sessionDiffUploadSchema,
  storedSessionDiffBundleSchema,
  toSessionDiffManifest,
  type SessionDiffUpload,
  type SessionDiffState,
  type StoredSessionDiffBundle,
} from "@open-inspect/shared/types/session-diffs";
import { z } from "zod";
import type { SqlStorage } from "../sql-storage";
import { DiffFileNotFoundError, DiffRevisionStaleError } from "./errors";

/**
 * Columns that carry the stored patch state. Validated on its own so corrupt
 * refresh metadata can never discard an otherwise readable bundle.
 */
const sessionDiffBundleRowSchema = z.object({
  revision_id: z.string(),
  bundle_json: z.string(),
});

/**
 * Columns that carry the latest refresh failure. Validated on its own so a
 * corrupt bundle can never hide a real failure, and vice versa.
 */
const sessionDiffFailureRowSchema = z.object({
  last_error: z.string(),
  error_at: z.number().int().nonnegative(),
});

/** Persists the single latest session-diff bundle in Durable Object SQLite. */
export class SessionDiffStore {
  constructor(private readonly sql: SqlStorage) {}

  getCheckpointManifest(messageId?: string, requestId?: string) {
    const row = this.readCheckpointRow();
    if (
      !row ||
      (messageId !== undefined && row.message_id !== messageId) ||
      (requestId !== undefined && row.request_id !== requestId)
    )
      return null;
    const bundle = this.parseBundle(row);
    return bundle ? toSessionDiffManifest(bundle) : null;
  }

  checkpointAvailable(messageId: string, requestId: string): boolean {
    const row = this.readCheckpointRow();
    return !row || (row.message_id === messageId && row.request_id === requestId);
  }

  /** A bounded, immutable recovery copy; a subsequent task cannot evict it. */
  pinCheckpoint(bundle: SessionDiffUpload, revisionId: string, requestId: string): string {
    if (!bundle.triggerMessageId) throw new Error("Checkpoint requires message identity");
    if (!this.checkpointAvailable(bundle.triggerMessageId, requestId))
      throw new Error("Checkpoint capacity reached");
    this.sql.exec(
      `INSERT INTO session_checkpoint_diff (singleton, revision_id, message_id, request_id, bundle_json)
       VALUES (1, ?, ?, ?, ?) ON CONFLICT(singleton) DO NOTHING`,
      revisionId,
      bundle.triggerMessageId,
      requestId,
      JSON.stringify(bundle)
    );
    return this.getCheckpointManifest(bundle.triggerMessageId, requestId)!.revisionId;
  }

  private readCheckpointRow(): { message_id: string; request_id: string } | null {
    return (
      (this.sql.exec(`SELECT * FROM session_checkpoint_diff WHERE singleton = 1`).toArray()[0] as {
        message_id: string;
        request_id: string;
      }) ?? null
    );
  }

  /** Atomically replace the current bundle and clear any prior refresh failure. */
  replaceBundle(bundle: SessionDiffUpload, revisionId: string, now: number): void {
    storedSessionDiffBundleSchema.parse({ ...bundle, revisionId });
    this.sql.exec(
      `INSERT INTO session_diff (
         singleton, revision_id, trigger_message_id, bundle_json, captured_at,
         last_error, error_at, updated_at
       ) VALUES (1, ?, ?, ?, ?, NULL, NULL, ?)
       ON CONFLICT(singleton) DO UPDATE SET
         revision_id = excluded.revision_id,
         trigger_message_id = excluded.trigger_message_id,
         bundle_json = excluded.bundle_json,
         captured_at = excluded.captured_at,
         last_error = NULL,
         error_at = NULL,
         updated_at = excluded.updated_at`,
      revisionId,
      bundle.triggerMessageId,
      JSON.stringify(bundle),
      bundle.capturedAt,
      now
    );
  }

  /** Retain the current bundle while recording the latest refresh failure. */
  recordFailure(error: string, now: number): void {
    const failure = sessionDiffFailureSchema.parse({ error });
    this.sql.exec(
      `INSERT INTO session_diff (
         singleton, last_error, error_at, updated_at
       ) VALUES (1, ?, ?, ?)
       ON CONFLICT(singleton) DO UPDATE SET
         last_error = excluded.last_error,
         error_at = excluded.error_at,
         updated_at = excluded.updated_at`,
      failure.error,
      now,
      now
    );
  }

  /** Return the patch-free public manifest and current availability metadata. */
  getPublicState(unavailableReason: string | null): SessionDiffState {
    const row = this.readRow();
    const current = this.parseBundle(row);
    return sessionDiffStateSchema.parse({
      version: SESSION_DIFF_VERSION,
      current: current ? toSessionDiffManifest(current) : null,
      lastError: this.parseFailure(row),
      unavailableReason,
    });
  }

  /**
   * Resolve a renderable patch from the current revision without accepting
   * stale identities. Throws DiffRevisionStaleError or DiffFileNotFoundError.
   */
  resolveFile(revisionId: string, fileId: string): string {
    let bundle = this.parseBundle(this.readRow());
    const currentRevisionId = bundle?.revisionId ?? null;
    if (revisionId !== currentRevisionId) {
      const checkpoint = this.parseBundle(this.readCheckpointRow());
      if (checkpoint?.revisionId === revisionId) bundle = checkpoint;
    }
    if (revisionId !== bundle?.revisionId) {
      throw new DiffRevisionStaleError(currentRevisionId);
    }
    const file = bundle?.repositories
      .flatMap((repository) => repository.files)
      .find((candidate) => candidate.id === fileId);
    if (!file || file.renderState !== "renderable" || !("patch" in file) || !file.patch) {
      throw new DiffFileNotFoundError(currentRevisionId);
    }
    return file.patch;
  }

  private readRow(): unknown {
    return this.sql.exec(`SELECT * FROM session_diff WHERE singleton = 1`).toArray()[0] ?? null;
  }

  private parseBundle(row: unknown): StoredSessionDiffBundle | null {
    const bundleRow = sessionDiffBundleRowSchema.safeParse(row);
    if (!bundleRow.success) return null;
    try {
      const upload = sessionDiffUploadSchema.safeParse(JSON.parse(bundleRow.data.bundle_json));
      if (!upload.success) return null;
      const stored = storedSessionDiffBundleSchema.safeParse({
        revisionId: bundleRow.data.revision_id,
        ...upload.data,
      });
      return stored.success ? stored.data : null;
    } catch {
      return null;
    }
  }

  private parseFailure(row: unknown): SessionDiffState["lastError"] {
    const failureRow = sessionDiffFailureRowSchema.safeParse(row);
    if (!failureRow.success) return null;
    const failure = sessionDiffFailureSchema.safeParse({ error: failureRow.data.last_error });
    if (!failure.success) return null;
    return { message: failure.data.error, occurredAt: failureRow.data.error_at };
  }
}
