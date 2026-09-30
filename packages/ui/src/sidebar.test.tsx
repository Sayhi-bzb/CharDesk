import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SidebarProvider,
  SidebarStandard,
  SidebarTrigger,
} from "./sidebar.js";

describe("SidebarStandard scrolling", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("uses the shared ScrollArea by default", () => {
    const { container } = render(
      <SidebarProvider>
        <SidebarStandard>Content</SidebarStandard>
      </SidebarProvider>
    );

    const content = container.querySelector('[data-slot="sidebar-content"]');

    expect(content).not.toHaveAttribute("data-scroll-area");
    expect(content).toHaveClass("group/content-scroll-area");
    expect(
      content?.querySelector('[data-slot="scroll-area-viewport"]')
    ).toBeInTheDocument();
    expect(
      content?.querySelector('[data-slot="sidebar-scroll-content"]')
    ).toHaveTextContent("Content");
    expect(
      content?.querySelector('[data-slot="scroll-area-scrollbar"]')
    ).toBeInTheDocument();
    expect(content).not.toHaveClass("px-2", "py-2");
    expect(
      content?.querySelector('[data-slot="sidebar-scroll-content"]')
    ).toHaveClass("px-2", "py-2");
  });

  it("focuses the mobile panel rather than its search input on every open", async () => {
    render(
      <SidebarProvider presentation="sheet">
        <SidebarTrigger />
        <SidebarStandard><input type="search" aria-label="Search content" /></SidebarStandard>
      </SidebarProvider>
    );
    const trigger = screen.getByRole("button", { name: /toggle sidebar/i });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog).toHaveFocus());
    const search = screen.getByRole("searchbox", { name: "Search content" });
    expect(search).not.toHaveFocus();
    search.focus();
    expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
    expect(screen.getByRole("searchbox", { name: "Search content" })).not.toHaveFocus();
  });

  it("provides the compact desktop sidebar dimensions", () => {
    const { container } = render(
      <SidebarProvider>
        <SidebarStandard>Content</SidebarStandard>
      </SidebarProvider>
    );

    expect(container.querySelector('[data-slot="sidebar-wrapper"]')).toHaveStyle({
      "--sidebar-width": "16rem",
      "--sidebar-width-icon": "2.5rem",
      "--sidebar-height": "32rem",
      "--sidebar-height-collapsed": "3rem",
    });
  });

  it("supports composite layouts that own their inner scroll area", () => {
    const { container } = render(
      <SidebarProvider>
        <SidebarStandard contentScroll="none">Content</SidebarStandard>
      </SidebarProvider>
    );

    const content = container.querySelector('[data-slot="sidebar-content"]');

    expect(content).toHaveClass("overflow-hidden");
    expect(
      content?.querySelector('[data-slot="scroll-area-viewport"]')
    ).not.toBeInTheDocument();
  });

  it("keeps one toggle in place while switching its sidebar icon", () => {
    const { container } = render(
      <SidebarProvider defaultOpen>
        <SidebarStandard
          side="right"
          variant="floating"
          collapsedAppearance="trigger"
        >
          Content
        </SidebarStandard>
      </SidebarProvider>
    );

    const toggle = screen.getByRole("button", { name: /toggle sidebar/i });
    const sidebar = container.querySelector('[data-slot="sidebar"]');
    const surface = container.querySelector<HTMLElement>(
      '[data-slot="sidebar-container"]'
    )!;
    expect(sidebar).toHaveClass("overflow-visible");
    expect(toggle.querySelector("svg")).toHaveClass("lucide-panel-right-close");
    expect(surface).toHaveAttribute("data-motion-phase", "expanded");
    expect(surface).toHaveClass(
      "h-[var(--chardesk-sidebar-height)]",
      "[--chardesk-sidebar-height:100%]",
      "pointer-events-auto",
      "transition-[--chardesk-sidebar-height,background-color,box-shadow]",
      "duration-[var(--motion-standard)]",
      "ease-[cubic-bezier(0.22,1,0.36,1)]"
    );

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: /toggle sidebar/i })).toBe(toggle);
    expect(toggle.querySelector("svg")).toHaveClass("lucide-panel-right-open");
    expect(container.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      "data-state",
      "collapsed"
    );
    expect(container.querySelector('[data-slot="sidebar-container"]')).toBe(
      surface
    );
    expect(surface).toHaveAttribute("data-motion-phase", "collapsing");
    expect(surface).toHaveClass(
      "[--chardesk-sidebar-height:var(--sidebar-height-collapsed)]"
    );
    expect(surface).not.toHaveClass("[--chardesk-sidebar-height:100%]");
    expect(surface).toHaveClass("bg-host-surface", "shadow-host");

    fireEvent.transitionEnd(surface, {
      propertyName: "--chardesk-sidebar-height",
    });

    expect(surface).toHaveAttribute("data-motion-phase", "collapsed");
    expect(surface).toHaveClass("bg-transparent", "shadow-none");

    fireEvent.click(toggle);

    expect(surface).toHaveAttribute("data-motion-phase", "expanding");
    expect(surface).toHaveClass(
      "[--chardesk-sidebar-height:100%]",
      "bg-host-surface",
      "shadow-host"
    );

    fireEvent.click(toggle);

    expect(surface).toHaveAttribute("data-motion-phase", "collapsing");
    expect(surface).toHaveClass(
      "[--chardesk-sidebar-height:var(--sidebar-height-collapsed)]",
      "bg-host-surface",
      "shadow-host"
    );

    fireEvent.click(toggle);
    fireEvent.transitionEnd(surface, {
      propertyName: "--chardesk-sidebar-height",
    });

    expect(surface).toHaveAttribute("data-motion-phase", "expanded");
    expect(surface).toHaveClass("[--chardesk-sidebar-height:100%]");
  });

  it("settles trigger collapse immediately when reduced motion is enabled", () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { container } = render(
      <SidebarProvider defaultOpen>
        <SidebarStandard variant="floating" collapsedAppearance="trigger">
          Content
        </SidebarStandard>
      </SidebarProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /toggle sidebar/i }));

    const surface = container.querySelector('[data-slot="sidebar-container"]');
    expect(surface).toHaveAttribute("data-motion-phase", "collapsed");
    expect(surface).toHaveClass(
      "[--chardesk-sidebar-height:var(--sidebar-height-collapsed)]",
      "bg-transparent",
      "shadow-none"
    );
  });

  it("settles when the browser omits the height transition event", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <SidebarProvider defaultOpen>
          <SidebarStandard variant="floating" collapsedAppearance="trigger">
            Content
          </SidebarStandard>
        </SidebarProvider>
      );

      fireEvent.click(screen.getByRole("button", { name: /toggle sidebar/i }));
      const surface = container.querySelector(
        '[data-slot="sidebar-container"]'
      );
      expect(surface).toHaveAttribute("data-motion-phase", "collapsing");

      act(() => vi.advanceTimersByTime(250));

      expect(surface).toHaveAttribute("data-motion-phase", "collapsed");
      expect(surface).toHaveClass("bg-transparent", "shadow-none");
    } finally {
      vi.useRealTimers();
    }
  });
});
