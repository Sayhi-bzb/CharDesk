import type { ActionCompletion, ActionResult } from "./types";

export const actionSucceeded = (reason?: string): ActionResult => ({
  handled: true,
  status: "succeeded",
  reason,
});

export const actionFailed = (reason?: string): ActionResult => ({
  handled: true,
  status: "rejected",
  reason,
});

export const actionUnhandled = (reason?: string): ActionResult => ({
  handled: false,
  status: "unhandled",
  reason,
});

export const actionPending = (completion: Promise<ActionCompletion>): ActionResult => ({
  handled: true,
  status: "pending",
  completion,
});

export const isActionAccepted = (result: ActionResult) =>
  result.status === "succeeded" || result.status === "pending";
