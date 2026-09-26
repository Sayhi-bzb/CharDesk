import {
  analyzeBlackboardSourceTree,
  BLACKBOARD_SOURCE_ENTRYPOINT,
  compileBlackboardSourceTree,
  normalizeBlackboardPath,
  type BlackboardSourceGraph,
} from "@chardesk/blackboard";
import {
  BlackboardRevisionConflictError,
  type BlackboardRuntime,
  type BlackboardWorkspaceOperation,
  type BlackboardWorkspaceSnapshot,
} from "@/domains/blackboard/public";
import type { AgentToolDefinition } from "./contracts";
import type { BlackboardWorkspaceTarget } from "../blackboardWorkspaceTarget";

type BlackboardAgentToolDependencies = Readonly<{
  blackboard: BlackboardRuntime;
  workspaceTarget: BlackboardWorkspaceTarget;
}>;

export const BLACKBOARD_AGENT_TOOL_NAMES = {
  listWorkspaces: "chardesk_blackboard_list_workspaces",
  createWorkspace: "chardesk_blackboard_create_workspace",
  openWorkspace: "chardesk_blackboard_open_workspace",
  listFiles: "chardesk_blackboard_list_files",
  readFile: "chardesk_blackboard_read_file",
  writeFile: "chardesk_blackboard_write_file",
  applyPatch: "chardesk_blackboard_apply_patch",
  deleteFile: "chardesk_blackboard_delete_file",
  check: "chardesk_blackboard_check",
} as const;

const workspaceNotFound = (workspaceId: string) => ({
  ok: false as const,
  code: "workspace_not_found" as const,
  workspaceId,
  message: `Blackboard workspace not found: ${workspaceId}`,
});

const workspaceNotFoundOutputSchema = {
  type: "object",
  properties: {
    ok: { const: false },
    code: { const: "workspace_not_found" },
    workspaceId: { type: "string" },
    message: { type: "string" },
  },
  required: ["ok", "code", "workspaceId", "message"],
  additionalProperties: false,
} as const;

const workspaceNotActive = () => ({
  ok: false as const,
  code: "workspace_not_active" as const,
  message: "Create or open a Blackboard workspace first.",
});

const workspaceNotActiveOutputSchema = {
  type: "object",
  properties: {
    ok: { const: false },
    code: { const: "workspace_not_active" },
    message: { type: "string" },
  },
  required: ["ok", "code", "message"],
  additionalProperties: false,
} as const;

const sourceGraphSchema = {
  type: "object",
  properties: {
    entrypoint: {
      const: BLACKBOARD_SOURCE_ENTRYPOINT,
      description: "Manifest that owns the Blackboard panel and layout graph.",
    },
    visibleFiles: {
      type: "array",
      items: { type: "string" },
      description: "Panel sources currently composed into the Canvas.",
    },
    draftFiles: {
      type: "array",
      items: { type: "string" },
      description: "Registered panel sources not currently placed in layout.areas or layout.pages.",
    },
    unreferencedFiles: {
      type: "array",
      items: { type: "string" },
      description: "Stored files not registered by blackboard.yaml and therefore not visible.",
    },
  },
  required: ["entrypoint", "visibleFiles", "draftFiles", "unreferencedFiles"],
  additionalProperties: false,
} as const;

const nullableSourceGraphSchema = {
  oneOf: [{ type: "null" }, sourceGraphSchema],
} as const;

const mutationOutputSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        ok: { const: true },
        workspaceId: { type: "string" },
        revision: { type: "integer", minimum: 0 },
        changed: { type: "array", items: { type: "string" } },
        entrypoint: { const: BLACKBOARD_SOURCE_ENTRYPOINT },
        projectionStatus: {
          enum: ["updated", "unchanged", "invalid"],
          description: "Effect of the persisted mutation on the compiled Canvas projection.",
        },
        projectionChanged: {
          type: "boolean",
          description: "True only when the valid visible Canvas projection changed.",
        },
        sourceGraph: nullableSourceGraphSchema,
        warnings: {
          type: "array",
          items: { type: "string" },
          description: "Actionable projection and source-routing diagnostics.",
        },
      },
      required: [
        "ok",
        "workspaceId",
        "revision",
        "changed",
        "entrypoint",
        "projectionStatus",
        "projectionChanged",
        "sourceGraph",
        "warnings",
      ],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        ok: { const: false },
        code: { const: "revision_conflict" },
        currentRevision: { type: "integer", minimum: 0 },
      },
      required: ["ok", "code", "currentRevision"],
      additionalProperties: false,
    },
    workspaceNotFoundOutputSchema,
    workspaceNotActiveOutputSchema,
  ],
} as const;

const withWorkspaceErrors = (success: Readonly<Record<string, unknown>>) => ({
  oneOf: [success, workspaceNotFoundOutputSchema, workspaceNotActiveOutputSchema],
});

const workspaceInputProperty = {
  workspaceId: {
    type: "string",
    minLength: 1,
    description:
      "Optional explicit target returned by list_workspaces or create_workspace. Omit it to use the active Blackboard visible in this page.",
  },
} as const;

type ProjectionInspection = Readonly<{
  valid: boolean;
  signature?: string;
  title?: string;
  sourceGraph: BlackboardSourceGraph | null;
  warnings: readonly string[];
}>;

const unreferencedWarnings = (sourceGraph: BlackboardSourceGraph) =>
  sourceGraph.unreferencedFiles.map((path) =>
    `${path} is stored but not referenced by ${sourceGraph.entrypoint}, so it is not visible on the Canvas.`
  );

const inspectProjection = async (
  source: BlackboardWorkspaceSnapshot,
): Promise<ProjectionInspection> => {
  let sourceGraph: BlackboardSourceGraph | null = null;
  try {
    sourceGraph = analyzeBlackboardSourceTree(source.files);
    const compiled = await compileBlackboardSourceTree(source.files, source.workspace.title);
    return {
      valid: true,
      signature: JSON.stringify([compiled.title, compiled.source]),
      title: compiled.title,
      sourceGraph,
      warnings: [
        ...compiled.warnings.map(({ message }) => message),
        ...unreferencedWarnings(sourceGraph),
      ],
    };
  } catch (error) {
    return {
      valid: false,
      sourceGraph,
      warnings: [
        `Canvas projection is invalid: ${
          error instanceof Error ? error.message : "Unknown Blackboard error."
        } The last valid Canvas remains visible.`,
      ],
    };
  }
};

const requireString = (input: Record<string, unknown>, key: string) => {
  const value = input[key];
  if (typeof value !== "string") throw new Error(`${key} must be a string.`);
  return value;
};

const requirePath = (input: Record<string, unknown>) =>
  normalizeBlackboardPath(requireString(input, "path"));

const optionalRevision = (input: Record<string, unknown>) => {
  const value = input.baseRevision;
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("baseRevision must be a non-negative integer.");
  }
  return value;
};

const optionalWorkspaceId = (input: Record<string, unknown>) => {
  const value = input.workspaceId;
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error("workspaceId must be a string.");
  if (!value.trim()) throw new Error("workspaceId must be a non-empty string.");
  return value.trim();
};

const requireWorkspaceId = (input: Record<string, unknown>) => {
  const workspaceId = optionalWorkspaceId(input);
  if (!workspaceId) throw new Error("workspaceId must be a string.");
  return workspaceId;
};

const optionalTitle = (input: Record<string, unknown>) => {
  const value = input.title;
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("title must be a non-empty string.");
  }
  return value.trim();
};

const workspaceUrl = (workspaceId: string) =>
  `/blackboard?workspace=${encodeURIComponent(workspaceId)}`;

type SelectedWorkspace = Readonly<{
  workspaceId: string;
  source: BlackboardWorkspaceSnapshot;
}>;

