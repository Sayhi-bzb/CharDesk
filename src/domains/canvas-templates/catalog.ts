import type { TextAttributes } from "@/shared/types";

export type CanvasTemplateGroup = "template" | "component";
export type CanvasTemplateId = "button" | "badge" | "switch" | "alert" | "tabs" | "input" | "checkbox" | "radio" | "divider" | "card" | "textarea" | "status" | "accordion" | "avatar" | "breadcrumb" | "calendar" | "barChart" | "lineChart" | "table" | "pagination" | "slider" | "progress" | "scrollArea" | "amibios" | "spotify" | "safari" | "filetree" | "timeline" | "snippet" | "terminal" | "phone";
export type CanvasTemplateSpan = Readonly<{
  x: number;
  text: string;
  color: string;
  bgColor?: string;
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
            "color": "#000000",
            "bgColor": "#dbeafe"
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
            "color": "#000000",
            "bgColor": "#dcfcf3"
          },
          {
            "x": 1,
            "text": " badge",
            "color": "#0d9488",
            "bgColor": "#dcfcf3"
          },
          {
            "x": 8,
            "text": " ",
            "color": "#000000",
            "bgColor": "#dcfcf3"
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
            "color": "#000000"
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
            "color": "#0d9488"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#0d9488"
          },
          {
            "x": 2,
            "text": "󰄳",
            "color": "#0d9488"
          },
          {
            "x": 5,
            "text": "AlertTitle",
            "color": "#0d9488"
          },
          {
            "x": 23,
            "text": "│",
            "color": "#0d9488"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#0d9488"
          },
          {
            "x": 5,
            "text": "AlertDescription",
            "color": "#0d9488"
          },
          {
            "x": 23,
            "text": "│",
            "color": "#0d9488"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "╰──────────────────────╯",
            "color": "#0d9488"
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
            "color": "#000000"
          },
          {
            "x": 7,
            "text": " tab 2 ",
            "color": "#2563eb",
            "bgColor": "#eff6ff",
            "attrs": {
              "underline": true
            }
          },
          {
            "x": 14,
            "text": "| tab 3",
            "color": "#000000"
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
            "color": "#000000"
          },
          {
            "x": 6,
            "text": "[ CharDesk     |   ]",
            "color": "#000000",
            "bgColor": "#dbeafe"
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
            "color": "#000000"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "󰄱 checkbox 2",
            "color": "#000000"
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
            "color": "#000000"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "󰄳 radio 2",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "󰄰 radio 3",
            "color": "#000000"
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
            "color": "#000000"
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
            "color": "#000000"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "│CardTitle",
            "color": "#000000"
          },
          {
            "x": 20,
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
            "text": "├───────────────────┤",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "│CardContent",
            "color": "#000000"
          },
          {
            "x": 20,
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
            "x": 20,
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
            "x": 20,
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
            "x": 20,
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
            "text": "├───────────────────┤",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 8,
        "spans": [
          {
            "x": 0,
            "text": "│CardFooter",
            "color": "#000000"
          },
          {
            "x": 20,
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
            "text": "╰───────────────────╯",
            "color": "#000000"
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
            "color": "#000000"
          },
          {
            "x": 25,
            "text": "█",
            "color": "#3b82f6"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "                         │",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "Press Ctrl+S to save...",
            "color": "#6b7280"
          },
          {
            "x": 23,
            "text": "  │",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "󰦨 UTF-8  󰚰 Ln 2, Col 44   ",
            "color": "#2563eb",
            "bgColor": "#eff6ff"
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
            "color": "#22c55e"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": " Warning",
            "color": "#eab308"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": " Error",
            "color": "#ef4444"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": " Loading",
            "color": "#64748b"
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
            "color": "#000000",
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
            "color": "#000000",
            "bgColor": "#e2e8f0"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "                    ",
            "color": "#000000",
            "bgColor": "#e2e8f0"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "Accordion          󰅀",
            "color": "#000000",
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
            "color": "#0d9488"
          },
          {
            "x": 1,
            "text": " ",
            "color": "#000000"
          },
          {
            "x": 2,
            "text": "󰭕 󰭕",
            "color": "#64748b"
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
            "color": "#000000"
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
            "color": "#000000",
            "bgColor": "#f3f4f6"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "Su  Mo  Tu  We  Th  Fr  Sa",
            "color": "#9ca3af",
            "bgColor": "#f3f4f6"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "28  29  30  ",
            "color": "#9ca3af"
          },
          {
            "x": 12,
            "text": "01 ",
            "color": "#000000"
          },
          {
            "x": 15,
            "text": " 02 ",
            "color": "#1d4ed8",
            "bgColor": "#dbeafe"
          },
          {
            "x": 19,
            "text": " 03  04",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "05  06  07  08  09  10  11",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 4,
        "spans": [
          {
            "x": 0,
            "text": "12  13  14  15  16  17  18",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 5,
        "spans": [
          {
            "x": 0,
            "text": "19  20  21  22  23  24  25",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 6,
        "spans": [
          {
            "x": 0,
            "text": "26  27  28  29  30  31 ",
            "color": "#000000"
          },
          {
            "x": 23,
            "text": " 01",
            "color": "#9ca3af"
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
            "color": "#1f2937"
          },
          {
            "x": 6,
            "text": "█",
            "color": "#3b82f6"
          },
          {
            "x": 7,
            "text": "       ",
            "color": "#1f2937"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "├ ",
            "color": "#1f2937"
          },
          {
            "x": 2,
            "text": "▄",
            "color": "#3b82f6"
          },
          {
            "x": 3,
            "text": "   ",
            "color": "#1f2937"
          },
          {
            "x": 6,
            "text": "█",
            "color": "#3b82f6"
          },
          {
            "x": 7,
            "text": "   ",
            "color": "#1f2937"
          },
          {
            "x": 10,
            "text": "▆",
            "color": "#3b82f6"
          },
          {
            "x": 11,
            "text": "   ",
            "color": "#1f2937"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "│ ",
            "color": "#1f2937"
          },
          {
            "x": 2,
            "text": "█",
            "color": "#3b82f6"
          },
          {
            "x": 3,
            "text": " ",
            "color": "#1f2937"
          },
          {
            "x": 4,
            "text": "▇",
            "color": "#3b82f6"
          },
          {
            "x": 5,
            "text": " ",
            "color": "#1f2937"
          },
          {
            "x": 6,
            "text": "█",
            "color": "#3b82f6"
          },
          {
            "x": 7,
            "text": " ",
            "color": "#1f2937"
          },
          {
            "x": 8,
            "text": "▃",
            "color": "#3b82f6"
          },
          {
            "x": 9,
            "text": " ",
            "color": "#1f2937"
          },
          {
            "x": 10,
            "text": "█",
            "color": "#3b82f6"
          },
          {
            "x": 11,
            "text": " ",
            "color": "#1f2937"
          },
          {
            "x": 12,
            "text": "█",
            "color": "#3b82f6"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "└─┴─┴─┴─┴─┴─┴─",
            "color": "#1f2937"
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
            "color": "#1f2937"
          },
          {
            "x": 10,
            "text": "╭─",
            "color": "#ef4444"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "│   ",
            "color": "#1f2937"
          },
          {
            "x": 4,
            "text": "╭─╮",
            "color": "#ef4444"
          },
          {
            "x": 7,
            "text": "   ",
            "color": "#1f2937"
          },
          {
            "x": 10,
            "text": "│",
            "color": "#ef4444"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "├ ",
            "color": "#1f2937"
          },
          {
            "x": 2,
            "text": "──╯",
            "color": "#ef4444"
          },
          {
            "x": 5,
            "text": " ",
            "color": "#1f2937"
          },
          {
            "x": 6,
            "text": "│",
            "color": "#ef4444"
          },
          {
            "x": 7,
            "text": " ",
            "color": "#1f2937"
          },
          {
            "x": 8,
            "text": "╭─╯",
            "color": "#ef4444"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "│     ",
            "color": "#1f2937"
          },
          {
            "x": 6,
            "text": "╰─╯",
            "color": "#ef4444"
          }
        ]
      },
      {
        "y": 4,
        "spans": [
          {
            "x": 0,
            "text": "└─┴─┴─┴─┴─┴─┴",
            "color": "#1f2937"
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
            "color": "#ffffff",
            "bgColor": "#1f2937"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "         Head 1   Head 2   Head 3",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": " Row 1   Cell     Cell     Cell  ",
            "color": "#000000",
            "bgColor": "#d1d5db"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": " Row 2   Cell     Cell     Cell",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 4,
        "spans": [
          {
            "x": 0,
            "text": " Row 3   Cell     Cell     Cell  ",
            "color": "#000000",
            "bgColor": "#d1d5db"
          }
        ]
      },
      {
        "y": 5,
        "spans": [
          {
            "x": 0,
            "text": " TableFooter                     ",
            "color": "#ffffff",
            "bgColor": "#1f2937"
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
            "color": "#000000"
          },
          {
            "x": 17,
            "text": " 3 ",
            "color": "#1d4ed8",
            "bgColor": "#dbeafe",
            "attrs": {
              "bold": true
            }
          },
          {
            "x": 20,
            "text": "   Next >",
            "color": "#000000"
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
            "color": "#000000"
          },
          {
            "x": 7,
            "text": "────",
            "color": "#d1d5db"
          },
          {
            "x": 11,
            "text": "●────────────●",
            "color": "#3b82f6"
          },
          {
            "x": 25,
            "text": "───",
            "color": "#d1d5db"
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
            "color": "#6b7280",
            "bgColor": "#3b82f6"
          },
          {
            "x": 9,
            "text": "    ",
            "color": "#6b7280",
            "bgColor": "#f3f4f6"
          },
          {
            "x": 13,
            "text": "70%",
            "color": "#3b82f6"
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
            "color": "#000000"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "├─Item    ",
            "color": "#000000"
          },
          {
            "x": 10,
            "text": " ",
            "color": "#3b82f6"
          },
          {
            "x": 11,
            "text": "█",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "├─Item     │",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "└─Item     │",
            "color": "#000000"
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "󰉋 node_modules",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": " src",
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 4,
            "text": " app",
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 4,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 6,
            "text": " layout.tsx",
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 4,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 6,
            "text": " page.tsx",
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 4,
            "text": " components",
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 4,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 6,
            "text": " ui",
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 4,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 6,
            "text": "┼",
            "color": "#64748b"
          },
          {
            "x": 8,
            "text": " button.tsx",
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 4,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 6,
            "text": " footer.tsx",
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 4,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 6,
            "text": " header.tsx",
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 4,
            "text": " lib",
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "│",
            "color": "#64748b"
          },
          {
            "x": 4,
            "text": "┼",
            "color": "#64748b"
          },
          {
            "x": 6,
            "text": " utils.ts",
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "󰉋 public",
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "󰘦 package.json",
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": " README.md",
            "color": "#000000"
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "Jan - Mar",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "│",
            "color": "#64748b"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "● Q2",
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "Apr - Jun",
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
            "color": "#64748b"
          }
        ]
      },
      {
        "y": 6,
        "spans": [
          {
            "x": 0,
            "text": "○ Q3",
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
            "color": "#64748b"
          },
          {
            "x": 2,
            "text": "Jul - Sep",
            "color": "#000000"
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
            "color": "#000000"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "▔▔▔",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "npm install @xx/xx",
            "color": "#000000"
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
            "color": "#000000"
          }
        ]
      },
      {
        "y": 1,
        "spans": [
          {
            "x": 0,
            "text": "│          ━━━━         │",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 2,
        "spans": [
          {
            "x": 0,
            "text": "│────────────────────────│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 3,
        "spans": [
          {
            "x": 0,
            "text": "│ 󰢽      5:25 PM   󰖩  ",
            "color": "#000000"
          },
          {
            "x": 22,
            "text": "",
            "color": "#eab308"
          },
          {
            "x": 23,
            "text": "  │",
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
            "x": 25,
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
            "text": "│ Welcome Back  ",
            "color": "#000000"
          },
          {
            "x": 16,
            "text": "󱠡",
            "color": "#eab308"
          },
          {
            "x": 17,
            "text": "        │",
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
            "x": 25,
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
            "text": "│    ",
            "color": "#000000"
          },
          {
            "x": 5,
            "text": "24°C  ",
            "color": "#000000",
            "bgColor": "#86efac"
          },
          {
            "x": 11,
            "text": "",
            "color": "#eab308",
            "bgColor": "#86efac"
          },
          {
            "x": 12,
            "text": " Sunny",
            "color": "#000000",
            "bgColor": "#86efac"
          },
          {
            "x": 18,
            "text": "       │",
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
            "x": 25,
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
            "x": 25,
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
            "text": "│ ",
            "color": "#000000"
          },
          {
            "x": 2,
            "text": "",
            "color": "#eab308"
          },
          {
            "x": 3,
            "text": "°",
            "color": "#ef4444"
          },
          {
            "x": 4,
            "text": "   ",
            "color": "#000000"
          },
          {
            "x": 8,
            "text": "°",
            "color": "#ef4444"
          },
          {
            "x": 9,
            "text": "   ",
            "color": "#000000"
          },
          {
            "x": 12,
            "text": "",
            "color": "#ef4444"
          },
          {
            "x": 13,
            "text": "        ",
            "color": "#000000"
          },
          {
            "x": 22,
            "text": "",
            "color": "#ef4444"
          },
          {
            "x": 23,
            "text": "  │",
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
            "x": 25,
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
            "x": 25,
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
            "text": "│ ",
            "color": "#000000"
          },
          {
            "x": 2,
            "text": "",
            "color": "#10b981"
          },
          {
            "x": 3,
            "text": "    ",
            "color": "#000000"
          },
          {
            "x": 7,
            "text": "",
            "color": "#6366f1"
          },
          {
            "x": 8,
            "text": "    ",
            "color": "#000000"
          },
          {
            "x": 12,
            "text": "",
            "color": "#06b6d4"
          },
          {
            "x": 13,
            "text": "    ",
            "color": "#000000"
          },
          {
            "x": 17,
            "text": "",
            "color": "#22c55e"
          },
          {
            "x": 18,
            "text": "      │",
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
            "x": 25,
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
            "x": 25,
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
            "text": "│     ",
            "color": "#000000"
          },
          {
            "x": 7,
            "text": "",
            "color": "#22c55e"
          },
          {
            "x": 8,
            "text": "    ",
            "color": "#000000"
          },
          {
            "x": 12,
            "text": "󰋾",
            "color": "#ec4899"
          },
          {
            "x": 13,
            "text": "    ",
            "color": "#000000"
          },
          {
            "x": 17,
            "text": "",
            "color": "#3b82f6"
          },
          {
            "x": 18,
            "text": "    ",
            "color": "#000000"
          },
          {
            "x": 22,
            "text": "󰘑",
            "color": "#22c55e"
          },
          {
            "x": 23,
            "text": "  │",
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
            "x": 25,
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
            "x": 25,
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
            "x": 25,
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
            "text": "│   ",
            "color": "#000000"
          },
          {
            "x": 4,
            "text": "",
            "color": "#22c55e"
          },
          {
            "x": 5,
            "text": "       ",
            "color": "#000000"
          },
          {
            "x": 12,
            "text": "",
            "color": "#22c55e"
          },
          {
            "x": 13,
            "text": "           │",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 21,
        "spans": [
          {
            "x": 0,
            "text": "│────────────────────────│",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 22,
        "spans": [
          {
            "x": 0,
            "text": "│          (  )          │",
            "color": "#000000"
          }
        ]
      },
      {
        "y": 23,
        "spans": [
          {
            "x": 0,
            "text": "╰────────────────────────╯",
            "color": "#000000"
          }
        ]
      }
    ]
  }
] as const satisfies readonly CanvasTemplateDefinition[];
