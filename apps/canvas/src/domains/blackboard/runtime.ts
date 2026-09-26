import { compileBlackboardSourceTree } from "@chardesk/blackboard";
import { serializeCharDeskDocumentEnvelope } from "@chardesk/document";
import { parseDocumentSessionSource } from "@/domains/document/public";
import type { CanvasImportSnapshot } from "@/domains/sessions/public";
import type { BlackboardWorkspaceRepository } from "./repository";

export type BlackboardCompilation = Readonly<{
  workspaceId: string;
  revision: number;
  title: string;
  warnings: readonly string[];
  snapshot:
    | Extract<CanvasImportSnapshot, { mode: "freeform" }>
    | Extract<CanvasImportSnapshot, { mode: "slide" }>;
}>;

export class BlackboardRuntime {
  readonly repository: BlackboardWorkspaceRepository;

  constructor(repository: BlackboardWorkspaceRepository) {
    this.repository = repository;
  }

  async compile(workspaceId: string): Promise<BlackboardCompilation> {
    const source = await this.repository.readWorkspace(workspaceId);
    if (!source) throw new Error(`Blackboard workspace not found: ${workspaceId}`);
    const compiled = await compileBlackboardSourceTree(
      source.files.map(({ path, content }) => ({ path, content })),
      source.workspace.title,
    );
    const snapshot = await parseDocumentSessionSource(
      serializeCharDeskDocumentEnvelope({
        mode: compiled.mode,
        title: compiled.title,
        body: compiled.source,
      }),
      { sourceName: "blackboard.chardesk" },
    );
    if (snapshot.mode !== compiled.mode) {
      throw new Error(
        `Blackboard compiler produced ${snapshot.mode} content for ${compiled.mode} mode.`,
      );
    }
    return {
      workspaceId,
      revision: source.workspace.revision,
      title: compiled.title,
      warnings: compiled.warnings.map(({ message }) => message),
      snapshot,
    };
  }
}
