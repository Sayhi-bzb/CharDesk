export type BlackboardPackageErrorCode =
  | "invalid-manifest"
  | "invalid-panel-path"
  | "missing-panel"
  | "invalid-panel";

export class BlackboardPackageError extends Error {
  readonly code: BlackboardPackageErrorCode;
  readonly panel?: string;

  constructor(code: BlackboardPackageErrorCode, message: string, panel?: string) {
    super(message);
    this.name = "BlackboardPackageError";
    this.code = code;
    this.panel = panel;
  }
}
