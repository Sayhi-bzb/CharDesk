import { buildDefaultDemoGrid } from './welcome.js';
import {
  isIncrementalCanvasSurfaceReader,
  type CanvasSurfaceReader,
  type CellPlaneRow,
} from '@chardesk/cell-plane';
import type { GridCell, GridCellSource, NodeBounds, Point } from '@chardesk/cell-plane/types';
import { COLOR_PRIMARY_TEXT } from '@chardesk/cell-plane/constants';
import { deriveContentNeutral } from '@chardesk/rendering/theme';
export type WelcomeAppearanceSnapshot = Readonly<{
  revision: number;
  palette: Readonly<{ foreground: string; background: string }> | null;
}>;

type Role = 'foreground' | 'muted' | 'border' | 'shadow';
type Revision = { revision: number; source: number; appearance: number };
const roles = new Map<string, Role>([
  ['#0f172a', 'foreground'],
  ['#1f2328', 'foreground'],
  ['#767676', 'muted'],
  ['#59636e', 'muted'],
  ['#64748b', 'border'],
  ['#94a3b8', 'border'],
  ['#818b98', 'border'],
  ['#d1d9e0', 'shadow'],
  ['#e2e8f0', 'shadow'],
]);
const identity = (cell: GridCell) => cell;
let signature: Array<{ at: Point; cell: GridCell }> | undefined;
function welcomeSignature() {
  if (!signature) {
    const grid = buildDefaultDemoGrid();
    // Artifact identity comes from its content, not a user-editable filename/session title.
    signature = [
      grid.find(([, cell]) => cell.char === '█' && cell.color === '#f54954')!,
      grid.find(([, cell]) => cell.char === 'N' && cell.color === '#2563eb')!,
      grid.find(([, cell]) => cell.href === 'https://github.com/Sayhi-bzb/CharDesk')!,
    ].map(([key, cell]) => {
      const [x, y] = key.split(',').map(Number);
      return { at: { x: x!, y: y! }, cell };
    });
  }
  return signature;
}

/** Shared Welcome appearance. Source Cells and serialized/native documents retain their authored RGB. */
export class WelcomeAppearance {
  #views = new WeakMap<GridCellSource, WelcomeGridSource>();
  #scopes = new WeakSet<GridCellSource>();
  private appearance: () => WelcomeAppearanceSnapshot;
  constructor(appearance: () => WelcomeAppearanceSnapshot) {
    this.appearance = appearance;
    this.project = this.project.bind(this);
  }
  cellProjector(source: GridCellSource) {
    const view = this.project(source);
    return view instanceof WelcomeGridSource ? view.projectCell : identity;
  }
  project(source: CanvasSurfaceReader, scope?: GridCellSource): CanvasSurfaceReader;
  project(source: GridCellSource, scope?: GridCellSource): GridCellSource;
  project(source: GridCellSource, scope: GridCellSource = source): GridCellSource {
    if (!this.#scopes.has(scope)) {
      // Fragment-only paint/query sources cannot establish whole-artifact identity.
      if (typeof scope.get !== 'function' || typeof scope.getContentBounds !== 'function')
        return source;
      if (scope.get({ x: 1, y: 0 })?.char !== '█') return source;
      if (
        !welcomeSignature().every(({ at, cell }) => {
          const candidate = scope.get(at);
          return (
            candidate?.char === cell.char &&
            candidate.color === cell.color &&
            candidate.href === cell.href
          );
        })
      )
        return source;
      this.#scopes.add(scope);
    }
    const cached = this.#views.get(source);
    if (cached) return cached;
    let view: WelcomeGridSource;
    if (isSurfaceReader(source))
      view = isIncrementalCanvasSurfaceReader(source)
        ? new IncrementalWelcomeSurface(source, this.appearance)
        : new WelcomeSurface(source, this.appearance);
    else view = new WelcomeGridSource(source, this.appearance);
    this.#views.set(source, view);
    return view;
  }
}
const isSurfaceReader = (source: GridCellSource): source is CanvasSurfaceReader =>
  'rows' in source &&
  typeof source.rows === 'function' &&
  'materialize' in source &&
  typeof source.materialize === 'function';

