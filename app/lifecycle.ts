import { z } from "zod";
import { CoreEventSchema, CoreResponseSchema, FileEventSchema } from "../protocol/schema";

export const LIFECYCLE_CHANNEL = "swarm:lifecycle";
export const LIFECYCLE_REQUEST_CHANNEL = "swarm:lifecycle-request";
export const CoreStateSchema = z.object({
  generation: z.number().int().nonnegative(),
  phase: z.enum(["starting", "ready", "draining", "unavailable", "failed", "stopped"]),
  message: z.string().max(2_000),
});
export type CoreState = z.infer<typeof CoreStateSchema>;
export const LifecycleSchema = z.object({
  revision: z.number().int().nonnegative(),
  core: CoreStateSchema,
  reload: z.enum(["idle", "pending", "reloading"]),
  notice: z.string().max(2_000),
});
export type Lifecycle = z.infer<typeof LifecycleSchema>;
export const LifecycleRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status") }).strict(),
  z.object({ type: z.literal("reload"), revision: z.number().int().nonnegative() }).strict(),
]);
export const ResponseEnvelopeSchema = z.object({ generation: z.number().int().nonnegative(), response: CoreResponseSchema });
export const EventEnvelopeSchema = z.object({ generation: z.number().int().nonnegative(), event: z.union([CoreEventSchema, FileEventSchema]) });
export const DevUpdateSchema = z.object({
  serial: z.number().int().positive(),
  coreRevision: z.number().int().nonnegative(),
  preloadRevision: z.number().int().nonnegative(),
  action: z.enum(["core", "preload", "core-preload", "restart-required", "build-failed", "unchanged"]),
  message: z.string().max(2_000),
}).strict();
export type DevUpdate = z.infer<typeof DevUpdateSchema>;
export interface LifecycleBridge {
  status(): Promise<Lifecycle>;
  onStatus(listener: (status: Lifecycle) => void): () => void;
  reload(revision: number): Promise<Lifecycle>;
}
