import { BlackboardPackageError } from "./errors.js";
export const normalizeBlackboardPath = (path: string) => {
  const normalized = path.replace(/^\.\//u, "");
  const segments = normalized.split("/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    normalized.includes("\\") ||
    /^[a-z]:/iu.test(normalized) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new BlackboardPackageError(
      "invalid-panel-path",
      `Blackboard path must be package-relative POSIX text: ${JSON.stringify(path)}.`,
    );
  }
  return segments.join("/");
};
