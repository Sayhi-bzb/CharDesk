import { createStore } from "zustand/vanilla";
import { describe, expect, it, vi } from "vitest";
import { CanvasStateCommitCoordinator } from "./CanvasStateCommitCoordinator";

type TestState = {
  count: number;
  label: string;
};

const createFixture = () => {
  const store = createStore<TestState>()(() => ({ count: 0, label: "idle" }));
  return {
    store,
    commits: new CanvasStateCommitCoordinator(store),
  };
};

describe("CanvasStateCommitCoordinator", () => {
  it("shares one draft across nested commands and publishes it once", () => {
    const { store, commits } = createFixture();
    const listener = vi.fn();
    store.subscribe(listener);

    const result = commits.run(() => {
      commits.setState({ count: 1 });
      expect(commits.getState()).toEqual({ count: 1, label: "idle" });

      commits.run(() => {
        expect(commits.getState().count).toBe(1);
        commits.setState((state) => ({ label: `${state.count}:ready` }));
      });

      expect(listener).not.toHaveBeenCalled();
      return "complete";
    });

    expect(result).toBe("complete");
    expect(store.getState()).toEqual({ count: 1, label: "1:ready" });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("does not publish an unchanged state", () => {
    const { store, commits } = createFixture();
    const listener = vi.fn();
    store.subscribe(listener);

    commits.run(() => commits.setState((state) => state));

    expect(listener).not.toHaveBeenCalled();
  });

  it("publishes committed work before deferred effects", () => {
    const { store, commits } = createFixture();
    const events: string[] = [];
    const report = () => events.push(`report:${store.getState().count}`);
    store.subscribe(() => events.push("publish"));

    commits.run(() => {
      commits.setState({ count: 2 });
      commits.deferUntilCommitted(report);
      commits.deferUntilCommitted(report);
    });

    expect(events).toEqual(["publish", "report:2"]);
  });

  it("publishes mutations that occurred before an error and rethrows it", () => {
    const { store, commits } = createFixture();

    expect(() => commits.run(() => {
      commits.setState({ count: 3 });
      throw new Error("command failed");
    })).toThrow("command failed");

    expect(store.getState().count).toBe(3);
  });

  it("delegates updates immediately outside a command", () => {
    const { store, commits } = createFixture();
    const listener = vi.fn();
    store.subscribe(listener);

    commits.setState({ count: 4 });

    expect(store.getState().count).toBe(4);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("rejects commands that cross an async boundary", () => {
    const { commits } = createFixture();

    expect(() => {
      commits.run(async () => "later");
    }).toThrow("cannot span an async boundary");
  });

  it("scopes document history modes across nested commands", () => {
    const { commits } = createFixture();

    expect(commits.getDocumentHistoryMode()).toBeUndefined();
    commits.withHistory("save", () => {
      expect(commits.getDocumentHistoryMode()).toBe("merge");
      commits.withHistory("none", () => {
        expect(commits.getDocumentHistoryMode()).toBe("none");
      });
      expect(commits.getDocumentHistoryMode()).toBe("merge");
    });
    expect(commits.getDocumentHistoryMode()).toBeUndefined();
  });
});
