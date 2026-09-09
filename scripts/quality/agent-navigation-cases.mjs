export const AGENT_NAVIGATION_CASES = [
  {
    id: "slide-size",
    question: "Where are custom slide size validation, resizing, crop, and editor coordination owned?",
    expectedOwner: "slides",
    ownerPrefixes: ["src/domains/slides/", "src/domains/canvas/state/slices/createSlideSlice.ts"],
    anchors: [
      "src/domains/slides/deck.ts:resizeSlide",
      "src/domains/canvas/state/slices/createSlideSlice.ts:resizeSlide",
    ],
  },
  {
    id: "collaboration-remote-update",
    question: "Where are remote collaborative document changes validated and projected into local editor state?",
    expectedOwner: "canvas",
    ownerPrefixes: ["src/domains/canvas/"],
    anchors: [
      "src/domains/canvas/state/canvasDocumentProjection.ts:subscribeCanvasDocumentProjection",
      "src/domains/canvas/state/CanvasDocumentRegistry.ts:observeActiveTransactions",
    ],
  },
  {
    id: "slide-preview",
    question: "Where does the slide navigator render sidebar thumbnails and keep preview geometry consistent with playback?",
    expectedOwner: "widgets",
    ownerPrefixes: ["src/widgets/toolbar/"],
    anchors: [
      "src/widgets/toolbar/slide-preview-canvas.tsx:SlidePreviewCanvas",
      "src/widgets/toolbar/slide-canvas-renderer.ts:drawSlideCanvas",
    ],
  },
  {
    id: "selection-command-registration",
    question: "Where do copy, cut, paste and delete selection actions bridge into canvas state?",
    expectedOwner: "actions",
    ownerPrefixes: ["src/domains/actions/", "src/app/compositionRoot.ts"],
    anchors: [
      "src/domains/actions/adapters/selectionCommands.ts:createSelectionCommandFactory",
      "src/app/compositionRoot.ts:createApplicationEditorHost",
    ],
  },
  {
    id: "session-persistence",
    question: "Where does the product migrate persisted sessions from earlier storage schema versions before restoring canvas state?",
    expectedOwner: "sessions",
    ownerPrefixes: [
      "src/domains/sessions/",
      "src/domains/canvas/state/editorPersistence.ts",
      "src/domains/canvas/state/editorStore.ts",
    ],
    anchors: [
      "src/domains/sessions/persistence.ts:migratePersistedStateToV7",
      "src/domains/canvas/state/editorStore.ts:migrate",
    ],
  },
  {
    id: "legacy-structured-migration",
    question: "Which capability flattens retired Structured Canvas documents into the active CellPlane model?",
    expectedOwner: "canvas",
    ownerPrefixes: ["src/domains/canvas/", "src/domains/legacy-structured/"],
    anchors: [
      "src/domains/canvas/state/migrateLegacyStructuredDocument.ts:migrateLegacyStructuredDocument",
      "src/domains/legacy-structured/scene.ts:sceneToGridEntries",
    ],
  },
  {
    id: "document-import",
    question: "Which capability owns importing the portable CharDesk document envelope, validating its protocol version and converting it to an owner-neutral snapshot?",
    expectedOwner: "document",
    ownerPrefixes: ["src/domains/document/"],
    anchors: [
      "src/domains/document/session-source.ts:parseDocumentSessionSource",
      "src/domains/document/protocol/import.ts:charDeskDocumentToSnapshot",
    ],
  },
  {
    id: "history",
    question: "Where are canvas undo redo history and interaction checkpoints owned?",
    expectedOwner: "canvas",
    ownerPrefixes: ["src/domains/canvas/"],
    anchors: [
      "src/domains/canvas/state/CanvasDocumentRegistry.ts:undo",
      "src/domains/canvas/state/CanvasDocumentRegistry.ts:beginHistoryCheckpoint",
    ],
  },
];
