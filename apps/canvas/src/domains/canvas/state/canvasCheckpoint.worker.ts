/// <reference lib="webworker" />
import { CanvasCheckpointExecutor } from "./CanvasCheckpointExecutor";
import type {
  CanvasCheckpointWorkerRequest,
  CanvasCheckpointWorkerResponse,
} from "./canvasCheckpointProtocol";

const executor = new CanvasCheckpointExecutor();

const respond = (response: CanvasCheckpointWorkerResponse, transfer?: Transferable[]) => {
  self.postMessage(response, transfer ? { transfer } : undefined);
};

self.onmessage = async (event: MessageEvent<CanvasCheckpointWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "build") {
      await executor.build(request);
      respond({ type: "ok", requestId: request.requestId, taskId: request.taskId });
      return;
    }
    if (request.type === "append-tail") {
      const baseRevision = executor.appendTail(request.taskId, request.entries);
      respond({ type: "ok", requestId: request.requestId, taskId: request.taskId, baseRevision });
      return;
    }
    if (request.type === "finalize") {
      const result = await executor.finalize(request.taskId);
      respond({
        type: "finalized",
        requestId: request.requestId,
        taskId: request.taskId,
        ...result,
      }, [result.update.buffer as ArrayBuffer]);
      return;
    }
    if (request.type === "abort") {
      await executor.abort(request.taskId, request.databaseName);
      respond({ type: "ok", requestId: request.requestId, taskId: request.taskId });
      return;
    }
    await executor.dispose();
    respond({ type: "ok", requestId: request.requestId });
    self.close();
  } catch (error) {
    respond({
      type: "error",
      requestId: request.requestId,
      ...(request.type !== "dispose" ? { taskId: request.taskId } : {}),
      error: error instanceof Error ? error.message : "Canvas checkpoint worker failed",
    });
  }
};
