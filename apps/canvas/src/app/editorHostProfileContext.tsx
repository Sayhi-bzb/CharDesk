import type { ReactNode } from "react";
import type { EditorHostProfile } from "./editorHostProfile";
import { EditorHostProfileContext } from "./editorHostContext";

export function EditorHostProfileProvider({
  profile,
  children,
}: {
  profile: EditorHostProfile;
  children: ReactNode;
}) {
  return (
    <EditorHostProfileContext.Provider value={profile}>
      {children}
    </EditorHostProfileContext.Provider>
  );
}
