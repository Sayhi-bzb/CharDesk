export const AGENT_NAVIGATION_CASES = [
  {
    id: "slide-size",
    question: "Where are custom slide size validation, resizing, crop, and editor coordination owned?",
    expectedOwner: "slides",
    ownerPrefixes: ["apps/canvas/src/domains/slides/", "apps/canvas/src/domains/canvas/state/canvasSlideCommands.ts"],
    anchors: [
      "apps/canvas/src/domains/slides/deck.ts:resizeSlide",
      "apps/canvas/src/domains/canvas/state/canvasSlideCommands.ts:resizeSlide",
    ],
  },
  {
    id: "collaboration-remote-update",
    question: "Where are remote collaborative document changes validated and projected into local editor state?",
    expectedOwner: "canvas",
    ownerPrefixes: ["apps/canvas/src/domains/canvas/"],
    anchors: [
      "apps/canvas/src/domains/canvas/state/canvasDocumentProjection.ts:subscribeCanvasDocumentProjection",
      "apps/canvas/src/domains/canvas/state/CanvasDocumentRegistry.ts:observeActiveTransactions",
    ],
  },
  {
    id: "slide-preview",
    question: "Where does the slide navigator render sidebar thumbnails and keep preview geometry consistent with playback?",
    expectedOwner: "widgets",
    ownerPrefixes: ["apps/canvas/src/widgets/toolbar/"],
    anchors: [
      "apps/canvas/src/widgets/toolbar/slide-preview-canvas.tsx:SlidePreviewCanvas",
      "apps/canvas/src/widgets/toolbar/slide-canvas-renderer.ts:drawSlideCanvas",
    ],
  },
  {
    id: "selection-command-registration",
    question: "Where do copy, cut, paste and delete selection actions bridge into canvas state?",
    expectedOwner: "actions",
    ownerPrefixes: ["apps/canvas/src/domains/actions/", "apps/canvas/src/app/compositionRoot.ts"],
    anchors: [
      "apps/canvas/src/domains/actions/adapters/selectionCommands.ts:createSelectionCommandFactory",
      "apps/canvas/src/app/compositionRoot.ts:createApplicationEditorHost",
    ],
  },
  {
    id: "session-persistence",
    question: "Where does the product migrate persisted sessions from earlier storage schema versions before restoring canvas state?",
    expectedOwner: "sessions",
    ownerPrefixes: [
      "apps/canvas/src/domains/sessions/",
      "apps/canvas/src/domains/canvas/state/editorPersistence.ts",
      "apps/canvas/src/domains/canvas/state/editorStore.ts",
    ],
    anchors: [
      "apps/canvas/src/domains/sessions/persistence.ts:migratePersistedStateToV7",
      "apps/canvas/src/domains/canvas/state/editorStore.ts:migrate",
    ],
  },
  {
    id: "legacy-structured-migration",
    question: "Which capability flattens retired Structured Canvas documents into the active CellPlane model?",
    expectedOwner: "canvas",
    ownerPrefixes: ["apps/canvas/src/domains/canvas/", "apps/canvas/src/domains/legacy-structured/"],
    anchors: [
      "apps/canvas/src/domains/canvas/state/migrateLegacyStructuredDocument.ts:migrateLegacyStructuredDocument",
      "apps/canvas/src/domains/legacy-structured/scene.ts:sceneToGridEntries",
    ],
  },
  {
    id: "document-import",
    question: "Which capability owns importing the portable CharDesk document envelope, validating its protocol version and converting it to an owner-neutral snapshot?",
    expectedOwner: "document",
    ownerPrefixes: ["apps/canvas/src/domains/document/"],
    anchors: [
      "apps/canvas/src/domains/document/session-source.ts:parseDocumentSessionSource",
      "apps/canvas/src/domains/document/protocol/import.ts:charDeskDocumentToSnapshot",
    ],
  },
  {
    id: "history",
    question: "Where are canvas undo redo history and interaction checkpoints owned?",
    expectedOwner: "canvas",
    ownerPrefixes: ["apps/canvas/src/domains/canvas/"],
    anchors: [
      "apps/canvas/src/domains/canvas/state/CanvasDocumentRegistry.ts:undo",
      "apps/canvas/src/domains/canvas/state/CanvasDocumentRegistry.ts:beginHistoryCheckpoint",
    ],
  },
];
