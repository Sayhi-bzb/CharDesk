import { useEffect, useState } from "react";
import { Box, Button, Progress, Root, Text, TextArea, type WidgetCommand } from "@chardesk/cell-ui";
import { useCellSelectState, useCellTextState } from "@chardesk/cell-ui/browser";
import { GallerySurface } from "./appearance";
import { renderGalleryCheckbox, renderGallerySelect } from "./gallery-component-recipes";

const themeItems = [
  { id: "intro-theme-light", label: "Light" },
  { id: "intro-theme-dark", label: "Dark" },
] as const;

export function SettingsIntroductionDemo() {
  const theme = useCellSelectState("intro-theme", themeItems, { defaultSelectedId: "intro-theme-dark" });
  const [sound, setSound] = useState(true);
  const [focusedId, setFocusedId] = useState(theme.triggerId);
  const currentFocus = theme.open ? theme.focusedId : focusedId;
  const dispatch = (command: WidgetCommand) => {
    theme.dispatch(command);
    if (command.type === "focus") setFocusedId(command.targetId);
    if (command.type === "activate" && command.targetId === "intro-sound") setSound((current) => !current);
    if ((command.type === "dismiss" && command.targetId === theme.contentId)
      || (command.type === "activate" && theme.items.some(({ id }) => id === command.targetId))) {
      setFocusedId(theme.triggerId);
    }
  };
  return <GallerySurface viewport={{ width: 32, height: 5 }}
    overlayViewport={{ width: 32, height: theme.open ? 7 : 5 }}
    focusedId={currentFocus} onCommand={dispatch} label="Settings example" probeId="intro-settings">
    <Root><Box variant="ghost" style={{ width: 30 }}>
      <Text>Preferences</Text>
      {renderGallerySelect({ label: "Theme", select: theme, focusedId: currentFocus, width: 30 })}
      {renderGalleryCheckbox({ id: "intro-sound", label: "Sound", checked: sound, focusedId: currentFocus })}
    </Box></Root>
  </GallerySurface>;
}

const progressValues = [0, 8, 8, 23, 49, 49, 76, 93, 100] as const;
const progressDelays = [350, 480, 320, 500, 400, 650, 390, 450] as const;

export function ProgressIntroductionDemo() {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    if (step === null || step >= progressValues.length - 1) return;
    const timer = window.setTimeout(() => setStep(step + 1), progressDelays[step]);
    return () => window.clearTimeout(timer);
  }, [step]);
  const value = step === null ? 0 : progressValues[step]!;
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "activate" && command.targetId === "intro-progress-start") setStep(0);
  };
  return <GallerySurface viewport={{ width: 32, height: 4 }} focusedId="intro-progress-start"
    onCommand={dispatch} label="Progress example" probeId="intro-progress">
    <Root><Text>{value === 100 ? "Upload complete" : "Uploading files"}</Text>
      <Progress id="intro-progress-bar" label="Upload" value={value} variant="outline" style={{ width: 26 }} />
      <Button id="intro-progress-start"><Text>{step === null || value === 100 ? "Start" : "Restart"}</Text></Button>
    </Root>
  </GallerySurface>;
}

export function NotesIntroductionDemo() {
  const note = useCellTextState("intro-note", { value: "Hello, 世界 👋\nEdit these Cells.", multiline: true });
  return <GallerySurface viewport={{ width: 32, height: 7 }} onCommand={note.dispatch}
    label="Unicode notes example" probeId="intro-notes">
    <Root><Text>Notes</Text>
      <TextArea id="intro-note" label="Notes" state={note.snapshot} frame="bordered"
        style={{ width: 30, height: 5 }} />
    </Root>
  </GallerySurface>;
}
