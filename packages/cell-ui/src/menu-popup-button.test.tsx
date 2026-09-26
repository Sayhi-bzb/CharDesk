import { expect, it } from 'vitest';
import { Button, CellUiRuntime, Root, Text, auditSemanticSnapshot } from './index.js';

it("projects a menu trigger's popup state without requiring a same-surface menu", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 } });
  const view = (expanded: boolean) => (
    <Root>
      <Button id="trigger" label="Open menu" popup="menu" expanded={expanded}>
        <Text>≡</Text>
      </Button>
    </Root>
  );
  const closed = runtime.render(view(false));
  expect(closed.semantics.nodes.get('trigger')).toMatchObject({
    role: 'button',
    hasPopup: 'menu',
    expanded: false,
  });
  expect(auditSemanticSnapshot(closed.semantics)).toEqual([]);
  const open = runtime.render(view(true));
  expect(open.semantics.nodes.get('trigger')?.expanded).toBe(true);
  expect(auditSemanticSnapshot(open.semantics)).toEqual([]);
  runtime.dispose();
});
