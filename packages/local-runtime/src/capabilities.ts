import {
  literalRows,
  isCanvasStrokeStyle,
  fillRows,
} from '../../canvas-capabilities/src/projection.ts';
import {
  parseCanvasReadRequest,
  readCanvasSurface,
  INVALID_CANVAS_READ,
  type CanvasReadAppearance,
} from '../../canvas-capabilities/src/read.ts';
import { CHARDESK_CONTENT_THEMES } from '@chardesk/rendering/theme';
import { COLOR_PRIMARY_TEXT } from '@chardesk/cell-plane/constants';
import { createCanvasCodeTool } from '../../canvas-capabilities/src/code.ts';
import { compileCharDeskText } from '@chardesk/chargraph';
import { randomUUID } from 'node:crypto';
import {
  createCanvasCapabilities,
  type AgentToolDefinition,
} from '../../canvas-capabilities/src/index.ts';
import { tools as contracts } from '../../canvas-capabilities/src/contracts.mjs';
import {
  prepareCanvasRowsWrite,
  prepareCanvasErase,
  measureCanvasMutationImpact,
} from '@chardesk/editor-core/writeText';
import { searchCanvasSurface } from '@chardesk/editor-core/search';
import type { TerminalWorkspace } from './workspace.ts';
import type { LocalSessions } from './sessions.ts';

