import { useEffect, useRef, useState } from "react";
import { useCanvasRuntime } from "@/domains/canvas/public";
import { isSourceBackedCanvasSession } from "@/domains/sessions/public";
import { parseDocumentSessionSource } from "@/domains/document/public";

type BlackboardSourceStatus =
  | { state: "idle" | "current" | "waiting"; message: string }
  | { state: "warning" | "missing" | "disconnected"; message: string };

export const useBlackboardSource = ({ enabled }: { enabled: boolean }) => {
  const canvas = useCanvasRuntime();
  const [status, setStatus] = useState<BlackboardSourceStatus>({
    state: enabled ? "waiting" : "idle",
    message: enabled ? "Waiting for the board" : "",
  });
  const [firstFitRevision, setFirstFitRevision] = useState(0);
  const etagRef = useRef<string | null>(null);
  const hasValidRevisionRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const existing = canvas.getState().canvasSessions.find(
      (session) => isSourceBackedCanvasSession(session) &&
        session.sourceBinding.provider === "local-reader",
    );
    if (!existing) {
      canvas.commands.sessions.openSource({
        kind: "blackboard",
        provider: "local-reader",
        id: "local-reader",
      }, {
        name: "Blackboard",
      });
    } else if (existing.id !== canvas.getState().activeCanvasId) {
      void canvas.commands.sessions.switch(existing.id);
    }
    let disposed = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    let readyReported = false;
    const reportReady = () => {
      if (readyReported) return;
      readyReported = true;
      void fetch(new URL("ready", document.baseURI), { method: "POST" })
        .catch(() => undefined);
    };

    const schedule = () => {
      if (!disposed) timer = window.setTimeout(poll, 500);
    };
    const poll = async () => {
      controller = new AbortController();
      try {
        const response = await fetch(new URL("board", document.baseURI), {
          headers: etagRef.current ? { "If-None-Match": etagRef.current } : {},
          signal: controller.signal,
          cache: "no-store",
        });
        if (response.status === 304) {
          setStatus({ state: "current", message: "Current" });
          reportReady();
          return;
        }
        if (response.status === 404) {
          setStatus(hasValidRevisionRef.current
            ? { state: "missing", message: "Source missing; showing the last board" }
            : { state: "waiting", message: "Waiting for the board" });
          return;
        }
        if (!response.ok) {
          setStatus({
            state: "disconnected",
            message: `Reader unavailable (${response.status}); showing the last board`,
          });
          return;
        }

        const source = await response.text();
        const sourceName = response.headers.get("X-CharDesk-Source-Name") ?? "board.chardesk";
        const snapshot = await parseDocumentSessionSource(source, { sourceName });
        const preserveViewport = hasValidRevisionRef.current;
        const target = canvas.getState().canvasSessions.find(
          (session) => isSourceBackedCanvasSession(session) &&
            session.sourceBinding.provider === "local-reader",
        );
        if (!target) throw new Error("Local Blackboard session is unavailable.");
        const title = sourceName.replace(/\.chardesk$/i, "") || "Blackboard";
        canvas.commands.sessions.applySourceProjection(target.id, snapshot, {
          preserveViewport,
          title,
        });
        if (!hasValidRevisionRef.current) {
          hasValidRevisionRef.current = true;
          setFirstFitRevision((revision) => revision + 1);
        }
        etagRef.current = response.headers.get("ETag");
        setStatus({ state: "current", message: "Current" });
        reportReady();
      } catch (error) {
        if (disposed || controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Invalid Blackboard source";
        setStatus(
          error instanceof TypeError
            ? { state: "disconnected", message: "Reader disconnected; showing the last board" }
            : { state: "warning", message }
        );
      } finally {
        schedule();
      }
    };

    void poll();
    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [canvas, enabled]);

  return { status, firstFitRevision };
};
