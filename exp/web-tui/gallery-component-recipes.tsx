import {
  Box,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Text,
} from "@chardesk/cell-ui";
import type { CellSelectState } from "@chardesk/cell-ui/browser";

export const renderGallerySelect = ({
  label,
  select,
  focusedId,
  width,
  disabled = false,
  open = select.open,
  showLabel = true,
  border,
  rounded = false,
  emptyLabel = "default",
  triggerText = select.selectedItem?.label ?? emptyLabel,
  triggerLabel = label,
  contentLabel = `${label} options`,
  fieldId = `${select.id}-field`,
  labelId,
  itemSemanticLabel,
}: Readonly<{
  label: string;
  select: CellSelectState;
  focusedId: string | null;
  width: number;
  disabled?: boolean;
  open?: boolean;
  showLabel?: boolean;
  border?: boolean;
  rounded?: boolean;
  emptyLabel?: string;
  triggerText?: string;
  triggerLabel?: string;
  contentLabel?: string;
  fieldId?: string;
  labelId?: string;
  itemSemanticLabel?: (id: string) => string;
}>) => (
  <Box id={fieldId} key={select.id} style={{ width }}>
    {showLabel ? <Text id={labelId}>{label}</Text> : null}
    <Select id={select.id} label={label} style={{ width }}>
      <SelectTrigger
        id={select.triggerId}
        label={triggerLabel}
        expanded={open}
        controlsId={open ? select.contentId : undefined}
        disabled={disabled}
        focused={focusedId === select.triggerId}
        style={{ width }}
      ><Text>{triggerText}</Text></SelectTrigger>
      {open ? (
        <SelectContent
          id={select.contentId}
          label={contentLabel}
          scrollY={select.scrollY}
          style={{
            width,
            ...(border === undefined ? {} : { border }),
            borderShape: rounded ? "rounded" : "square",
          }}
        >
          {select.items.map((item, index) => (
            <SelectItem
              id={item.id}
              key={item.id}
              label={itemSemanticLabel?.(item.id)}
              disabled={item.disabled}
              focused={focusedId === item.id}
              selected={select.selectedId === item.id}
              positionInSet={index + 1}
              setSize={select.items.length}
            ><Text>{item.label}</Text></SelectItem>
          ))}
        </SelectContent>
      ) : null}
    </Select>
  </Box>
);

export const renderGalleryCheckbox = ({
  id,
  label,
  checked,
  focusedId,
  disabled = false,
}: Readonly<{
  id: string;
  label: string;
  checked: boolean;
  focusedId: string | null;
  disabled?: boolean;
}>) => (
  <Box id={`${id}-field`} key={id} style={{ direction: "row", height: 1 }}>
    <Checkbox
      id={id}
      label={label}
      checked={checked}
      disabled={disabled}
      focused={focusedId === id}
    ><Text>{label}</Text></Checkbox>
  </Box>
);
