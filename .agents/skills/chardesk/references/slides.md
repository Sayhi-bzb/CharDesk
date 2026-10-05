# Native Slides via MCP

A Slide is a sequence of named, finite pages in a shared Canvas scene. The
Agent manages the scene and pages through MCP; it does not create or edit a
structured Slide file.

Use `canvas_manage` to:

- call `list_pages` to discover stable `pageId` values and page names;
- call `create_page` or `duplicate_page` to add a page;
- call `rename_page`, `delete_page`, or `reorder_page` to maintain sequence.

Pass `pageId` to `canvas_read`, `canvas_search`, `canvas_write`,
`canvas_erase`, `canvas_fill`, or `canvas_render` when operating on a specific
page. Omitting `pageId`
uses the active page; page-targeted operations do not change the user's active
page.

Use [materials](materials.md) for the content format and
[live Canvas](live-canvas.md) for the read/write loop. The `.chardesk`
document format remains an internal product, import, export, and migration
format, not an Agent authoring interface.
