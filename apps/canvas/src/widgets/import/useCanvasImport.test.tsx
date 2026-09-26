import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { feedback } from "@/shared/services/effects";
import { useCanvasImport } from "./useCanvasImport";

const {
  compileBlackboardDirectory,
  importCanvasSession,
} = vi.hoisted(() => ({
  compileBlackboardDirectory: vi.fn(),
  importCanvasSession: vi.fn(),
}));

vi.mock("@/domains/canvas/public", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/domains/canvas/public")>()),
  useCanvasRuntime: () => ({
    commands: { sessions: { import: importCanvasSession } },
  }),
}));

vi.mock("./blackboard-directory", () => ({ compileBlackboardDirectory }));

const createFileEvent = (text: () => Promise<string>) =>
  ({
    target: {
      files: [{ name: "demo.chardesk", text }],
      value: "/demo.chardesk",
    },
  }) as unknown as React.ChangeEvent<HTMLInputElement>;

const createDirectoryEvent = () => {
  const selectedFile = {
    webkitRelativePath: "gpu/blackboard.yaml",
  } as File;
  let value = "/gpu";
  const files = {
    get length() {
      return value ? 1 : 0;
    },
    item(index: number) {
      return value && index === 0 ? selectedFile : null;
    },
    *[Symbol.iterator]() {
      if (value) yield selectedFile;
    },
  } as FileList;
  const target = {
    get files() {
      return files;
    },
    get value() {
      return value;
    },
    set value(next: string) {
      value = next;
    },
  } as HTMLInputElement;

  return { target } as React.ChangeEvent<HTMLInputElement>;
};

describe("useCanvasImport", () => {
  beforeEach(() => {
    importCanvasSession.mockReset();
    compileBlackboardDirectory.mockReset();
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

  it("imports a Blackboard directory as a detached editable snapshot", async () => {
    compileBlackboardDirectory.mockResolvedValue({
      mode: "freeform",
      title: "GPU",
      source: "L R",
      warnings: [],
    });
    const { result } = renderHook(() => useCanvasImport());

    await act(async () => {
      await result.current.handleBlackboardDirectoryChange(createDirectoryEvent());
    });

    expect(compileBlackboardDirectory).toHaveBeenCalledWith([
      expect.objectContaining({ webkitRelativePath: "gpu/blackboard.yaml" }),
    ]);
    expect(importCanvasSession).toHaveBeenCalledWith([
      "---",
      "chardesk: document/v1",
      "mode: freeform",
      "title: GPU",
      "---",
      "L R",
    ].join("\n"), {
      name: "GPU",
      sourceName: "blackboard.chardesk",
    });
  });

  it("keeps an imported Blackboard Slide package editable and detached", async () => {
    compileBlackboardDirectory.mockResolvedValue({
      mode: "slide",
      title: "GPU deck",
      source: "## Intro\n\n```chargraph size=auto\nGPU\n```",
      warnings: [],
    });
    const { result } = renderHook(() => useCanvasImport());

    await act(async () => {
      await result.current.handleBlackboardDirectoryChange(createDirectoryEvent());
    });

    expect(importCanvasSession).toHaveBeenCalledWith(
      expect.stringContaining("mode: slide\ntitle: GPU deck"),
      { name: "GPU deck", sourceName: "blackboard.chardesk" },
    );
  });

  it("reports Blackboard directory failures through existing import feedback", async () => {
    compileBlackboardDirectory.mockRejectedValue(new Error("Missing blackboard.yaml"));
    const { result } = renderHook(() => useCanvasImport());

    await act(async () => {
      await result.current.handleBlackboardDirectoryChange(createDirectoryEvent());
    });

    expect(feedback.error).toHaveBeenCalledWith("Import failed", {
      description: "Missing blackboard.yaml",
    });
    expect(importCanvasSession).not.toHaveBeenCalled();
  });
});
