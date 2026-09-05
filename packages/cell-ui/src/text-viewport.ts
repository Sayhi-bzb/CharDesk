import type { WidgetCommand } from "./interaction.js";
import type { FrameSnapshot } from "./types.js";

/** Layout owns editor dimensions; adapters deliver updates through the text command path. */
export const textViewportCommands = (frame: FrameSnapshot): readonly WidgetCommand[] => {
  const commands: WidgetCommand[] = [];
  for (const [id, layout] of frame.textLayouts) {
    const viewport = frame.tree.nodes.get(id)?.textEditor?.viewport;
    const columns = Math.max(1, layout.contentBounds.width);
    const rows = Math.max(1, layout.contentBounds.height);
    if (viewport?.columns === columns && viewport.rows === rows) continue;
    commands.push({ type: "text", targetId: id, command: { type: "set-viewport", columns, rows } });
  }
  return commands;
};
