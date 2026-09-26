import { describe, expect, it } from "vitest";
import { CanvasCheckpointService } from "./CanvasCheckpointService";

describe("CanvasCheckpointService", () => {
  it("does not build below every checkpoint threshold", async () => {
    let builds = 0;
    const service = new CanvasCheckpointService({
      getGeneration: () => 2,
      getRevision: () => 3,
      getMetrics: () => ({
        yjsStructs: 9_999,
        operations: 4_999,
        authorityPayloadBytes: 64 * 1024 * 1024 - 1,
      }),
      build: async () => {
        builds += 1;
        return { generation: 3, baseRevision: 3 };
      },
      verify: async () => undefined,
      commit: async () => ({}),
      abort: async () => undefined,
    });

    expect(await service.run()).toBe(false);
    expect(builds).toBe(0);
  });

  it("rebuilds a candidate from the latest semantic revision before commit", async () => {
    let revision = 7;
    const builtAt: number[] = [];
    const aborted: number[] = [];
    const committed: number[] = [];
    const service = new CanvasCheckpointService({
      getGeneration: () => 4,
      getRevision: () => revision,
      getMetrics: () => ({
        yjsStructs: 10_000,
        operations: 1,
        authorityPayloadBytes: 1,
      }),
      build: async (generation, baseRevision) => {
        builtAt.push(baseRevision);
        if (builtAt.length === 1) revision += 2;
        return { generation, baseRevision };
      },
      verify: async () => undefined,
      commit: async (candidate) => {
        committed.push(candidate.baseRevision);
        return {};
      },
      abort: async (candidate) => { aborted.push(candidate.baseRevision); },
    });

    expect(await service.run()).toBe(true);
    expect(builtAt).toEqual([7, 9]);
    expect(aborted).toEqual([7]);
    expect(committed).toEqual([9]);
    expect(service.getDiagnostics()).toMatchObject({
      phase: "idle",
      generation: 5,
      baseRevision: 9,
      tailActions: 2,
      error: null,
    });
  });

  it("aborts a verified candidate when the revision changes again", async () => {
    let revision = 1;
    const aborted: number[] = [];
    const service = new CanvasCheckpointService({
      getGeneration: () => 0,
      getRevision: () => revision,
      getMetrics: () => ({
        yjsStructs: 0,
        operations: 5_000,
        authorityPayloadBytes: 0,
      }),
      build: async (generation, baseRevision) => ({ generation, baseRevision }),
      verify: async () => { revision += 1; },
      commit: async () => ({}),
      abort: async (candidate) => { aborted.push(candidate.baseRevision); },
    });

    expect(await service.run()).toBe(false);
    expect(aborted).toEqual([1]);
    expect(service.getDiagnostics().phase).toBe("idle");
  });

  it.each(["build", "verify", "commit"] as const)(
    "keeps the old generation when %s fails",
    async (phase) => {
      const aborted: number[] = [];
      const service = new CanvasCheckpointService({
        getGeneration: () => 6,
        getRevision: () => 10,
        getMetrics: () => ({
          yjsStructs: 10_000,
          operations: 0,
          authorityPayloadBytes: 0,
        }),
        build: async (generation, baseRevision) => {
          if (phase === "build") throw new Error("build failed");
          return { generation, baseRevision };
        },
        verify: async () => {
          if (phase === "verify") throw new Error("verify failed");
        },
        commit: async () => {
          if (phase === "commit") throw new Error("commit failed");
          return {};
        },
        abort: async (candidate) => { aborted.push(candidate.generation); },
      });

      expect(await service.run()).toBe(false);
      expect(service.getDiagnostics()).toMatchObject({
        phase: "failed",
        generation: 7,
        error: `${phase} failed`,
      });
      expect(aborted).toEqual(phase === "build" ? [] : [7]);
    }
  );

  it("aborts an in-flight candidate when its document is released", async () => {
    let finishBuild!: () => void;
    const gate = new Promise<void>((resolve) => { finishBuild = resolve; });
    const aborted: number[] = [];
    const service = new CanvasCheckpointService({
      getGeneration: () => 0,
      getRevision: () => 1,
      getMetrics: () => ({
        yjsStructs: 10_000,
        operations: 0,
        authorityPayloadBytes: 0,
      }),
      build: async (generation, baseRevision) => {
        await gate;
        return { generation, baseRevision };
      },
      verify: async () => undefined,
      commit: async () => ({}),
      abort: async (candidate) => { aborted.push(candidate.generation); },
    });

    const running = service.run();
    service.cancel();
    finishBuild();

    expect(await running).toBe(false);
    expect(aborted).toEqual([1]);
    expect(service.getDiagnostics()).toMatchObject({ phase: "idle", error: null });
  });
});
