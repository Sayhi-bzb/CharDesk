type DocumentLocation = Readonly<{
  pathname: string;
  search: string;
}>;

const LOCAL_READER_PATH = /\/s\/[A-Za-z0-9_-]{22}\/?$/u;

export const isLocalDocumentReaderRoute = (
  { pathname }: Pick<DocumentLocation, "pathname">
) => LOCAL_READER_PATH.test(pathname);

export const isRetiredBlackboardRoute = (location: Pick<DocumentLocation, "pathname">) =>
  location.pathname === "/blackboard"
  || location.pathname.endsWith("/blackboard");
