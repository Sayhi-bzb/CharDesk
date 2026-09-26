import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CellUiRuntime, Link, Root } from "./index.js";
import { SemanticDom } from "./browser.js";

afterEach(cleanup);

it("exposes href and aria-current through the browser semantic link", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 20, height: 2 } });
  const frame = runtime.render(<Root><Link id="guide" href="#/guides/markdown"
    label="Markdown guide" current="page">Markdown</Link></Root>);
  const onAction = vi.fn();
  render(<SemanticDom snapshot={frame.semantics} onAction={onAction} />);
  const link = screen.getByRole("link", { name: "Markdown guide" });
  expect(link).toHaveAttribute("href", "#/guides/markdown");
  expect(link).toHaveAttribute("aria-current", "page");
  fireEvent.click(link);
  expect(onAction).toHaveBeenCalledWith("guide", "activate");
  runtime.dispose();
});

it("secures a new-tab semantic link", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 } });
  const frame = runtime.render(<Root><Link id="github" href="https://github.com" target="_blank">GitHub</Link></Root>);
  render(<SemanticDom snapshot={frame.semantics} onAction={vi.fn()} />);
  expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute("target", "_blank");
  expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute("rel", "noopener noreferrer");
  runtime.dispose();
});
