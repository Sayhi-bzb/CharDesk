import { normalizeBlackboardPath } from "@chardesk/blackboard";

export type BlackboardFile = Readonly<{
  path: string;
  content: string;
}>;

export type BlackboardWorkspace = Readonly<{
  id: string;
  title: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}>;

export type BlackboardWorkspaceSnapshot = Readonly<{
  workspace: BlackboardWorkspace;
  files: readonly BlackboardFile[];
}>;

export type BlackboardWorkspaceOperation =
  | { op: "write"; path: string; content: string }
  | { op: "delete"; path: string };

export class BlackboardRevisionConflictError extends Error {
  readonly currentRevision: number;

  constructor(currentRevision: number) {
    super(`Blackboard workspace changed; current revision is ${currentRevision}.`);
    this.name = "BlackboardRevisionConflictError";
    this.currentRevision = currentRevision;
  }
}

export interface BlackboardWorkspaceRepository {
  listWorkspaces(): Promise<readonly BlackboardWorkspace[]>;
  createWorkspace(input?: { id?: string; title?: string }): Promise<BlackboardWorkspaceSnapshot>;
  deleteWorkspace(id: string): Promise<void>;
  readWorkspace(id: string): Promise<BlackboardWorkspaceSnapshot | null>;
  apply(
    id: string,
    operations: readonly BlackboardWorkspaceOperation[],
    baseRevision?: number,
  ): Promise<BlackboardWorkspaceSnapshot>;
  subscribe(listener: (workspaceId: string) => void): () => void;
  close?(): Promise<void> | void;
}

export const normalizeWorkspaceOperations = (
  operations: readonly BlackboardWorkspaceOperation[],
) => operations.map((operation) => ({
  ...operation,
  path: normalizeBlackboardPath(operation.path),
}));

export const createBlackboardStarterFiles = (): readonly BlackboardFile[] => [
  {
    path: "blackboard.yaml",
    content: [
      "chardesk: blackboard/v1",
      "title: Blackboard",
      "panels:",
      "  welcome:",
      "    source: panels/welcome.panel",
      "    summary: Starting point",
      "layout:",
      "  areas:",
      "    - [welcome]",
      "  gap:",
      "    column: 4",
      "    row: 1",
      "",
    ].join("\n"),
  },
  {
    path: "panels/welcome.panel",
    content: "# Blackboard\n\nAsk your agent to edit this workspace.",
  },
];
