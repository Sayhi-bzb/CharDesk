import { useContext } from "react";
import { EditorHostProfileContext } from "./editorHostContext";

export const useEditorHostProfile = () => useContext(EditorHostProfileContext);
