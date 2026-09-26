import {
  getCanvasModeDefinition,
  type CanvasMode,
} from "@/domains/sessions/public";

type EditorHostCapabilities = Readonly<{
  navigate: boolean;
  select: boolean;
  copy: boolean;
  mutateContent: boolean;
  manageSessions: boolean;
  collaborate: boolean;
}>;

type HostSurfaceCanvasMode = CanvasMode;

type EditorHostSurfacePermissions = Readonly<{
  inspector: boolean;
  sidebar: boolean;
}>;

export type EditorHostProfile = Readonly<{
  id: "editor";
  capabilities: EditorHostCapabilities;
  surfaces: EditorHostSurfacePermissions;
}>;

type ResolvedEditorHostContract = Readonly<{
  capabilities: EditorHostCapabilities;
  surfaces: Readonly<{
    inspector: HostSurfaceCanvasMode | null;
    sidebar: HostSurfaceCanvasMode | null;
  }>;
}>;

export const EDITOR_HOST_PROFILE: EditorHostProfile = {
  id: "editor",
  capabilities: {
    navigate: true,
    select: true,
    copy: true,
    mutateContent: true,
    manageSessions: true,
    collaborate: true,
  },
  surfaces: {
    inspector: true,
    sidebar: true,
  },
};

export const resolveEditorHostContract = (
  profile: EditorHostProfile,
  context: Readonly<{
    mode: CanvasMode;
    canEdit: boolean;
    sourceBacked: boolean;
  }>
): ResolvedEditorHostContract => {
  const { mode, canEdit, sourceBacked } = context;
  const modeCapabilities = getCanvasModeDefinition(mode).capabilities;
  const modeCanMutate =
    modeCapabilities.mutateCells ||
    modeCapabilities.mutateScene ||
    modeCapabilities.managePages;
  const mutateContent =
    profile.capabilities.mutateContent &&
    canEdit &&
    modeCanMutate;
  const navigate = profile.capabilities.navigate && modeCapabilities.navigate;

  return {
    capabilities: {
      ...profile.capabilities,
      navigate,
      select: profile.capabilities.select && modeCapabilities.select,
      copy: profile.capabilities.copy && modeCapabilities.copy,
      mutateContent,
      collaborate:
        profile.capabilities.collaborate &&
        !sourceBacked &&
        modeCapabilities.collaborate,
    },
    surfaces: {
      inspector:
        profile.surfaces.inspector && !sourceBacked ? mode : null,
      sidebar:
        profile.surfaces.sidebar &&
          (mutateContent || (mode === "slide" && navigate))
          ? mode
          : null,
    },
  };
};
