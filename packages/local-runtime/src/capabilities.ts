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
import type { LocalCanvasHost, LocalCodeDraft } from './host.ts';
import type { LocalSessions } from './sessions.ts';
import type { CanvasSurfaceReader, CellPlaneOperation } from '@chardesk/cell-plane';
import { WelcomeAppearance } from '@chardesk/canvas-templates/welcome-appearance';
import { normalizeContentRgb } from '@chardesk/rendering/theme';
import { contentFailure, requestFingerprint, type LocalRequestContext } from './request.ts';
import { runCodeTransaction } from './codeTransaction.ts';

export function localCapabilities(
  workspace: LocalCanvasHost,
  sessions: LocalSessions,
  persistentHistory = false,
  readAppearance: () => CanvasReadAppearance | undefined = () => undefined,
  presentSurface?: (source: CanvasSurfaceReader) => CanvasSurfaceReader
) {
  return buildLocalCapabilities(
    workspace,
    sessions,
    persistentHistory,
    readAppearance,
    presentSurface
  );
}

function buildLocalCapabilities(
  workspace: LocalCanvasHost,
  sessions: LocalSessions,
  persistentHistory: boolean,
  readAppearance: () => CanvasReadAppearance | undefined,
  presentSurface?: (source: CanvasSurfaceReader) => CanvasSurfaceReader,
  draft?: LocalCodeDraft
) {
  const defaultAppearance: CanvasReadAppearance = {
    theme: 'light',
    palette: {
      color: CHARDESK_CONTENT_THEMES.light.foreground,
      background: CHARDESK_CONTENT_THEMES.light.background,
    },
  };
  const model = workspace.model;
  const retainedReceipt = (result: unknown, file?: LocalCanvasHost['active']) => {
    if (
      result &&
      typeof result === 'object' &&
      'operationId' in result &&
      typeof result.operationId === 'string' &&
      (!file?.address || !model.documents.canUndoOperationAt(file.address, result.operationId))
    )
      return Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'operationId'));
    return result;
  };
  let batch = false;
  const implementations = contracts.map(
    (contract) =>
      ({
        ...contract,
        readOnly: contract.annotations.readOnlyHint,
        async execute(input: Record<string, unknown>, context?: LocalRequestContext) {
          const lifecycle = new AbortController();
          try {
            if (contract.name === 'canvas_manage') {
              const operation = {
                owner: {},
                signal: context?.signal
                  ? AbortSignal.any([context.signal, lifecycle.signal])
                  : lifecycle.signal,
                activate: false,
              };
              if (draft && input.action !== 'list')
                throw new Error('Canvas lifecycle changes must run outside a Code transaction.');
              if (input.action === 'list')
                return {
                  canvases: sessions.list(input.includeArchived === true).map((record) => ({
                    canvasId: record.id,
                    name: record.name,
                    mode: 'freeform',
                    archived: record.archived,
                    editable: true,
                  })),
                  currentCanvasId: workspace.active ? sessions.forFile(workspace.active)?.id : null,
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
                  : workspace.active
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
                await sessions.archive(record.id, true, record.revision, operation);
                return { canvasId: record.id, archived: true, persistence: 'saved' };
              }
              if (input.action === 'duplicate') {
                const copy = await sessions.duplicate(record.id, operation);
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
            if (file.ready) await file.ready;
            if (!workspace.files.includes(file))
              return { ok: false, code: 'canvas_not_found', message: 'Canvas is no longer open.' };
            const address = { ...file.address };
            if (input.pageId !== undefined && input.pageId !== address.pageId)
              return {
                ok: false,
                code: 'unsupported_capability',
                message: 'Local Slide operations are unavailable.',
              };
            const plane = model.documents.getContentReader(address.documentId, address.pageId)!;
            if (contract.name === 'canvas_search') {
              const snapshot = model.documents.captureContentAt(address);
              try {
                return {
                  ...searchCanvasSurface(snapshot.reader, input.query as string, input),
                  version: snapshot.version,
                };
              } finally {
                snapshot.dispose();
              }
            }
            if (contract.name === 'canvas_read') {
              const request = parseCanvasReadRequest(input);
              if (!request) return INVALID_CANVAS_READ;
              const appearance = readAppearance() ?? defaultAppearance;
              const foreground = normalizeContentRgb(appearance.palette.color),
                background = normalizeContentRgb(appearance.palette.background);
              const welcome = new WelcomeAppearance(() => ({
                revision: 0,
                palette: foreground && background ? { foreground, background } : null,
              }));
              const snapshot = model.documents.captureContentAt(address);
              try {
                const surface = presentSurface
                  ? presentSurface(snapshot.reader)
                  : welcome.project(snapshot.reader);
                const result = await readCanvasSurface(surface, request, {
                  ...appearance,
                  target: { canvasId: sessions.forFile(file)?.id },
                  renderImage: async (plan) => {
                    const { renderLocalReadImage } = await import('./readImage.ts');
                    return renderLocalReadImage(plan);
                  },
                });
                const canvasId = sessions.forFile(file)?.id;
                if (
                  !draft &&
                  context?.agent &&
                  canvasId &&
                  result.viewport &&
                  !result.overviewOnly
                ) {
                  const [x, y, width, height] = result.viewport;
                  sessions.agents.publishActivity({
                    kind: 'read',
                    canvasId,
                    ...address,
                    version: snapshot.version,
                    agent: { ...context.agent },
                    bounds: { x, y, width, height },
                  });
                }
                return {
                  ...result,
                  version: snapshot.version,
                  ...(file.recoveredCanvasId ? { recoveredCanvasId: file.recoveredCanvasId } : {}),
                };
              } finally {
                snapshot.dispose();
              }
            }
            if (contract.name === 'canvas_undo') {
              if (!persistentHistory)
                return {
                  ok: false,
                  code: 'unsupported_capability',
                  message: 'Undo requires a running session.',
                };
              const baseVersion =
                context?.baseVersion ?? model.documents.getContentVersion(address.documentId);
              model.documents.assertContentVersion(address.documentId, baseVersion);
              context?.signal?.throwIfAborted();
              file.writeGuard?.();
              const ok = model.documents.undoOperation(
                String(input.operationId),
                address.documentId,
                address.pageId
              );
              const version = model.documents.getContentVersion(address.documentId);
              if (!ok) return { ok: false, code: 'operation_not_undoable', version };
              try {
                await workspace.saveFile(file);
                return {
                  ok: true,
                  version,
                  persistence: 'saved',
                  persistedVersion: file.persistedVersion,
                };
              } catch (error) {
                return {
                  ok: true,
                  version,
                  persistence: 'failed',
                  persistenceError: String(error),
                };
              }
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
            if (draft?.undo.length) throw new Error('Undo must run in a separate apply call.');
            const baseVersion =
              context?.baseVersion ?? model.documents.getContentVersion(address.documentId);
            model.documents.assertContentVersion(address.documentId, baseVersion);
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
                input.writeMode === 'patch' ? 'patch' : 'replace'
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
            context?.signal?.throwIfAborted();
            if (!workspace.files.includes(file))
              return {
                ok: false,
                code: 'canvas_not_found',
                message: 'Canvas closed during preparation.',
              };
            file.writeGuard?.();
            const operationId = persistentHistory && !batch ? `op-${randomUUID()}` : undefined;
            let receipt;
            let transition: { before: CellPlaneOperation; after: CellPlaneOperation } | undefined;
            const observe =
              !draft && !batch && context?.agent && sessions.agents.hasActivityListeners;
            const stop = observe
              ? model.documents.subscribeMutations((event, inverse) => {
                  if (
                    (event.kind === 'cell-plane' || event.kind === 'anchors') &&
                    event.operation &&
                    inverse &&
                    event.documentId === address.documentId &&
                    event.pageId === address.pageId
                  )
                    transition = { before: inverse, after: event.operation };
                })
              : () => {};
            try {
              if (batch) {
                model.documents.assertContentVersion(address.documentId, baseVersion);
                model.documents.applyCellPlanePatchAt(address, prepared.patch);
              } else
                receipt = model.documents.commitContentPatchAt(address, prepared.patch, {
                  baseVersion,
                  operationId,
                });
            } finally {
              stop();
            }
            const canvasId = sessions.forFile(file)?.id;
            if (transition && receipt && context?.agent && canvasId)
              sessions.agents.publishActivity({
                kind:
                  contract.name === 'canvas_render'
                    ? 'render'
                    : contract.name === 'canvas_erase'
                      ? 'erase'
                      : contract.name === 'canvas_fill'
                        ? 'fill'
                        : 'write',
                canvasId,
                ...address,
                version: receipt.version,
                agent: { ...context.agent },
                bounds: transition.before.bounds,
                ...transition,
                writtenCells: prepared.writtenCells,
              });
            const mutation = {
              ...prepared,
              patch: undefined,
              impact,
              ...(contract.name === 'canvas_erase'
                ? {
                    erasedCells: impact.clearedCells,
                    bounds: impact.clearedBounds ?? prepared.bounds,
                  }
                : {}),
              ...(receipt ?? {}),
            };
            if (batch) return { ...mutation, persistence: 'pending' };
            try {
              await workspace.saveFile(file);
              return { ...mutation, persistence: 'saved', persistedVersion: file.persistedVersion };
            } catch (error) {
              return {
                ...mutation,
                persistence: 'failed',
                persistenceError: String(error),
              };
            }
          } catch (error) {
            return contentFailure(error);
          } finally {
            lifecycle.abort();
          }
        },
      }) as AgentToolDefinition
  );
  const tool = (name: string): AgentToolDefinition => {
    const implementation = implementations.find((tool) => tool.name === `canvas_${name}`)!;
    if (!draft) return implementation;
    return {
      ...implementation,
      async execute(input, context) {
        const result = await dispatch.execute(implementation.name, input, context);
        if (result && typeof result === 'object' && 'ok' in result && result.ok === false)
          throw new Error(
            'message' in result ? String(result.message) : 'Canvas operation failed.'
          );
        return result;
      },
    };
  };
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
          input.writeMode === 'patch' ? 'patch' : 'replace'
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
            const receipt = checkpoint.commit();
            batch = false;
            return receipt;
          },
          cancel() {
            checkpoint.cancel();
            batch = false;
          },
        };
      },
      undoOperation: (operationId) => {
        if (draft?.undo.length) throw new Error('Use one undo operation per Code call.');
        const address = workspace.active?.address;
        if (!address) return false;
        const ok = model.documents.undoOperation(operationId, address.documentId, address.pageId);
        if (ok) draft?.undo.push(operationId);
        return ok;
      },
    },
  });
  implementations[implementations.findIndex((tool) => tool.name === 'canvas_code')] = {
    ...code,
    async execute(input, context?: LocalRequestContext) {
      if (!draft) {
        const file =
          input.canvasId === undefined
            ? workspace.active
            : workspace.files.find((file) => sessions.forFile(file)?.id === input.canvasId);
        const canvasId = file && sessions.forFile(file)?.id;
        const bound = { ...input, ...(canvasId ? { canvasId } : {}) };
        return runCodeTransaction(
          workspace,
          sessions,
          persistentHistory,
          bound,
          context,
          (host, state) =>
            buildLocalCapabilities(
              host,
              sessions,
              true,
              readAppearance,
              presentSurface,
              state
            ).execute('canvas_code', bound, { signal: context?.signal })
        );
      }
      return code.execute(input);
    },
  };
  const dispatch = createCanvasCapabilities({ tools: implementations });
  const execute = async (
    name: string,
    input: Record<string, unknown>,
    context?: LocalRequestContext
  ) => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return dispatch.execute(name, input, context);
    const { baseVersion, requestId, ...parameters } = input;
    if (baseVersion !== undefined && (typeof baseVersion !== 'string' || !baseVersion))
      return Promise.resolve({
        ok: false,
        code: 'invalid_input',
        message: 'Expected a nonempty baseVersion.',
      });
    const requestContext: LocalRequestContext = {
      ...context,
      ...(baseVersion !== undefined ? { baseVersion: baseVersion as string } : {}),
    };
    const file =
      parameters.canvasId === undefined
        ? workspace.active
        : workspace.files.find((file) => sessions.forFile(file)?.id === parameters.canvasId);
    if (requestId !== undefined) {
      if (draft || typeof requestId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(requestId))
        return {
          ok: false,
          code: 'invalid_input',
          message:
            'Use a requestId of 1–128 ASCII letters, digits, dots, underscores, colons or hyphens.',
        };
      if (
        ![
          'canvas_write',
          'canvas_erase',
          'canvas_fill',
          'canvas_render',
          'canvas_undo',
          'canvas_code',
        ].includes(name) ||
        (name === 'canvas_code' && parameters.mode !== 'apply')
      )
        return {
          ok: false,
          code: 'invalid_input',
          message: 'requestId applies to content mutations only.',
        };
      const record = file && sessions.forFile(file);
      if (!record || !file?.address)
        return { ok: false, code: 'canvas_not_found', message: 'Canvas not found.' };
      try {
        if (file.ready) await file.ready;
      } catch (error) {
        return contentFailure(error);
      }
      if (!workspace.files.includes(file))
        return { ok: false, code: 'canvas_not_found', message: 'Canvas is no longer open.' };
      const acceptedVersion =
        requestContext.baseVersion ?? model.documents.getContentVersion(file.address.documentId);
      const bound = { ...parameters, canvasId: record.id };
      const acceptedContext: LocalRequestContext = {
        ...requestContext,
        baseVersion: acceptedVersion,
      };
      const result = await sessions.content.runRequest(
        record.id,
        requestId,
        requestFingerprint(name, {
          ...bound,
          ...(baseVersion !== undefined ? { baseVersion } : {}),
        }),
        () => dispatch.execute(name, bound, acceptedContext)
      );
      return retainedReceipt(result, file);
    }
    if (requestContext.baseVersion && name === 'canvas_manage')
      return Promise.resolve({
        ok: false,
        code: 'unsupported_capability',
        message: 'Content preconditions do not apply to session lifecycle operations.',
      });
    return retainedReceipt(await dispatch.execute(name, parameters, requestContext), file);
  };
  return {
    ...dispatch,
    async execute(name: string, input: Record<string, unknown>, context?: LocalRequestContext) {
      const file =
        !draft && context?.agent && input && typeof input === 'object'
          ? input.canvasId === undefined
            ? workspace.active
            : workspace.files.find((file) => sessions.forFile(file)?.id === input.canvasId)
          : undefined;
      const canvasId = file && sessions.forFile(file)?.id;
      const finish =
        canvasId &&
        context?.agent &&
        name !== 'canvas_manage' &&
        contracts.some((contract) => contract.name === name)
          ? sessions.agents.begin(canvasId, context.agent, name, {
              ...context.invocation,
              input: context.invocation?.input ?? input,
            })
          : undefined;
      try {
        const result = await execute(name, input, context);
        finish?.(
          result && typeof result === 'object' && 'ok' in result && result.ok === false
            ? 'failed'
            : 'completed'
        );
        return result;
      } catch (error) {
        finish?.('failed');
        throw error;
      }
    },
  };
}
