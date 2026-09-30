import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { feedback } from "@/shared/services/effects";
import { useCanvasImport } from "./useCanvasImport";

const { importCanvasSession } = vi.hoisted(() => ({ importCanvasSession: vi.fn() }));

vi.mock("@/domains/canvas/public", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/domains/canvas/public")>()),
  useCanvasRuntime: () => ({
    commands: { sessions: { import: importCanvasSession } },
  }),
}));


const createFileEvent = (text: () => Promise<string>) =>
  ({
    target: {
      files: [{ name: "demo.chardesk", text }],
      value: "/demo.chardesk",
    },
  }) as unknown as React.ChangeEvent<HTMLInputElement>;

const directoryEntry = { isDirectory: true } as FileSystemDirectoryEntry;
const directoryItems = [{ webkitGetAsEntry: () => directoryEntry }] as unknown as DataTransferItem[];

describe("useCanvasImport", () => {
  beforeEach(() => {
    importCanvasSession.mockReset();
    vi.spyOn(feedback, "success").mockImplementation(() => undefined);
    vi.spyOn(feedback, "error").mockImplementation(() => undefined);
  });

  it("uses the created session as success feedback without opening a toast", async () => {
    importCanvasSession.mockReturnValue({ name: "demo" });
    const { result } = renderHook(() => useCanvasImport());

    await act(async () => {
      await result.current.handleFileChange(createFileEvent(async () => "hello"));
    });

    expect(importCanvasSession).toHaveBeenCalledWith("hello", {
      name: "demo",
      sourceName: "demo.chardesk",
    });
    expect(feedback.success).not.toHaveBeenCalled();
  });

  it("keeps import failures as global feedback", async () => {
    importCanvasSession.mockImplementation(() => {
      throw new Error("Invalid document");
    });
    const { result } = renderHook(() => useCanvasImport());

    await act(async () => {
      await result.current.handleFileChange(createFileEvent(async () => "invalid"));
    });

    expect(feedback.error).toHaveBeenCalledWith("Import failed", {
      description: "Invalid document",
    });
  });

  it("rejects legacy directories instead of compiling source", async () => {
    const { result } = renderHook(() => useCanvasImport());
    await act(async () => { await result.current.handleDrop(directoryItems, []); });
    expect(importCanvasSession).not.toHaveBeenCalled();
    expect(feedback.error).toHaveBeenCalledWith("Import failed", {
      description: "Drop one document.",
    });
  });

  it("rejects ambiguous drops without importing anything", async () => {
    const { result } = renderHook(() => useCanvasImport());

    await act(async () => {
      await result.current.handleDrop([], []);
    });

    expect(feedback.error).toHaveBeenCalledWith("Import failed", {
      description: "Drop one document.",
    });
    expect(importCanvasSession).not.toHaveBeenCalled();
  });
});