export function localCapabilities(
  workspace: TerminalWorkspace,
  sessions: LocalSessions,
  persistentHistory = false,
  readAppearance: () => CanvasReadAppearance | undefined = () => undefined
) {
  const defaultAppearance: CanvasReadAppearance = {
    theme: 'light',
    palette: {
      color: CHARDESK_CONTENT_THEMES.light.foreground,
      background: CHARDESK_CONTENT_THEMES.light.background,
    },
  };
  const model = workspace.model;
  let batch = false;
  const implementations = contracts.map(
    (contract) =>
      ({
        ...contract,
        readOnly: contract.annotations.readOnlyHint,
        async execute(input: Record<string, unknown>) {
          try {
            if (contract.name === 'canvas_manage') {
              if (input.action === 'list')
                return {
                  canvases: sessions.list(input.includeArchived === true).map((record) => ({
                    canvasId: record.id,
                    name: record.name,
                    mode: 'freeform',
                    archived: record.archived,
                    editable: true,
                  })),
                  currentCanvasId: workspace.files.length
                    ? sessions.forFile(workspace.active)?.id
                    : null,
                };
              if (input.action === 'create') {
                if (input.mode === 'slide')
                  return {
                    ok: false,
                    code: 'unsupported_capability',
                    message: 'Local Slides are unavailable.',
                  };
                const record = await sessions.createManaged(input.name as string | undefined);
                return { canvasId: record.id, name: record.name };
              }
              const record =
                typeof input.canvasId === 'string'
                  ? sessions.catalog.get(input.canvasId)
                  : workspace.files.length
                    ? sessions.forFile(workspace.active)
                    : undefined;
              if (!record)
                return { ok: false, code: 'canvas_not_found', message: 'Canvas not found.' };
              if (input.action === 'rename') {
                if (typeof input.name !== 'string') throw new Error('Expected name.');
                sessions.rename(record.id, input.name, record.revision);
                return { canvasId: record.id, name: input.name, persistence: 'saved' };
              }
              if (input.action === 'archive') {
                await sessions.archive(record.id, true, record.revision);
                return { canvasId: record.id, archived: true, persistence: 'saved' };
              }
              if (input.action === 'duplicate') {
                const copy = await sessions.duplicate(record.id);
                return {
                  canvasId: sessions.forFile(copy)?.id,
                  name: copy.title,
                  persistence: 'saved',
                };
              }
              return {
                ok: false,
                code: 'unsupported_capability',
                message: 'Local Slide operations are unavailable.',
              };
            }
            const file =
              input.canvasId === undefined
                ? workspace.active
                : workspace.files.find((file) => sessions.forFile(file)?.id === input.canvasId);
            if (!file?.address)
              return {
                ok: false,
                code: 'canvas_not_found',
                message: 'Target is not open in this runtime.',
              };
            const address = { ...file.address };
            if (input.pageId !== undefined && input.pageId !== address.pageId)
              return {
                ok: false,
                code: 'unsupported_capability',
                message: 'Local Slide operations are unavailable.',
              };
            const plane = model.documents.getContentReader(address.documentId, address.pageId)!;
            if (contract.name === 'canvas_search')
              return searchCanvasSurface(plane, input.query as string, input);
            if (contract.name === 'canvas_read') {
              const request = parseCanvasReadRequest(input);
              if (!request) return INVALID_CANVAS_READ;
              return await readCanvasSurface(plane, request, {
                ...(readAppearance() ?? defaultAppearance),
                target: { canvasId: sessions.forFile(file)?.id },
                renderImage: async (plan) => {
                  const { renderLocalReadImage } = await import('./readImage.ts');
                  return renderLocalReadImage(plan);
                },
              });
            }
            if (contract.name === 'canvas_undo') {
              if (!persistentHistory)
                return {
                  ok: false,
                  code: 'unsupported_capability',
                  message: 'Undo requires a running session.',
                };
              const ok = model.documents.undoOperation(
                String(input.operationId),
                address.documentId,
                address.pageId
              );
              if (ok) await workspace.saveFile(file);
              return { ok };
            }
            if (
              !['canvas_write', 'canvas_erase', 'canvas_fill', 'canvas_render'].includes(
                contract.name
              )
            )
              return {
                ok: false,
                code: 'unsupported_capability',
                message: `Unavailable locally: ${contract.name}`,
              };
            if (
              !Array.isArray(input.at) ||
              input.at.length !== 2 ||
              !input.at.every(Number.isSafeInteger)
            )
              return { ok: false, code: 'invalid_input', message: 'Expected at: [x,y].' };
            const [x, y] = input.at as number[];
            let prepared;
            if (contract.name === 'canvas_erase' || contract.name === 'canvas_fill') {
              if (
                !Array.isArray(input.size) ||
                input.size.length !== 2 ||
                !input.size.every(Number.isSafeInteger) ||
                input.size.some((n) => n <= 0) ||
                input.size[0] * input.size[1] > 1000000
              )
                return { ok: false, code: 'invalid_input', message: 'Invalid erase size.' };
              if (contract.name === 'canvas_erase')
                prepared = prepareCanvasErase({ x: x!, y: y! }, input.size as [number, number]);
              else {
                if (!input.style || !isCanvasStrokeStyle(input.style))
                  return { ok: false, code: 'invalid_input', message: 'Expected style.' };
                const rows = fillRows(
                  plane,
                  { x: x!, y: y! },
                  input.size as [number, number],
                  input.style
                );
                prepared = prepareCanvasRowsWrite({ x: x!, y: y! }, rows, 'patch');
              }
            } else if (contract.name === 'canvas_render') {
              if (typeof input.source !== 'string')
                return { ok: false, code: 'invalid_input', message: 'Expected source.' };
              const rendered = await compileCharDeskText(input.source, {
                format: (input.format === 'raw' ? 'plain' : (input.format ?? 'auto')) as 'auto',
              });
              prepared = prepareCanvasRowsWrite(
                { x: x!, y: y! },
                rendered.rows.map((row) => ({
                  ...row,
                  spans: row.spans.map((span) => ({
                    ...span,
                    color: span.color ?? COLOR_PRIMARY_TEXT,
                  })),
                })),
                'patch'
              );
            } else {
              if (typeof input.content !== 'string')
                return { ok: false, code: 'invalid_input', message: 'Expected literal content.' };
              if (!isCanvasStrokeStyle(input.style)) throw new Error('Invalid style.');
              const rows = literalRows(input.content, input.style ?? {}, COLOR_PRIMARY_TEXT);
              prepared = prepareCanvasRowsWrite({ x: x!, y: y! }, rows, 'patch');
            }
            const impact =
              contract.name === 'canvas_fill'
                ? {
                    overwrittenCells: 0,
                    overwrittenBounds: null,
                    clearedCells: 0,
                    clearedBounds: null,
                    styledCells: prepared.writtenCells,
                    styledBounds: prepared.bounds,
                  }
                : measureCanvasMutationImpact(plane, prepared.patch);
            model.settleInteraction();
            const operationId = persistentHistory && !batch ? `op-${randomUUID()}` : undefined;
            const checkpoint = batch
              ? { commit() {}, cancel() {} }
              : model.documents.beginHistoryCheckpoint(
                  operationId,
                  address.documentId,
                  address.pageId
                );
            try {
              model.documents.applyCellPlanePatchAt(address, prepared.patch);
              checkpoint.commit();
            } catch (error) {
              checkpoint.cancel();
              throw error;
            }
            if (batch) return { ...prepared, patch: undefined, impact, persistence: 'pending' };
            try {
              await workspace.saveFile(file);
              return { ...prepared, patch: undefined, impact, operationId, persistence: 'saved' };
            } catch (error) {
              return {
                ...prepared,
                patch: undefined,
                impact,
                operationId,
                persistence: 'failed',
                persistenceError: String(error),
              };
            }
          } catch (error) {
            return {
              ok: false,
              code: 'operation_failed',
              message: error instanceof Error ? error.message : String(error),
            };
          }
        },
      }) as AgentToolDefinition
  );
  const tool = (name: string) => implementations.find((tool) => tool.name === `canvas_${name}`)!;
  const code = createCanvasCodeTool({
    read: tool('read'),
    search: tool('search'),
    write: tool('write'),
    erase: tool('erase'),
    fill: tool('fill'),
    render: tool('render'),
    manage: tool('manage'),
    previewWrite: {
      ...tool('write'),
      execute: (input) => {
        if (
          !Array.isArray(input.at) ||
          typeof input.content !== 'string' ||
          !isCanvasStrokeStyle(input.style)
        )
          throw new Error('Invalid stroke.');
        const prepared = prepareCanvasRowsWrite(
          { x: input.at[0] as number, y: input.at[1] as number },
          literalRows(input.content, input.style ?? {}, COLOR_PRIMARY_TEXT),
          'patch'
        );
        return { ...prepared, patch: undefined, preview: true };
      },
    },
    previewRender: {
      ...tool('render'),
      execute: async (input) => {
        if (!Array.isArray(input.at) || typeof input.source !== 'string')
          throw new Error('Invalid render input.');
        const rendered = await compileCharDeskText(input.source, {
          format: (input.format === 'raw' ? 'plain' : (input.format ?? 'auto')) as 'auto',
        });
        const rows = rendered.rows.map((row) => ({
          ...row,
          spans: row.spans.map((span) => ({ ...span, color: span.color ?? COLOR_PRIMARY_TEXT })),
        }));
        const prepared = prepareCanvasRowsWrite(
          { x: input.at[0] as number, y: input.at[1] as number },
          rows,
          'patch'
        );
        return { ...prepared, patch: undefined, preview: true };
      },
    },
    history: {
      beginCheckpoint(operationId, canvasId) {
        const file = canvasId
          ? workspace.files.find((file) => sessions.forFile(file)?.id === canvasId)
          : workspace.active;
        if (!file?.address) throw new Error('Canvas not found.');
        batch = true;
        const checkpoint = model.documents.beginHistoryCheckpoint(
          operationId,
          file.address.documentId,
          file.address.pageId
        );
        return {
          commit() {
            checkpoint.commit();
            batch = false;
          },
          cancel() {
            checkpoint.cancel();
            batch = false;
          },
        };
      },
      undoOperation: (operationId) => model.documents.undoOperation(operationId),
    },
  });
  implementations[implementations.findIndex((tool) => tool.name === 'canvas_code')] = {
    ...code,
    async execute(input) {
      const result = await code.execute(input);
      if (
        input.mode === 'apply' &&
        result &&
        typeof result === 'object' &&
        !('ok' in result && result.ok === false)
      ) {
        try {
          await workspace.saveAll();
          return {
            ...result,
            persistence: 'saved',
            ...(!persistentHistory ? { operationId: undefined } : {}),
          };
        } catch (error) {
          return { ...result, persistence: 'failed', persistenceError: String(error) };
        }
      }
      return result;
    },
  };
  return createCanvasCapabilities({ tools: implementations });
}
