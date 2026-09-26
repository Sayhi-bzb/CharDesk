import { createContext } from "react";
import {
  EDITOR_HOST_PROFILE,
  type EditorHostProfile,
} from "./editorHostProfile";

export const EditorHostProfileContext = createContext<EditorHostProfile>(
  EDITOR_HOST_PROFILE
);
