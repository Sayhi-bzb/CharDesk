import type { TextAttributes } from "@/shared/types";
import type { CharDeskContentThemeToken } from "@chardesk/rendering/theme";

export type CanvasTemplateGroup = "template" | "component";
export type CanvasTemplateId = "button" | "badge" | "switch" | "alert" | "tabs" | "input" | "checkbox" | "radio" | "divider" | "card" | "textarea" | "status" | "accordion" | "avatar" | "breadcrumb" | "calendar" | "barChart" | "lineChart" | "table" | "pagination" | "slider" | "progress" | "scrollArea" | "amibios" | "spotify" | "safari" | "filetree" | "timeline" | "snippet" | "terminal" | "phone";
export type CanvasTemplateColor =
  | string
  | Readonly<{ token: CharDeskContentThemeToken }>;
export type CanvasTemplateSpan = Readonly<{
  x: number;
  text: string;
  color: CanvasTemplateColor;
  bgColor?: CanvasTemplateColor;
  attrs?: TextAttributes;
  href?: string;
}>;
export type CanvasTemplateRow = Readonly<{
  y: number;
  spans: readonly CanvasTemplateSpan[];
}>;
export type CanvasTemplateDefinition = Readonly<{
  id: CanvasTemplateId;
  label: string;
  group: CanvasTemplateGroup;
  width: number;
  height: number;
  rows: readonly CanvasTemplateRow[];
}>;

export const FIXED_COLOR_CANVAS_TEMPLATE_IDS = [
  "amibios",
  "spotify",
  "safari",
  "terminal",
] as const satisfies readonly CanvasTemplateId[];

