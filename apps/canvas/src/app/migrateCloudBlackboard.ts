import { parseCharDeskDocumentEnvelope } from "@chardesk/document";
import { cloudWorkspaceApi, CloudWorkspaceRequestError } from "@/domains/account/public";
import { convertBlackboardSource, parseBlackboardSource } from "@/domains/legacy-blackboard/public";

export const migrateCloudBlackboard = async (workId: string) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const source = await cloudWorkspaceApi.readBackup(workId);
    const native = parseCharDeskDocumentEnvelope(source.content);
    if (native?.mode === "freeform" || native?.mode === "slide") return;
    const converted = await convertBlackboardSource({
      workspace: { id: workId, title: source.title, revision: source.revision, createdAt: 0, updatedAt: 0 },
      files: parseBlackboardSource(source.content),
    });
    try {
      await cloudWorkspaceApi.migrate(workId, source.revision, converted.kind, converted.content);
      return;
    } catch (error) {
      if (!(error instanceof CloudWorkspaceRequestError) || error.status !== 409 || attempt > 0) throw error;
    }
  }
};
