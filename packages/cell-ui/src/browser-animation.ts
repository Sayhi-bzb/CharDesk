import { useEffect, useRef, useState } from "react";
import { cellAnimationFrameAt, resolveCellAnimationFramePolicy, type CellAnimationClock } from "./animation.js";

export const useCellAnimationClock = (options: Readonly<{
  fps?: number;
  playing?: boolean;
  reducedMotion?: boolean;
}> = {}): CellAnimationClock => {
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setSystemReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const policy = resolveCellAnimationFramePolicy({ ...options, reducedMotion: options.reducedMotion ?? systemReducedMotion });
  const playing = options.playing !== false && !policy.reducedMotion;
  const [now, setNow] = useState(() => (typeof performance === "undefined" ? 0 : performance.now()));
  const started = useRef<number | null>(playing ? now : null);
  const accumulated = useRef(0);
  const previousPlaying = useRef(playing);
  useEffect(() => {
    if (previousPlaying.current === playing) return;
    const time = typeof performance === "undefined" ? now : performance.now();
    if (playing) started.current = time;
    else if (started.current !== null) {
      accumulated.current += Math.max(0, time - started.current);
      started.current = null;
    }
    previousPlaying.current = playing;
    setNow(time);
  }, [now, playing]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = (time: number) => {
      setNow(time);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  const elapsedMs = accumulated.current + (playing && started.current !== null ? Math.max(0, now - started.current) : 0);
  return {
    elapsedMs,
    frame: cellAnimationFrameAt(elapsedMs, policy.fps),
    fps: policy.fps,
    playing,
    reducedMotion: policy.reducedMotion,
  };
};
