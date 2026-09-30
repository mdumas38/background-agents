import { Hono } from "hono";
import { admit } from "../routing/admit";
import type { ControlPlaneHonoEnv } from "../routing/hono-env";
import { sandboxCheckpointRequestSchema } from "@open-inspect/shared/types/sandbox-events";
import { SessionInternalPaths } from "../session/contracts";
import { SCM_AGNOSTIC_USER_OR_SERVICE_ROUTE, requirePermission, error } from "./shared";
import { dispatchSession, type SessionRouteContext } from "./session-route";
import { parseJsonBody } from "./body";
import type { Env } from "../types";

export async function handleSessionCheckpoint(
  request: Request,
  _env: Env,
  params: { id: string },
  ctx: SessionRouteContext
): Promise<Response> {
  const principal = ctx.principal;
  if (
    principal?.kind !== "service" ||
    principal.service !== "linear-bot" ||
    principal.actor?.provider !== "linear"
  )
    return error("A verified Linear actor is required", 403);
  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;
  const parsed = sandboxCheckpointRequestSchema.safeParse(body);
  if (!parsed.success) return error("Invalid checkpoint request", 400);
  return ctx.sessionRuntime.fetch(params.id, SessionInternalPaths.checkpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
}

export const sessionCheckpointRoutes = new Hono<ControlPlaneHonoEnv>();
sessionCheckpointRoutes.get(
  "/sessions/:id/checkpoint",
  admit({
    ...SCM_AGNOSTIC_USER_OR_SERVICE_ROUTE,
    authorization: requirePermission("sessions.read"),
  }),
  (c) =>
    dispatchSession(c, async (_request, _env, params, ctx) =>
      ctx.sessionRuntime.fetch(params.id, SessionInternalPaths.checkpoint)
    )
);
sessionCheckpointRoutes.post(
  "/sessions/:id/checkpoint",
  admit({
    ...SCM_AGNOSTIC_USER_OR_SERVICE_ROUTE,
    authorization: requirePermission("sessions.collaborate"),
  }),
  (c) => dispatchSession(c, handleSessionCheckpoint)
);
