import type { CollaborationIntegrityIssue } from "@/domains/collaboration/public";
import { rebuildContentSurface } from "./helpers/gridHelpers";
import type { EditorState } from "./interfaces";
import type { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";
import type { CanvasStateCommitCoordinator } from "./CanvasStateCommitCoordinator";

const projectObservedSurface = (
  contentSurface: EditorState["contentSurface"]
) => {
  return {
    contentSurface,
  };
};

/** Projects active Yjs document changes into the editor's derived Zustand state. */
export const subscribeCanvasDocumentProjection = (
  documents: CanvasDocumentRegistry,
  reportIntegrityIssues: (issues: CollaborationIntegrityIssue[]) => void,
  commits: CanvasStateCommitCoordinator
) => {
  const reportCurrentIntegrityIssues = () =>
    reportIntegrityIssues(documents.getIntegrityIssues());

  const unsubscribe = documents.observeActiveTransactions((transaction) => {
    if (!transaction.contentChanged) return;
    commits.setState(projectObservedSurface(rebuildContentSurface(documents)));
    commits.deferUntilCommitted(reportCurrentIntegrityIssues);
  });

  return unsubscribe;
};
