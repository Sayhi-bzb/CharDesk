import { RGBA } from '@opentui/core';
import { intersectCellRects, type CellRect } from '@chardesk/cell-core';
import type { CanvasActivityEvent, CanvasAgents } from '@chardesk/local-runtime/agents';
import type { CanvasSurface } from './surface.ts';
import { MAX_WRITE_UNITS, TachyonEffects, type ReadPulse, type WriteSweep } from './tachyonfx.ts';
import { activityBadges } from './activityBadges.ts';
import { MutationPresentation } from './mutationPresentation.ts';

type Entry = {
  event: CanvasActivityEvent;
  pulse: ReadPulse | null;
  alpha: number;
  time: number;
  expires: number;
  mutation?: { presentation: MutationPresentation; sweep: WriteSweep };
};
const RECENT_MS = 10_000;
const ROLE_SLOTS = [4, 5, 6, 3, 2] as const;
const roleSlot = (id: string) => {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  return ROLE_SLOTS[(hash >>> 0) % ROLE_SLOTS.length]!;
};

export class TerminalActivityEffects {
  #effects?: TachyonEffects;
  #entries = new Map<string, Entry>();
  #stop?: () => void;
  #expiry?: ReturnType<CanvasSurface['renderer']['clock']['setTimeout']>;
  #disposers: Array<() => void>;
  constructor(
    private surface: CanvasSurface,
    agents: CanvasAgents,
    private canvasId: () => string | undefined
  ) {
    this.#disposers = [
      agents.subscribeActivity((event) => this.#activity(event)),
      surface.model.subscribe(() => this.#validate()),
    ];
  }
  #current(event: CanvasActivityEvent) {
    const documents = this.surface.model.documents;
    const address = documents.getActiveAddress();
    return (
      event.canvasId === this.canvasId() &&
      event.documentId === address.documentId &&
      event.pageId === address.pageId &&
      event.version === documents.getContentVersion()
    );
  }
  #activity(event: CanvasActivityEvent) {
    if (!this.#current(event)) return;
    this.#effects ??= new TachyonEffects();
    const previous = this.#entries.get(event.agent.id);
    previous?.pulse?.dispose();
    this.#entries.delete(event.agent.id);
    if (this.#entries.size === 8) {
      const [id, oldest] = this.#entries.entries().next().value!;
      oldest.pulse?.dispose();
      this.#entries.delete(id);
    }
    const presentation =
      event.kind !== 'read'
        ? new MutationPresentation(event, this.surface.model.viewport)
        : undefined;
    const mutation =
      presentation && presentation.units > 0 && presentation.units <= MAX_WRITE_UNITS
        ? { presentation, sweep: this.#effects.write(presentation.units, presentation.duration) }
        : undefined;
    this.#entries.set(event.agent.id, {
      event,
      pulse: mutation?.sweep ?? (event.kind === 'read' ? this.#effects.read() : null),
      mutation,
      alpha: 0,
      time: this.surface.renderer.clock.now(),
      expires: this.surface.renderer.clock.now() + RECENT_MS,
    });
    if ([...this.#entries.values()].some((entry) => entry.pulse))
      this.#stop ??= this.surface.renderer.onAnimationTick(30, () => this.#tick());
    this.#scheduleExpiry();
    this.surface.requestRender();
  }
  #validate() {
    for (const [id, entry] of this.#entries)
      if (!this.#current(entry.event) || entry.expires <= this.surface.renderer.clock.now()) {
        entry.pulse?.dispose();
        this.#entries.delete(id);
      }
    this.#idle();
    this.#scheduleExpiry();
  }
  #scheduleExpiry() {
    const clock = this.surface.renderer.clock;
    if (this.#expiry !== undefined) clock.clearTimeout(this.#expiry);
    this.#expiry = undefined;
    if (!this.#entries.size) return;
    const next = Math.min(...[...this.#entries.values()].map((entry) => entry.expires));
    this.#expiry = clock.setTimeout(
      () => {
        this.#expiry = undefined;
        this.#validate();
        this.surface.requestRender();
      },
      Math.max(0, next - clock.now())
    );
  }
  #idle() {
    if (![...this.#entries.values()].some((entry) => entry.pulse)) {
      this.#stop?.();
      this.#stop = undefined;
    }
  }
  #tick() {
    const now = this.surface.renderer.clock.now();
    for (const entry of this.#entries.values()) {
      if (!entry.pulse) continue;
      const alpha = entry.pulse.advance(Math.max(0, now - entry.time));
      entry.time = now;
      if (alpha === null) {
        entry.pulse = null;
        entry.alpha = 0;
        entry.mutation = undefined;
      } else if (entry.mutation) entry.mutation.presentation.visible = alpha;
      else entry.alpha = alpha;
    }
    this.#idle();
    this.surface.requestRender();
  }
  #tint(entry: Entry, base: RGBA, strength = entry.alpha) {
    const palette = this.surface.appearance.getSnapshot().palette;
    if (strength <= 0) return base;
    if (!palette) return strength >= 0.12 ? RGBA.fromIndex(roleSlot(entry.event.agent.id)) : base;
    const actor = RGBA.fromHex(palette.slots[roleSlot(entry.event.agent.id)] ?? palette.foreground);
    const amount = strength * 0.2;
    return RGBA.fromValues(
      base.r + (actor.r - base.r) * amount,
      base.g + (actor.g - base.g) * amount,
      base.b + (actor.b - base.b) * amount,
      base.a
    );
  }
  background(x: number, y: number, width: number, base: RGBA) {
    const area = { x, y, width, height: 1 };
    for (const entry of [...this.#entries.values()].reverse()) {
      const feedback = entry.mutation?.presentation.feedback;
      if (feedback && intersectCellRects(area, feedback)) return this.#tint(entry, base, 1);
      if (!entry.mutation && intersectCellRects(area, entry.event.bounds))
        return this.#tint(entry, base);
    }
    return base;
  }
  regions(viewport: CellRect) {
    return [...this.#entries.values()].flatMap((entry) => {
      const feedback = entry.mutation ? entry.mutation.presentation.feedback : entry.event.bounds;
      const bounds = feedback && intersectCellRects(feedback, viewport);
      const color = this.#tint(
        entry,
        this.surface.colors.background,
        entry.mutation ? 1 : entry.alpha
      );
      return bounds && color !== this.surface.colors.background ? [{ bounds, color }] : [];
    });
  }
  get presentation() {
    return [...this.#entries.values()].find((entry) => entry.mutation)?.mutation?.presentation;
  }
  get writeCursor() {
    for (const entry of this.#entries.values()) {
      const cursor = entry.mutation?.presentation.cursor;
      if (cursor)
        return {
          ...cursor,
          color: RGBA.fromIndex(
            roleSlot(entry.event.agent.id),
            this.surface.appearance.getSnapshot().palette?.slots[roleSlot(entry.event.agent.id)] ??
              undefined
          ),
        };
    }
    return null;
  }
  finishMutations() {
    let changed = false;
    for (const entry of this.#entries.values())
      if (entry.mutation) {
        entry.pulse?.dispose();
        entry.pulse = null;
        entry.mutation = undefined;
        entry.alpha = 0;
        changed = true;
      }
    this.#idle();
    if (changed) this.surface.requestRender();
  }
  badges(viewport: CellRect, blocked: (rect: CellRect) => boolean) {
    const entries = [...this.#entries.values()]
      .reverse()
      .filter((entry) => entry.expires > this.surface.renderer.clock.now());
    return activityBadges(
      entries.map((entry) => ({ id: entry.event.agent.id, bounds: entry.event.bounds })),
      viewport,
      blocked
    ).map((badge) => ({
      ...badge,
      color: RGBA.fromIndex(
        roleSlot(badge.id),
        this.surface.appearance.getSnapshot().palette?.slots[roleSlot(badge.id)] ?? undefined
      ),
    }));
  }
  locate(id: string) {
    const entry = this.#entries.get(id);
    if (!entry || entry.expires <= this.surface.renderer.clock.now() || !this.#current(entry.event))
      return;
    const badge = activityBadges(
      [{ id, bounds: entry.event.bounds }],
      this.surface.model.viewport
    )[0];
    if (!badge) return;
    this.surface.cancelGesture();
    this.surface.inspector?.blur();
    this.surface.model.editor.transact(() => this.surface.model.focusPoint(badge.target));
    if (this.#entries.get(id) !== entry) return;
    entry.pulse?.dispose();
    entry.mutation = undefined;
    entry.pulse = this.#effects!.read();
    entry.alpha = 0;
    entry.time = this.surface.renderer.clock.now();
    this.#stop ??= this.surface.renderer.onAnimationTick(30, () => this.#tick());
    this.surface.requestRender();
  }
  dispose() {
    this.#stop?.();
    this.#stop = undefined;
    if (this.#expiry !== undefined) this.surface.renderer.clock.clearTimeout(this.#expiry);
    this.#expiry = undefined;
    for (const entry of this.#entries.values()) entry.pulse?.dispose();
    this.#entries.clear();
    this.#effects = undefined;
    for (const dispose of this.#disposers.splice(0)) dispose();
  }
}
