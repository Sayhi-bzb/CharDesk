/** Recovery preserves the original target identity; a caller explicitly chooses the recovered copy. */
export class CanvasRecoveryRequired extends Error {
  readonly code = 'canvas_recovered';
  constructor(
    readonly canvasId: string,
    readonly recoveredCanvasId: string,
    name: string
  ) {
    super(
      `The original Canvas file is missing. Pending edits were recovered in "${name}" (${recoveredCanvasId}). Open that Canvas explicitly.`
    );
    this.name = 'CanvasRecoveryRequired';
  }
  result() {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      canvasId: this.canvasId,
      recoveredCanvasId: this.recoveredCanvasId,
    };
  }
}