const isSelectedWorkspace = (
  value:
    | SelectedWorkspace
    | ReturnType<typeof workspaceNotFound>
    | ReturnType<typeof workspaceNotActive>,
): value is SelectedWorkspace => "source" in value;

export const createBlackboardAgentTools = ({
  blackboard,
  workspaceTarget,
}: BlackboardAgentToolDependencies): readonly AgentToolDefinition[] => {
  const selected = async (input: Record<string, unknown>): Promise<
    SelectedWorkspace | ReturnType<typeof workspaceNotFound> | ReturnType<typeof workspaceNotActive>
  > => {
    const workspaceId = optionalWorkspaceId(input) ?? workspaceTarget.getActiveWorkspaceId();
    if (!workspaceId) return workspaceNotActive();
    const source = await blackboard.repository.readWorkspace(workspaceId);
    if (!source) return workspaceNotFound(workspaceId);
    return { workspaceId, source };
  };

  const apply = async (
    current: SelectedWorkspace,
    operations: readonly BlackboardWorkspaceOperation[],
    baseRevision?: number,
  ) => {
    try {
      const before = await inspectProjection(current.source);
      const next = await blackboard.repository.apply(
        current.workspaceId,
        operations,
        baseRevision,
      );
      const after = await inspectProjection(next);
      const projectionStatus = !after.valid
        ? "invalid"
        : before.valid && before.signature === after.signature
        ? "unchanged"
        : "updated";
      return {
        ok: true,
        workspaceId: current.workspaceId,
        revision: next.workspace.revision,
        changed: operations.map(({ path }) => path),
        entrypoint: BLACKBOARD_SOURCE_ENTRYPOINT,
        projectionStatus,
        projectionChanged: projectionStatus === "updated",
        sourceGraph: after.sourceGraph,
        warnings: after.warnings,
      };
    } catch (error) {
      if (error instanceof BlackboardRevisionConflictError) {
        return {
          ok: false,
          code: "revision_conflict",
          currentRevision: error.currentRevision,
        };
      }
      throw error;
    }
  };

  return [
    {
      name: BLACKBOARD_AGENT_TOOL_NAMES.listWorkspaces,
      title: "List workspaces",
      description:
        "List CharDesk Blackboard workspaces stored in this browser origin and identify the one active in this page. Call open_workspace to show an existing workspace.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      outputSchema: {
        type: "object",
        properties: {
          workspaces: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                revision: { type: "integer", minimum: 0 },
                createdAt: { type: "integer", minimum: 0 },
                updatedAt: { type: "integer", minimum: 0 },
                url: { type: "string" },
                active: { type: "boolean" },
              },
              required: [
                "id",
                "title",
                "revision",
                "createdAt",
                "updatedAt",
                "url",
                "active",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["workspaces"],
        additionalProperties: false,
      },
      readOnly: true,
      execute: async () => {
        const activeWorkspaceId = workspaceTarget.getActiveWorkspaceId();
        return {
          workspaces: (await blackboard.repository.listWorkspaces()).map((workspace) => ({
            ...workspace,
            url: workspaceUrl(workspace.id),
            active: workspace.id === activeWorkspaceId,
          })),
        };
      },
    },
    {
      name: BLACKBOARD_AGENT_TOOL_NAMES.createWorkspace,
      title: "Create workspace",
      description:
        "Create a CharDesk Blackboard package in this browser origin. The returned blackboard.yaml entrypoint controls which panel files are visible; read it before replacing the starter Canvas.",
      inputSchema: {
        type: "object",
        properties: { title: { type: "string", minLength: 1 } },
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          workspaceId: { type: "string" },
          title: { type: "string" },
          revision: { type: "integer", minimum: 0 },
          createdAt: { type: "integer", minimum: 0 },
          updatedAt: { type: "integer", minimum: 0 },
          url: { type: "string" },
          entrypoint: { const: BLACKBOARD_SOURCE_ENTRYPOINT },
          active: { const: true },
        },
        required: [
          "workspaceId",
          "title",
          "revision",
          "createdAt",
          "updatedAt",
          "url",
          "entrypoint",
          "active",
        ],
        additionalProperties: false,
      },
      execute: async (input) => {
        const { workspace } = await blackboard.repository.createWorkspace({
          title: optionalTitle(input),
        });
        await workspaceTarget.activateWorkspace(workspace.id);
        return {
          workspaceId: workspace.id,
          title: workspace.title,
          revision: workspace.revision,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
          url: workspaceUrl(workspace.id),
          entrypoint: BLACKBOARD_SOURCE_ENTRYPOINT,
          active: true,
        };
      },
    },
    {
      name: BLACKBOARD_AGENT_TOOL_NAMES.openWorkspace,
      title: "Open workspace",
      description:
        "Make an existing Blackboard the active Canvas in this page. Subsequent file tools can omit workspaceId.",
      inputSchema: {
        type: "object",
        properties: workspaceInputProperty,
        required: ["workspaceId"],
        additionalProperties: false,
      },
      outputSchema: withWorkspaceErrors({
        type: "object",
        properties: {
          ok: { const: true },
          workspaceId: { type: "string" },
          title: { type: "string" },
          revision: { type: "integer", minimum: 0 },
          url: { type: "string" },
          active: { const: true },
        },
        required: ["ok", "workspaceId", "title", "revision", "url", "active"],
        additionalProperties: false,
      }),
      execute: async (input) => {
        const workspaceId = requireWorkspaceId(input);
        const source = await blackboard.repository.readWorkspace(workspaceId);
        if (!source) return workspaceNotFound(workspaceId);
        await workspaceTarget.activateWorkspace(workspaceId);
        return {
          ok: true,
          workspaceId,
          title: source.workspace.title,
          revision: source.workspace.revision,
          url: workspaceUrl(workspaceId),
          active: true,
        };
      },
    },
    {
      name: BLACKBOARD_AGENT_TOOL_NAMES.listFiles,
      title: "List files",
      description:
        "Start here before editing the active Blackboard. List its UTF-8 files and report which sources blackboard.yaml makes visible, keeps as drafts, or leaves unreferenced. workspaceId is optional.",
      inputSchema: {
        type: "object",
        properties: workspaceInputProperty,
        additionalProperties: false,
      },
      outputSchema: withWorkspaceErrors({
        type: "object",
        properties: {
          workspaceId: { type: "string" },
          revision: { type: "integer", minimum: 0 },
          files: { type: "array", items: { type: "string" } },
          entrypoint: { const: BLACKBOARD_SOURCE_ENTRYPOINT },
          projectionStatus: {
            enum: ["valid", "invalid"],
            description: "Whether the current blackboard.yaml entry graph compiles.",
          },
          sourceGraph: nullableSourceGraphSchema,
          warnings: { type: "array", items: { type: "string" } },
        },
        required: [
          "workspaceId",
          "revision",
          "files",
          "entrypoint",
          "projectionStatus",
          "sourceGraph",
          "warnings",
        ],
        additionalProperties: false,
      }),
      readOnly: true,
      execute: async (input) => {
        const current = await selected(input);
        if (!isSelectedWorkspace(current)) return current;
        const projection = await inspectProjection(current.source);
        return {
          workspaceId: current.workspaceId,
          revision: current.source.workspace.revision,
          files: current.source.files.map(({ path }) => path),
          entrypoint: BLACKBOARD_SOURCE_ENTRYPOINT,
          projectionStatus: projection.valid ? "valid" : "invalid",
          sourceGraph: projection.sourceGraph,
          warnings: projection.warnings,
        };
      },
    },
    {
      name: BLACKBOARD_AGENT_TOOL_NAMES.readFile,
      title: "Read file",
      description:
        "Read one source file from the active Blackboard unless workspaceId explicitly targets another. Read blackboard.yaml before editing, then read its visible panel sources.",
      inputSchema: {
        type: "object",
        properties: {
          ...workspaceInputProperty,
          path: {
            type: "string",
            description: "Package-relative source path returned by list_files.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
      outputSchema: withWorkspaceErrors({
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
          revision: { type: "integer", minimum: 0 },
          workspaceId: { type: "string" },
        },
        required: ["path", "content", "revision", "workspaceId"],
        additionalProperties: false,
      }),
      readOnly: true,
      execute: async (input) => {
        const path = requirePath(input);
        const current = await selected(input);
        if (!isSelectedWorkspace(current)) return current;
        const file = current.source.files.find((candidate) => candidate.path === path);
        if (!file) throw new Error(`Blackboard file not found: ${path}`);
        return {
          path: file.path,
          content: file.content,
          revision: current.source.workspace.revision,
          workspaceId: current.workspaceId,
        };
      },
    },
    {
      name: BLACKBOARD_AGENT_TOOL_NAMES.writeFile,
      title: "Write file",
      description:
        "Create or replace one UTF-8 file in the active Blackboard unless workspaceId explicitly targets another. Saving a file does not make it visible: only panel sources registered by blackboard.yaml and placed in its layout affect the Canvas. Prefer apply_patch when changing a panel and the manifest together.",
      inputSchema: {
        type: "object",
        properties: {
          ...workspaceInputProperty,
          path: {
            type: "string",
            description: "Package-relative path. blackboard.yaml is the manifest; panel content uses .panel files.",
          },
          content: { type: "string" },
          baseRevision: {
            type: "integer",
            minimum: 0,
            description: "Optional collision guard from a previous result.",
          },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
      outputSchema: mutationOutputSchema,
      execute: async (input) => {
        const path = requirePath(input);
        const content = requireString(input, "content");
        const current = await selected(input);
        if (!isSelectedWorkspace(current)) return current;
        return apply(current, [{ op: "write", path, content }], optionalRevision(input));
      },
    },
    {
      name: BLACKBOARD_AGENT_TOOL_NAMES.applyPatch,
      title: "Apply patch",
      description:
        "Preferred mutation for the active Blackboard. Atomically update blackboard.yaml and its panel files so the final layout is compiled once; workspaceId is optional and the result reports whether the Canvas projection changed.",
      inputSchema: {
        type: "object",
        properties: {
          ...workspaceInputProperty,
          baseRevision: {
            type: "integer",
            minimum: 0,
            description: "Optional collision guard from a previous result.",
          },
          operations: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                op: { enum: ["write", "replace", "delete"] },
                path: {
                  type: "string",
                  description: "Package-relative Blackboard source path.",
                },
                content: { type: "string" },
                oldText: { type: "string" },
                newText: { type: "string" },
              },
              required: ["op", "path"],
              additionalProperties: false,
            },
          },
        },
        required: ["operations"],
        additionalProperties: false,
      },
      outputSchema: mutationOutputSchema,
      execute: async (input) => {
        if (!Array.isArray(input.operations) || input.operations.length === 0) {
          throw new Error("operations must be a non-empty array.");
        }
        const current = await selected(input);
        if (!isSelectedWorkspace(current)) return current;
        const byPath = new Map(
          current.source.files.map((file) => [file.path, file.content]),
        );
        const operations: BlackboardWorkspaceOperation[] = input.operations.map((raw) => {
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            throw new Error("Each patch operation must be an object.");
          }
          const operation = raw as Record<string, unknown>;
          const op = requireString(operation, "op");
          const path = requirePath(operation);
          if (op === "delete") {
            byPath.delete(path);
            return { op, path };
          }
          if (op === "write") {
            const content = requireString(operation, "content");
            byPath.set(path, content);
            return { op, path, content };
          }
          if (op !== "replace") throw new Error(`Unsupported patch operation: ${op}`);
          const content = byPath.get(path);
          if (content === undefined) throw new Error(`Blackboard file not found: ${path}`);
          const oldText = requireString(operation, "oldText");
          const index = content.indexOf(oldText);
          if (index < 0 || content.indexOf(oldText, index + oldText.length) >= 0) {
            throw new Error(`oldText must match exactly once in ${path}.`);
          }
          const next = content.slice(0, index) +
            requireString(operation, "newText") +
            content.slice(index + oldText.length);
          byPath.set(path, next);
          return { op: "write", path, content: next };
        });
        return apply(current, operations, optionalRevision(input));
      },
    },
    {
      name: BLACKBOARD_AGENT_TOOL_NAMES.deleteFile,
      title: "Delete file",
      description:
        "Delete one source file from the active Blackboard unless workspaceId explicitly targets another. Deleting blackboard.yaml or a visible panel makes the projection invalid unless the same atomic patch repairs its references.",
      inputSchema: {
        type: "object",
        properties: {
          ...workspaceInputProperty,
          path: {
            type: "string",
            description: "Package-relative Blackboard source path.",
          },
          baseRevision: {
            type: "integer",
            minimum: 0,
            description: "Optional collision guard from a previous result.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
      outputSchema: mutationOutputSchema,
      execute: async (input) => {
        const path = requirePath(input);
        const current = await selected(input);
        if (!isSelectedWorkspace(current)) return current;
        return apply(current, [{ op: "delete", path }], optionalRevision(input));
      },
    },
    {
      name: BLACKBOARD_AGENT_TOOL_NAMES.check,
      title: "Check workspace",
      description:
        "Compile the active Blackboard's blackboard.yaml entry graph without changing it. workspaceId is optional. Inspect sourceGraph and warnings for drafts or unreferenced files.",
      inputSchema: {
        type: "object",
        properties: workspaceInputProperty,
        additionalProperties: false,
      },
      outputSchema: withWorkspaceErrors({
        oneOf: [
          {
            type: "object",
            properties: {
              ok: { const: true },
              workspaceId: { type: "string" },
              revision: { type: "integer", minimum: 0 },
              title: { type: "string" },
              entrypoint: { const: BLACKBOARD_SOURCE_ENTRYPOINT },
              sourceGraph: sourceGraphSchema,
              warnings: { type: "array", items: { type: "string" } },
            },
            required: [
              "ok",
              "workspaceId",
              "revision",
              "title",
              "entrypoint",
              "sourceGraph",
              "warnings",
            ],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              ok: { const: false },
              code: { const: "invalid_workspace" },
              workspaceId: { type: "string" },
              revision: { type: "integer", minimum: 0 },
              entrypoint: { const: BLACKBOARD_SOURCE_ENTRYPOINT },
              sourceGraph: nullableSourceGraphSchema,
              message: { type: "string" },
            },
            required: [
              "ok",
              "code",
              "workspaceId",
              "revision",
              "entrypoint",
              "sourceGraph",
              "message",
            ],
            additionalProperties: false,
          },
        ],
      }),
      readOnly: true,
      execute: async (input) => {
        const current = await selected(input);
        if (!isSelectedWorkspace(current)) return current;
        const projection = await inspectProjection(current.source);
        if (!projection.valid) {
          return {
            ok: false,
            code: "invalid_workspace",
            workspaceId: current.workspaceId,
            revision: current.source.workspace.revision,
            entrypoint: BLACKBOARD_SOURCE_ENTRYPOINT,
            sourceGraph: projection.sourceGraph,
            message: projection.warnings[0]!,
          };
        }
        return {
          ok: true,
          workspaceId: current.workspaceId,
          revision: current.source.workspace.revision,
          title: projection.title!,
          entrypoint: BLACKBOARD_SOURCE_ENTRYPOINT,
          sourceGraph: projection.sourceGraph!,
          warnings: projection.warnings,
        };
      },
    },
  ];
};