export const CANVAS_TEMPLATES = [
  {
    "id": "button",
    "label": "Button",
    "group": "component",
    "width": 8,
    "height": 1,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "[BUTTON]",
            "color": { "token": "foreground" },
            "bgColor": { "token": "surface" }
          }
        ]
      }
    ]
  },
  {
    "id": "badge",
    "label": "Badge",
    "group": "component",
    "width": 9,
    "height": 1,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": " ",
            "color": { "token": "foreground" },
            "bgColor": { "token": "surface" }
          },
          {
            "x": 1,
            "text": " badge",
            "color": { "token": "info" },
            "bgColor": { "token": "surface" }
          },
          {
            "x": 8,
            "text": " ",
            "color": { "token": "foreground" },
            "bgColor": { "token": "surface" }
          }
        ]
      }
    ]
  },
  {
    "id": "switch",
    "label": "Switch",
    "group": "component",
    "width": 8,
    "height": 1,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "󰨙 Switch",
            "color": { "token": "foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "alert",
    "label": "Alert",
    "group": "component",
    "width": 24,
    "height": 4,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "╭──────────────────────╮",
            "color": { "token": "info" }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "info" }
          },
          {
            "x": 2,
            "text": "󰄳",
            "color": { "token": "info" }
          },
          {
            "x": 5,
            "text": "AlertTitle",
            "color": { "token": "info" }
          },
          {
            "x": 23,
            "text": "│",
            "color": { "token": "info" }
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "info" }
          },
          {
            "x": 5,
            "text": "AlertDescription",
            "color": { "token": "info" }
          },
          {
            "x": 23,
            "text": "│",
            "color": { "token": "info" }
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "╰──────────────────────╯",
            "color": { "token": "info" }
          }
        ]
      }
    ]
  },
  {
    "id": "tabs",
    "label": "Tabs",
    "group": "component",
    "width": 21,
    "height": 1,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "tab 1 |",
            "color": { "token": "foreground" }
          },
          {
            "x": 7,
            "text": " tab 2 ",
            "color": { "token": "accent" },
            "bgColor": { "token": "surface" },
            "attrs": {
              "underline": true
            }
          },
          {
            "x": 14,
            "text": "| tab 3",
            "color": { "token": "foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "input",
    "label": "Input",
    "group": "component",
    "width": 26,
    "height": 1,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "Name: ",
            "color": { "token": "foreground" }
          },
          {
            "x": 6,
            "text": "[ CharDesk     |   ]",
            "color": { "token": "foreground" },
            "bgColor": { "token": "surface" }
          }
        ]
      }
    ]
  },
  {
    "id": "checkbox",
    "label": "Checkbox",
    "group": "component",
    "width": 12,
    "height": 2,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "󰱒 checkbox 1",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "󰄱 checkbox 2",
            "color": { "token": "foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "radio",
    "label": "Radio",
    "group": "component",
    "width": 9,
    "height": 3,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "󰄰 radio 1",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "󰄳 radio 2",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "󰄰 radio 3",
            "color": { "token": "foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "divider",
    "label": "Divider",
    "group": "component",
    "width": 12,
    "height": 1,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "────────────",
            "color": { "token": "foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "card",
    "label": "Card",
    "group": "component",
    "width": 21,
    "height": 10,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "╭───────────────────╮",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "│CardTitle",
            "color": { "token": "foreground" }
          },
          {
            "x": 20,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "├───────────────────┤",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "│CardContent",
            "color": { "token": "foreground" }
          },
          {
            "x": 20,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 4,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "foreground" }
          },
          {
            "x": 20,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 5,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "foreground" }
          },
          {
            "x": 20,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 6,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "foreground" }
          },
          {
            "x": 20,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 7,
        "spans": [
          {
            "x": 0,
            "text": "├───────────────────┤",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 8,
        "spans": [
          {
            "x": 0,
            "text": "│CardFooter",
            "color": { "token": "foreground" }
          },
          {
            "x": 20,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 9,
        "spans": [
          {
            "x": 0,
            "text": "╰───────────────────╯",
            "color": { "token": "foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "textarea",
    "label": "Textarea",
    "group": "component",
    "width": 26,
    "height": 4,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "TextArea                 ",
            "color": { "token": "foreground" }
          },
          {
            "x": 25,
            "text": "█",
            "color": { "token": "accent" }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "                         │",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "Press Ctrl+S to save...",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 23,
            "text": "  │",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "󰦨 UTF-8  󰚰 Ln 2, Col 44   ",
            "color": { "token": "accent" },
            "bgColor": { "token": "surface" }
          }
        ]
      }
    ]
  },
  {
    "id": "status",
    "label": "Status",
    "group": "component",
    "width": 9,
    "height": 4,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "󰄳 Success",
            "color": { "token": "success" }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": " Warning",
            "color": { "token": "warning" }
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": " Error",
            "color": { "token": "danger" }
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": " Loading",
            "color": { "token": "muted-foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "accordion",
    "label": "Accordion",
    "group": "component",
    "width": 20,
    "height": 4,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "Accordion          󰅃",
            "color": { "token": "foreground" },
            "attrs": {
              "bold": true,
              "underline": true
            }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "AccordionContent    ",
            "color": { "token": "foreground" },
            "bgColor": { "token": "surface" }
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "                    ",
            "color": { "token": "foreground" },
            "bgColor": { "token": "surface" }
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "Accordion          󰅀",
            "color": { "token": "foreground" },
            "attrs": {
              "bold": true
            }
          }
        ]
      }
    ]
  },
  {
    "id": "avatar",
    "label": "Avatar",
    "group": "component",
    "width": 5,
    "height": 1,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "󰀉",
            "color": { "token": "info" }
          },
          {
            "x": 1,
            "text": " ",
            "color": { "token": "foreground" }
          },
          {
            "x": 2,
            "text": "󰭕 󰭕",
            "color": { "token": "muted-foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "breadcrumb",
    "label": "Breadcrumb",
    "group": "component",
    "width": 37,
    "height": 1,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "BreadcrumbItem / ... / BreadcrumbItem",
            "color": { "token": "foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "calendar",
    "label": "Calendar",
    "group": "component",
    "width": 26,
    "height": 7,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "󰃭  July 2026          󰁍  󰁔",
            "color": { "token": "foreground" },
            "bgColor": { "token": "surface" }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "Su  Mo  Tu  We  Th  Fr  Sa",
            "color": { "token": "muted-foreground" },
            "bgColor": { "token": "surface" }
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "28  29  30  ",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 12,
            "text": "01 ",
            "color": { "token": "foreground" }
          },
          {
            "x": 15,
            "text": " 02 ",
            "color": { "token": "accent" },
            "bgColor": { "token": "surface" }
          },
          {
            "x": 19,
            "text": " 03  04",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "05  06  07  08  09  10  11",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 4,
        "spans": [
          {
            "x": 0,
            "text": "12  13  14  15  16  17  18",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 5,
        "spans": [
          {
            "x": 0,
            "text": "19  20  21  22  23  24  25",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 6,
        "spans": [
          {
            "x": 0,
            "text": "26  27  28  29  30  31 ",
            "color": { "token": "foreground" }
          },
          {
            "x": 23,
            "text": " 01",
            "color": { "token": "muted-foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "barChart",
    "label": "Bar chart",
    "group": "component",
    "width": 14,
    "height": 4,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "│     ",
            "color": { "token": "foreground" }
          },
          {
            "x": 6,
            "text": "█",
            "color": { "token": "accent" }
          },
          {
            "x": 7,
            "text": "       ",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "├ ",
            "color": { "token": "foreground" }
          },
          {
            "x": 2,
            "text": "▄",
            "color": { "token": "accent" }
          },
          {
            "x": 3,
            "text": "   ",
            "color": { "token": "foreground" }
          },
          {
            "x": 6,
            "text": "█",
            "color": { "token": "accent" }
          },
          {
            "x": 7,
            "text": "   ",
            "color": { "token": "foreground" }
          },
          {
            "x": 10,
            "text": "▆",
            "color": { "token": "accent" }
          },
          {
            "x": 11,
            "text": "   ",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "│ ",
            "color": { "token": "foreground" }
          },
          {
            "x": 2,
            "text": "█",
            "color": { "token": "accent" }
          },
          {
            "x": 3,
            "text": " ",
            "color": { "token": "foreground" }
          },
          {
            "x": 4,
            "text": "▇",
            "color": { "token": "accent" }
          },
          {
            "x": 5,
            "text": " ",
            "color": { "token": "foreground" }
          },
          {
            "x": 6,
            "text": "█",
            "color": { "token": "accent" }
          },
          {
            "x": 7,
            "text": " ",
            "color": { "token": "foreground" }
          },
          {
            "x": 8,
            "text": "▃",
            "color": { "token": "accent" }
          },
          {
            "x": 9,
            "text": " ",
            "color": { "token": "foreground" }
          },
          {
            "x": 10,
            "text": "█",
            "color": { "token": "accent" }
          },
          {
            "x": 11,
            "text": " ",
            "color": { "token": "foreground" }
          },
          {
            "x": 12,
            "text": "█",
            "color": { "token": "accent" }
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "└─┴─┴─┴─┴─┴─┴─",
            "color": { "token": "foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "lineChart",
    "label": "Line chart",
    "group": "component",
    "width": 13,
    "height": 5,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "├         ",
            "color": { "token": "foreground" }
          },
          {
            "x": 10,
            "text": "╭─",
            "color": { "token": "danger" }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "│   ",
            "color": { "token": "foreground" }
          },
          {
            "x": 4,
            "text": "╭─╮",
            "color": { "token": "danger" }
          },
          {
            "x": 7,
            "text": "   ",
            "color": { "token": "foreground" }
          },
          {
            "x": 10,
            "text": "│",
            "color": { "token": "danger" }
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "├ ",
            "color": { "token": "foreground" }
          },
          {
            "x": 2,
            "text": "──╯",
            "color": { "token": "danger" }
          },
          {
            "x": 5,
            "text": " ",
            "color": { "token": "foreground" }
          },
          {
            "x": 6,
            "text": "│",
            "color": { "token": "danger" }
          },
          {
            "x": 7,
            "text": " ",
            "color": { "token": "foreground" }
          },
          {
            "x": 8,
            "text": "╭─╯",
            "color": { "token": "danger" }
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "│     ",
            "color": { "token": "foreground" }
          },
          {
            "x": 6,
            "text": "╰─╯",
            "color": { "token": "danger" }
          }
        ]
      },
      {
        "y": 4,
        "spans": [
          {
            "x": 0,
            "text": "└─┴─┴─┴─┴─┴─┴",
            "color": { "token": "foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "table",
    "label": "Table",
    "group": "component",
    "width": 33,
    "height": 6,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": " TableCaption                    ",
            "color": { "token": "accent-foreground" },
            "bgColor": { "token": "accent" }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "         Head 1   Head 2   Head 3",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": " Row 1   Cell     Cell     Cell  ",
            "color": { "token": "foreground" },
            "bgColor": { "token": "surface" }
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": " Row 2   Cell     Cell     Cell",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 4,
        "spans": [
          {
            "x": 0,
            "text": " Row 3   Cell     Cell     Cell  ",
            "color": { "token": "foreground" },
            "bgColor": { "token": "surface" }
          }
        ]
      },
      {
        "y": 5,
        "spans": [
          {
            "x": 0,
            "text": " TableFooter                     ",
            "color": { "token": "accent-foreground" },
            "bgColor": { "token": "accent" }
          }
        ]
      }
    ]
  },
  {
    "id": "pagination",
    "label": "Pagination",
    "group": "component",
    "width": 30,
    "height": 1,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "< Previous  1  2 ",
            "color": { "token": "foreground" }
          },
          {
            "x": 17,
            "text": " 3 ",
            "color": { "token": "accent" },
            "bgColor": { "token": "surface" },
            "attrs": {
              "bold": true
            }
          },
          {
            "x": 20,
            "text": "   Next >",
            "color": { "token": "foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "slider",
    "label": "Slider",
    "group": "component",
    "width": 28,
    "height": 1,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "Slider ",
            "color": { "token": "foreground" }
          },
          {
            "x": 7,
            "text": "────",
            "color": { "token": "border-subtle" }
          },
          {
            "x": 11,
            "text": "●────────────●",
            "color": { "token": "accent" }
          },
          {
            "x": 25,
            "text": "───",
            "color": { "token": "border-subtle" }
          }
        ]
      }
    ]
  },
  {
    "id": "progress",
    "label": "Progress",
    "group": "component",
    "width": 16,
    "height": 1,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "         ",
            "color": { "token": "muted-foreground" },
            "bgColor": { "token": "accent" }
          },
          {
            "x": 9,
            "text": "    ",
            "color": { "token": "muted-foreground" },
            "bgColor": { "token": "surface" }
          },
          {
            "x": 13,
            "text": "70%",
            "color": { "token": "accent" }
          }
        ]
      }
    ]
  },
  {
    "id": "scrollArea",
    "label": "Scroll area",
    "group": "component",
    "width": 12,
    "height": 4,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "ScrollArea │",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "├─Item    ",
            "color": { "token": "foreground" }
          },
          {
            "x": 10,
            "text": " ",
            "color": { "token": "accent" }
          },
          {
            "x": 11,
            "text": "█",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "├─Item     │",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "└─Item     │",
            "color": { "token": "foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "amibios",
    "label": "AMIBIOS",
    "group": "template",
    "width": 81,
    "height": 25,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "╭───────────────────────────────────────────────────────────────────────────────╮",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "│   ",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 4,
            "text": "AMIBIOS EASY SETUP UTILITY - VERSION 1.24.2026",
            "color": "#c0c0c0",
            "bgColor": "#000080",
            "attrs": {
              "bold": true
            }
          },
          {
            "x": 50,
            "text": "                              ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "├───────────────────────────────────────────────────────────────────────────────┤",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "│ ",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 2,
            "text": " Main ",
            "color": "#c0c0c0",
            "bgColor": "#000080",
            "attrs": {
              "inverse": true
            }
          },
          {
            "x": 8,
            "text": "     Advanced     Power     Boot     Security     Exit",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 62,
            "text": "                  ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 4,
        "spans": [
          {
            "x": 0,
            "text": "├───────────────────────────────────────┬───────────────────────────────────────┤",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 5,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 1,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 41,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 6,
        "spans": [
          {
            "x": 0,
            "text": "│  System Time:       [",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 23,
            "text": "11:05:25",
            "color": "#c0c0c0",
            "bgColor": "#000080",
            "attrs": {
              "bold": true
            }
          },
          {
            "x": 31,
            "text": "]",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 32,
            "text": "        ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│ Item Specific Help",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 60,
            "text": "                    ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 7,
        "spans": [
          {
            "x": 0,
            "text": "│  System Date:       [",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 23,
            "text": "07/02/2026",
            "color": "#c0c0c0",
            "bgColor": "#000080",
            "attrs": {
              "bold": true
            }
          },
          {
            "x": 33,
            "text": "]",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 34,
            "text": "      ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 41,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 8,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 1,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│ Use [Enter], [TAB]",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 60,
            "text": "                    ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 9,
        "spans": [
          {
            "x": 0,
            "text": "│  Legacy Diskette A:  [1.44M, 3.5 in.]",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 39,
            "text": " ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│ or [SHIFT-TAB] to select a field.",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 75,
            "text": "     ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 10,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 1,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 41,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 11,
        "spans": [
          {
            "x": 0,
            "text": "│ ┌─ Primary Master ──────────────────┐",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 39,
            "text": " ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│ Use [+] or [-] to",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 59,
            "text": "                     ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 12,
        "spans": [
          {
            "x": 0,
            "text": "│ │ Type:             [Auto]          │",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 39,
            "text": " ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│ configure system Time.",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 64,
            "text": "                ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 13,
        "spans": [
          {
            "x": 0,
            "text": "│ │ LBA Mode:         [On]            │",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 39,
            "text": " ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 41,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 14,
        "spans": [
          {
            "x": 0,
            "text": "│ │ Block Mode:       [4 Sectors]     │",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 39,
            "text": " ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 41,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 15,
        "spans": [
          {
            "x": 0,
            "text": "│ └───────────────────────────────────┘",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 39,
            "text": " ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 41,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 16,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 1,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 41,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 17,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 1,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 41,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 18,
        "spans": [
          {
            "x": 0,
            "text": "│  ",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 3,
            "text": "> System Memory:     640 KB        ",
            "color": "#c0c0c0",
            "bgColor": "#000080",
            "attrs": {
              "inverse": true
            }
          },
          {
            "x": 38,
            "text": "  ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 41,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 19,
        "spans": [
          {
            "x": 0,
            "text": "│    Extended Memory:   16384 MB",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 32,
            "text": "        ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 41,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 20,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 1,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 41,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 21,
        "spans": [
          {
            "x": 0,
            "text": "│ ",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 2,
            "text": "  ",
            "color": "#808000",
            "bgColor": "#000080"
          },
          {
            "x": 5,
            "text": "CPU Temperature:   45°C (Normal)",
            "color": "#800000",
            "bgColor": "#000080",
            "attrs": {
              "bold": true
            }
          },
          {
            "x": 37,
            "text": "   ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 40,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          },
          {
            "x": 41,
            "text": "                                       ",
            "color": "#000000",
            "bgColor": "#000080"
          },
          {
            "x": 80,
            "text": "│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 22,
        "spans": [
          {
            "x": 0,
            "text": "├───────────────────────────────────────┴───────────────────────────────────────┤",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 23,
        "spans": [
          {
            "x": 0,
            "text": "│ F1:Help  ↑↓:Select Item  +/-:Change Values  F5:Setup Defaults  F10:Save & Exit│",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      },
      {
        "y": 24,
        "spans": [
          {
            "x": 0,
            "text": "╰───────────────────────────────────────────────────────────────────────────────╯",
            "color": "#c0c0c0",
            "bgColor": "#000080"
          }
        ]
      }
    ]
  },
  {
    "id": "spotify",
    "label": "Spotify",
    "group": "template",
    "width": 46,
    "height": 17,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "╭────────────────────────────────────────────╮",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "│󰓇",
            "color": "#00ff00"
          },
          {
            "x": 2,
            "text": " Spotify Premium                Desktop-PC",
            "color": "#000000"
          },
          {
            "x": 45,
            "text": "│",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#00ff00"
          },
          {
            "x": 45,
            "text": "│",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#00ff00"
          },
          {
            "x": 1,
            "text": "            ",
            "color": "#000000"
          },
          {
            "x": 13,
            "text": "󰝚 ",
            "color": "#808000"
          },
          {
            "x": 15,
            "text": "Blinding Lights",
            "color": "#808000",
            "attrs": {
              "bold": true
            }
          },
          {
            "x": 45,
            "text": "│",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 4,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#00ff00"
          },
          {
            "x": 1,
            "text": "        The Weeknd — After Hours",
            "color": "#000000"
          },
          {
            "x": 45,
            "text": "│",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 5,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#00ff00"
          },
          {
            "x": 45,
            "text": "│",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 6,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#00ff00"
          },
          {
            "x": 1,
            "text": "  01:45 ",
            "color": "#000000"
          },
          {
            "x": 9,
            "text": "━━━━━━━━━━━━━━━━━━━━━━━",
            "color": "#00ff00"
          },
          {
            "x": 32,
            "text": "━━━━━━",
            "color": "#808080"
          },
          {
            "x": 38,
            "text": " 03:22",
            "color": "#000000"
          },
          {
            "x": 45,
            "text": "│",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 7,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#00ff00"
          },
          {
            "x": 45,
            "text": "│",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 8,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#00ff00"
          },
          {
            "x": 1,
            "text": "               󰙣   󰐌   󰙡   ",
            "color": "#000000"
          },
          {
            "x": 45,
            "text": "│",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 9,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#00ff00"
          },
          {
            "x": 45,
            "text": "│",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 10,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#00ff00"
          },
          {
            "x": 1,
            "text": "Next Up",
            "color": "#000000"
          },
          {
            "x": 45,
            "text": "│",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 11,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#00ff00"
          },
          {
            "x": 1,
            "text": "  󰎈 Save Your Tears            ",
            "color": "#000000"
          },
          {
            "x": 32,
            "text": "3:35",
            "color": "#808080"
          },
          {
            "x": 36,
            "text": "   ",
            "color": "#000000"
          },
          {
            "x": 39,
            "text": "󰓏",
            "color": "#00ff00"
          },
          {
            "x": 45,
            "text": "│",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 12,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#00ff00"
          },
          {
            "x": 1,
            "text": "  󰎈 Starboy                    ",
            "color": "#000000"
          },
          {
            "x": 32,
            "text": "3:50",
            "color": "#808080"
          },
          {
            "x": 36,
            "text": "   ",
            "color": "#000000"
          },
          {
            "x": 39,
            "text": "󰓏",
            "color": "#00ff00"
          },
          {
            "x": 45,
            "text": "│",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 13,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#00ff00"
          },
          {
            "x": 1,
            "text": "  󰎈 Die For You                ",
            "color": "#000000"
          },
          {
            "x": 32,
            "text": "4:20",
            "color": "#808080"
          },
          {
            "x": 36,
            "text": "   ",
            "color": "#000000"
          },
          {
            "x": 39,
            "text": "󰓏",
            "color": "#00ff00"
          },
          {
            "x": 45,
            "text": "│",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 14,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#00ff00"
          },
          {
            "x": 45,
            "text": "│",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 15,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#00ff00"
          },
          {
            "x": 1,
            "text": " ",
            "color": "#000000"
          },
          {
            "x": 2,
            "text": "  󰠃  Listening on Living Room Echo  󰓃   ",
            "color": "#00ff00",
            "attrs": {
              "inverse": true
            }
          },
          {
            "x": 45,
            "text": "│",
            "color": "#00ff00"
          }
        ]
      },
      {
        "y": 16,
        "spans": [
          {
            "x": 0,
            "text": "╰────────────────────────────────────────────╯",
            "color": "#00ff00"
          }
        ]
      }
    ]
  },
  {
    "id": "safari",
    "label": "Safari",
    "group": "template",
    "width": 72,
    "height": 21,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "╭──────────────────────────────────────────────────────────────────────╮",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 2,
            "text": "●",
            "color": "#ff6159"
          },
          {
            "x": 3,
            "text": " ",
            "color": "#000000"
          },
          {
            "x": 4,
            "text": "●",
            "color": "#ffbd2e"
          },
          {
            "x": 5,
            "text": " ",
            "color": "#000000"
          },
          {
            "x": 6,
            "text": "●",
            "color": "#28c941"
          },
          {
            "x": 8,
            "text": "  < >   ",
            "color": "#000000"
          },
          {
            "x": 19,
            "text": "          chardesk.com          ",
            "color": "#000000",
            "bgColor": "#d1d5db"
          },
          {
            "x": 53,
            "text": " ",
            "color": "#000000"
          },
          {
            "x": 61,
            "text": "    󰆏",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "├──────────────────────────────────────────────────────────────────────┤",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 4,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 5,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 6,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 7,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 8,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 9,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 10,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 11,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 12,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 13,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 14,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 15,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 16,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 17,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 18,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 19,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 71,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 20,
        "spans": [
          {
            "x": 0,
            "text": "╰──────────────────────────────────────────────────────────────────────╯",
            "color": "#000000"
          }
        ]
      }
    ]
  },
  {
    "id": "filetree",
    "label": "File tree",
    "group": "template",
    "width": 20,
    "height": 16,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": " PROJECT-ROOT",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "󰉋 node_modules",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": " src",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 4,
            "text": " app",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 4,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 4,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 6,
            "text": " layout.tsx",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 5,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 4,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 6,
            "text": " page.tsx",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 6,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 4,
            "text": " components",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 7,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 4,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 6,
            "text": " ui",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 8,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 4,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 6,
            "text": "┼",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 8,
            "text": " button.tsx",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 9,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 4,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 6,
            "text": " footer.tsx",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 10,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 4,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 6,
            "text": " header.tsx",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 11,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 4,
            "text": " lib",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 12,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 4,
            "text": "┼",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 6,
            "text": " utils.ts",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 13,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "󰉋 public",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 14,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "󰘦 package.json",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 15,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": " README.md",
            "color": { "token": "foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "timeline",
    "label": "Timeline",
    "group": "template",
    "width": 11,
    "height": 8,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "● Q1",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "Jan - Mar",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "● Q2",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 4,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "Apr - Jun",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 5,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          }
        ]
      },
      {
        "y": 6,
        "spans": [
          {
            "x": 0,
            "text": "○ Q3",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 7,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "muted-foreground" }
          },
          {
            "x": 2,
            "text": "Jul - Sep",
            "color": { "token": "foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "snippet",
    "label": "Snippet",
    "group": "template",
    "width": 29,
    "height": 3,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "npm  pnpm  yarn  bun        ",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "▔▔▔",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "npm install @xx/xx",
            "color": { "token": "foreground" }
          }
        ]
      }
    ]
  },
  {
    "id": "terminal",
    "label": "Terminal",
    "group": "template",
    "width": 44,
    "height": 10,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "╭──────────────────────────────────────────╮",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 2,
            "text": "●",
            "color": "#ff6159"
          },
          {
            "x": 3,
            "text": " ",
            "color": "#000000"
          },
          {
            "x": 4,
            "text": "●",
            "color": "#ffbd2e"
          },
          {
            "x": 5,
            "text": " ",
            "color": "#000000"
          },
          {
            "x": 6,
            "text": "●",
            "color": "#28c941"
          },
          {
            "x": 43,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "├──────────────────────────────────────────┤",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 2,
            "text": "$ ls",
            "color": "#000000"
          },
          {
            "x": 43,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 4,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 2,
            "text": "Documents Downloads Pictures",
            "color": "#3b82f6"
          },
          {
            "x": 43,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 5,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 2,
            "text": "$ cd Documents",
            "color": "#000000"
          },
          {
            "x": 43,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 6,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 2,
            "text": "$ pwd",
            "color": "#000000"
          },
          {
            "x": 43,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 7,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 2,
            "text": "/home/user/Documents",
            "color": "#28c941"
          },
          {
            "x": 43,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 8,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#000000"
          },
          {
            "x": 43,
            "text": "│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 9,
        "spans": [
          {
            "x": 0,
            "text": "╰──────────────────────────────────────────╯",
            "color": "#000000"
          }
        ]
      }
    ]
  },
  {
    "id": "phone",
    "label": "Phone",
    "group": "template",
    "width": 26,
    "height": 24,
    "rows": [
      {
        "y": 0,
        "spans": [
          {
            "x": 0,
            "text": "╭────────────────────────╮",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "│          ━━━━         │",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "│────────────────────────│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "│ 󰢽      5:25 PM   󰖩  ",
            "color": { "token": "foreground" }
          },
          {
            "x": 22,
            "text": "",
            "color": { "token": "warning" }
          },
          {
            "x": 23,
            "text": "  │",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 4,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "foreground" }
          },
          {
            "x": 25,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 5,
        "spans": [
          {
            "x": 0,
            "text": "│ Welcome Back  ",
            "color": { "token": "foreground" }
          },
          {
            "x": 16,
            "text": "󱠡",
            "color": { "token": "warning" }
          },
          {
            "x": 17,
            "text": "        │",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 6,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "foreground" }
          },
          {
            "x": 25,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 7,
        "spans": [
          {
            "x": 0,
            "text": "│    ",
            "color": { "token": "foreground" }
          },
          {
            "x": 5,
            "text": "24°C  ",
            "color": { "token": "foreground" },
            "bgColor": { "token": "surface" }
          },
          {
            "x": 11,
            "text": "",
            "color": { "token": "warning" },
            "bgColor": { "token": "surface" }
          },
          {
            "x": 12,
            "text": " Sunny",
            "color": { "token": "foreground" },
            "bgColor": { "token": "surface" }
          },
          {
            "x": 18,
            "text": "       │",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 8,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "foreground" }
          },
          {
            "x": 25,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 9,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "foreground" }
          },
          {
            "x": 25,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 10,
        "spans": [
          {
            "x": 0,
            "text": "│ ",
            "color": { "token": "foreground" }
          },
          {
            "x": 2,
            "text": "",
            "color": { "token": "warning" }
          },
          {
            "x": 3,
            "text": "°",
            "color": { "token": "danger" }
          },
          {
            "x": 4,
            "text": "   ",
            "color": { "token": "foreground" }
          },
          {
            "x": 8,
            "text": "°",
            "color": { "token": "danger" }
          },
          {
            "x": 9,
            "text": "   ",
            "color": { "token": "foreground" }
          },
          {
            "x": 12,
            "text": "",
            "color": { "token": "danger" }
          },
          {
            "x": 13,
            "text": "        ",
            "color": { "token": "foreground" }
          },
          {
            "x": 22,
            "text": "",
            "color": { "token": "danger" }
          },
          {
            "x": 23,
            "text": "  │",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 11,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "foreground" }
          },
          {
            "x": 25,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 12,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "foreground" }
          },
          {
            "x": 25,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 13,
        "spans": [
          {
            "x": 0,
            "text": "│ ",
            "color": { "token": "foreground" }
          },
          {
            "x": 2,
            "text": "",
            "color": { "token": "success" }
          },
          {
            "x": 3,
            "text": "    ",
            "color": { "token": "foreground" }
          },
          {
            "x": 7,
            "text": "",
            "color": { "token": "done" }
          },
          {
            "x": 8,
            "text": "    ",
            "color": { "token": "foreground" }
          },
          {
            "x": 12,
            "text": "",
            "color": { "token": "info" }
          },
          {
            "x": 13,
            "text": "    ",
            "color": { "token": "foreground" }
          },
          {
            "x": 17,
            "text": "",
            "color": { "token": "success" }
          },
          {
            "x": 18,
            "text": "      │",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 14,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "foreground" }
          },
          {
            "x": 25,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 15,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "foreground" }
          },
          {
            "x": 25,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 16,
        "spans": [
          {
            "x": 0,
            "text": "│     ",
            "color": { "token": "foreground" }
          },
          {
            "x": 7,
            "text": "",
            "color": { "token": "success" }
          },
          {
            "x": 8,
            "text": "    ",
            "color": { "token": "foreground" }
          },
          {
            "x": 12,
            "text": "󰋾",
            "color": { "token": "done" }
          },
          {
            "x": 13,
            "text": "    ",
            "color": { "token": "foreground" }
          },
          {
            "x": 17,
            "text": "",
            "color": { "token": "accent" }
          },
          {
            "x": 18,
            "text": "    ",
            "color": { "token": "foreground" }
          },
          {
            "x": 22,
            "text": "󰘑",
            "color": { "token": "success" }
          },
          {
            "x": 23,
            "text": "  │",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 17,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "foreground" }
          },
          {
            "x": 25,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 18,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "foreground" }
          },
          {
            "x": 25,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 19,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": { "token": "foreground" }
          },
          {
            "x": 25,
            "text": "│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 20,
        "spans": [
          {
            "x": 0,
            "text": "│   ",
            "color": { "token": "foreground" }
          },
          {
            "x": 4,
            "text": "",
            "color": { "token": "success" }
          },
          {
            "x": 5,
            "text": "       ",
            "color": { "token": "foreground" }
          },
          {
            "x": 12,
            "text": "",
            "color": { "token": "success" }
          },
          {
            "x": 13,
            "text": "           │",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 21,
        "spans": [
          {
            "x": 0,
            "text": "│────────────────────────│",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 22,
        "spans": [
          {
            "x": 0,
            "text": "│          (  )          │",
            "color": { "token": "foreground" }
          }
        ]
      },
      {
        "y": 23,
        "spans": [
          {
            "x": 0,
            "text": "╰────────────────────────╯",
            "color": { "token": "foreground" }
          }
        ]
      }
    ]
  }
] as const satisfies readonly CanvasTemplateDefinition[];
