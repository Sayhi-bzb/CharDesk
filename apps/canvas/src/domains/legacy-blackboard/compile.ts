import { serializeCharDeskDocumentEnvelope } from "@chardesk/document";
import type { BlackboardWorkspaceSnapshot } from "./repository";

export const convertBlackboardSource = async (source: BlackboardWorkspaceSnapshot) => {
  const { compileBlackboardSourceTree } = await import("@chardesk/legacy-blackboard");
  const compiled = await compileBlackboardSourceTree(source.files, source.workspace.title);
  return {
    kind: compiled.mode === "slide" ? "slides" as const : "canvas" as const,
    content: serializeCharDeskDocumentEnvelope({ mode: compiled.mode, title: compiled.title, body: compiled.source }),
  };
};
