import { expect, it } from "vitest";
import { Button, CellUiRuntime, Root, Text } from "./index.js";
import {
  Button as RegistryButton,
  CellUiRuntime as RegistryRuntime,
  Root as RegistryRoot,
  Text as RegistryText,
} from "../../../registry/cell-ui/index.js";
import { CellSurface as RegistryCellSurface } from "../../../registry/cell-ui/browser.js";

it("renders identical headless Cells from the installable source", () => {
  const source = new CellUiRuntime({ viewport: { width: 12, height: 1 } });
  const registry = new RegistryRuntime({ viewport: { width: 12, height: 1 } });
  const sourceFrame = source.render(<Root><Button id="save"><Text>Save</Text></Button></Root>);
  const registryFrame = registry.render(
    <RegistryRoot><RegistryButton id="save"><RegistryText>Save</RegistryText></RegistryButton></RegistryRoot>
  );
  expect(registryFrame.buffer.toText()).toBe(sourceFrame.buffer.toText());
  expect(registryFrame.semantics.nodes.get("save")).toEqual(sourceFrame.semantics.nodes.get("save"));
  expect(typeof RegistryCellSurface).toBe("function");
  registry.dispose();
  source.dispose();
});