class WelcomeGridSource implements GridCellSource {
  #colors: { revision: number; values: Record<Role, string> } | undefined;
  #cells = new WeakMap<GridCell, { revision: number; value: GridCell }>();
  protected source: GridCellSource;
  protected appearance: () => WelcomeAppearanceSnapshot;
  constructor(source: GridCellSource, appearance: () => WelcomeAppearanceSnapshot) {
    this.source = source;
    this.appearance = appearance;
  }
  projectCell = (cell: GridCell) => {
    // An authored background owns its foreground contrast, including white-on-blue buttons and code panels.
    let role = cell.bgColor === undefined ? roles.get(cell.color.toLowerCase()) : undefined;
    // The authored muted RGB is also used for prose and button labels; keep text more readable than rules.
    if (role === 'border' && !/^[\u2500-\u257f]$/u.test(cell.char)) role = 'muted';
    if (!role) return cell;
    const snapshot = this.appearance();
    const cached = this.#cells.get(cell);
    if (cached?.revision === snapshot.revision) return cached.value;
    if (this.#colors?.revision !== snapshot.revision) {
      const palette = snapshot.palette;
      this.#colors = {
        revision: snapshot.revision,
        values: {
          foreground: COLOR_PRIMARY_TEXT,
          muted: palette ? deriveContentNeutral(palette, 0.65, 4.5) : COLOR_PRIMARY_TEXT,
          border: palette ? deriveContentNeutral(palette, 0.45, 3) : COLOR_PRIMARY_TEXT,
          shadow: palette ? deriveContentNeutral(palette, 0.18, 1.2) : COLOR_PRIMARY_TEXT,
        },
      };
    }
    const value = { ...cell, color: this.#colors.values[role] };
    this.#cells.set(cell, { revision: snapshot.revision, value });
    return value;
  };
  get = (at: Point) => {
    const cell = this.source.get(at);
    return cell && this.projectCell(cell);
  };
  visit = (bounds: NodeBounds, visitor: (x: number, y: number, cell: GridCell) => void) =>
    this.source.visit(bounds, (x, y, cell) => visitor(x, y, this.projectCell(cell)));
  getContentBounds = () => this.source.getContentBounds();
}

class WelcomeSurface extends WelcomeGridSource implements CanvasSurfaceReader {
  protected reader: CanvasSurfaceReader;
  constructor(reader: CanvasSurfaceReader, appearance: () => WelcomeAppearanceSnapshot) {
    super(reader, appearance);
    this.reader = reader;
  }
  getCell = this.get;
  visitCells = this.visit;
  *rows(bounds?: NodeBounds): Iterable<CellPlaneRow> {
    for (const row of this.reader.rows(bounds))
      yield {
        y: row.y,
        spans: row.spans.map((span) => ({ x: span.x, cells: span.cells.map(this.projectCell) })),
      };
  }
  *query(bounds: NodeBounds) {
    for (const row of this.rows(bounds)) for (const span of row.spans) yield { ...span, y: row.y };
  }
  materialize = (bounds?: NodeBounds) =>
    new Map(
      [...this.reader.materialize(bounds)].map(([key, cell]) => [key, this.projectCell(cell)])
    );
}

class IncrementalWelcomeSurface extends WelcomeSurface {
  #revision = 0;
  #last: Revision | undefined;
  #previous: Revision | undefined;
  getRevision() {
    const source = isIncrementalCanvasSurfaceReader(this.reader) ? this.reader.getRevision() : 0;
    const appearance = this.appearance().revision;
    if (source !== this.#last?.source || appearance !== this.#last?.appearance) {
      this.#previous = this.#last;
      this.#last = { revision: ++this.#revision, source, appearance };
    }
    return this.#revision;
  }
  getChangesSince(revision: number) {
    this.getRevision();
    if (revision === this.#revision) return { revision, full: false as const, bounds: [] };
    const previous = this.#previous;
    if (
      previous?.revision === revision &&
      previous.appearance === this.#last!.appearance &&
      isIncrementalCanvasSurfaceReader(this.reader)
    )
      return { ...this.reader.getChangesSince(previous.source), revision: this.#revision };
    return { revision: this.#revision, full: true as const };
  }
}
