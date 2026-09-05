import { GallerySurface } from "../appearance";
import { useState } from "react";
import {
  List,
  ListItem,
  Root,
  ScrollArea,
  Text,
} from "@chardesk/cell-ui";
import {
  useCellVirtualListState,
} from "@chardesk/cell-ui/browser";

const files = Array.from({ length: 100_000 }, (_, index) => ({
  id: `virtual-file-${index}`,
  label: `${String(index + 1).padStart(6, "0")}  src/file-${String(index + 1).padStart(6, "0")}.ts`,
}));

export const VirtualizationDemo = () => {
  const [message, setMessage] = useState("Ready");
  const virtual = useCellVirtualListState(files, {
    scrollId: "virtual-files",
    viewportRows: 9,
    overscanRows: 2,
    defaultFocusedId: "virtual-file-0",
    onAction: (id) => setMessage(`${id.replace("virtual-", "")} opened`),
  });

  return (
    <>
      <GallerySurface
        viewport={{ width: 38, height: 12 }}
        focusedId={virtual.focusedId}
        onCommand={virtual.dispatch}
        label="Virtual file list"
        probeId="virtualization"
      >
        <Root id="virtual-root">
          <Text id="virtual-stats">{`rows 100000  mounted ${virtual.mountedCount}`}</Text>
          <ScrollArea
            id="virtual-files"
            scrollY={virtual.scrollY}
            style={{ border: true, height: 11 }}
          >
            <List
              id="virtual-file-list"
              label="Virtual files"
              style={{ height: virtual.totalHeight, paddingTop: virtual.paddingTop }}
            >
              {virtual.rows.map(({ item, index }) => (
                <ListItem
                  id={item.id}
                  key={item.id}
                  focused={virtual.focusedId === item.id}
                  selected={virtual.selectedId === item.id}
                  positionInSet={index + 1}
                  setSize={files.length}
                ><Text>{item.label}</Text></ListItem>
              ))}
            </List>
          </ScrollArea>
        </Root>
      </GallerySurface>
      <output
        aria-label="Virtual list status"
        role="status"
        aria-live="polite"
        data-mounted={virtual.mountedCount}
        data-cache-range={`${virtual.cacheRange.start}:${virtual.cacheRange.end}`}
        data-scroll-y={virtual.scrollY}
      >{message}</output>
    </>
  );
};
