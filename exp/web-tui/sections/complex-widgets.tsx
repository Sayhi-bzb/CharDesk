import { GallerySurface } from "../appearance";
import {
  Grid,
  GridCell,
  GridRow,
  Menu,
  MenuItem,
  Root,
  Tab,
  TabPanel,
  Tabs,
  Text,
  Tree,
  TreeItem,
  type WidgetCommand,
} from "@chardesk/cell-ui";
import {
  useCellGridState,
  useCellMenuState,
  useCellTabsState,
  useCellTreeState,
} from "@chardesk/cell-ui/browser";

const menuItems = [
  { id: "menu-new", label: "New file" },
  { id: "menu-open", label: "Open file" },
  { id: "menu-save", label: "Save" },
];

const treeItems = [{
  id: "tree-src",
  label: "src",
  children: [
    { id: "tree-index", label: "index.ts" },
    { id: "tree-app", label: "app.ts" },
  ],
}];

const tabItems = [
  { id: "tab-code", label: "Code", panelId: "panel-code" },
  { id: "tab-preview", label: "Preview", panelId: "panel-preview" },
];

const propertyRows = [
  {
    id: "property-row-name",
    cells: [
      { id: "property-name", label: "Name" },
      { id: "property-value", label: "Value" },
    ],
  },
  {
    id: "property-row-theme",
    cells: [
      { id: "property-theme", label: "Theme" },
      { id: "property-dark", label: "Dark" },
    ],
  },
];

export const ComplexWidgetsDemo = () => {
  const menu = useCellMenuState(menuItems, {
    defaultFocusedId: "menu-open",
  });
  const tree = useCellTreeState(treeItems, {
    defaultExpandedIds: ["tree-src"],
  });
  const tabs = useCellTabsState(tabItems, {
    defaultSelectedId: "tab-code",
  });
  const grid = useCellGridState(propertyRows, {
    defaultSelectedId: "property-name",
  });
  const focusedId = menu.focusedId ?? tree.focusedId ?? tabs.focusedId ?? grid.focusedId;
  const dispatch = (command: WidgetCommand) => {
    menu.dispatch(command);
    tree.dispatch(command);
    tabs.dispatch(command);
    grid.dispatch(command);
  };
  const selectedTab = tabs.items.find(({ id }) => id === tabs.selectedId);

  return (
      <GallerySurface
        viewport={{ width: 44, height: 16 }}
        focusedId={focusedId}
        onCommand={dispatch}
        label="Complex widget surface"
        probeId="complex"
      >
        <Root id="complex-root">
          <Menu id="file-menu" label="File menu" orientation="vertical">
            {menu.items.map((item) => (
              <MenuItem id={item.id} key={item.id} focused={focusedId === item.id}>
                <Text>{item.label}</Text>
              </MenuItem>
            ))}
          </Menu>
          <Tree id="file-tree" label="Files" orientation="vertical">
            {tree.rows.map((row) => (
              <TreeItem
                id={row.item.id}
                key={row.item.id}
                level={row.level}
                parentItemId={row.parentId ?? undefined}
                hasChildren={row.hasChildren}
                expanded={row.expanded}
                focused={focusedId === row.item.id}
                selected={tree.selectedId === row.item.id}
              ><Text>{row.item.label}</Text></TreeItem>
            ))}
          </Tree>
          <Tabs id="view-tabs" label="Views" orientation="horizontal" style={{ height: 2 }}>
            {tabs.items.map((item) => (
              <Tab
                id={item.id}
                key={item.id}
                controlsId={item.panelId}
                focused={focusedId === item.id}
                selected={tabs.selectedId === item.id}
                style={{ width: 12 }}
              ><Text>{item.label}</Text></Tab>
            ))}
          </Tabs>
          {selectedTab ? (
            <TabPanel
              id={selectedTab.panelId}
              label={`${selectedTab.label} panel`}
              labelledById={selectedTab.id}
              style={{ border: true, height: 3 }}
            ><Text>{`${selectedTab.label} content`}</Text></TabPanel>
          ) : null}
          <Grid
            id="property-grid"
            label="Properties"
            rowCount={grid.rowCount}
            columnCount={grid.columnCount}
          >
            {grid.rows.map((row, rowIndex) => (
              <GridRow id={row.id} key={row.id} rowIndex={rowIndex + 1}>
                {row.cells.map((cell, columnIndex) => (
                  <GridCell
                    id={cell.id}
                    key={cell.id}
                    rowIndex={rowIndex + 1}
                    columnIndex={columnIndex + 1}
                    focused={focusedId === cell.id}
                    selected={grid.selectedId === cell.id}
                    style={{ width: 18 }}
                  ><Text>{cell.label}</Text></GridCell>
                ))}
              </GridRow>
            ))}
          </Grid>
        </Root>
      </GallerySurface>
  );
};
