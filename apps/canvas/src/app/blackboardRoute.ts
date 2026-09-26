type BlackboardLocation = Readonly<{
  pathname: string;
  search: string;
}>;

const LOCAL_READER_PATH = /\/s\/[A-Za-z0-9_-]{22}\/?$/u;

export const isLocalBlackboardReaderRoute = (
  { pathname }: Pick<BlackboardLocation, "pathname">
) => LOCAL_READER_PATH.test(pathname);

export const isBlackboardRoute = (location: Pick<BlackboardLocation, "pathname">) =>
  location.pathname === "/blackboard"
  || location.pathname.endsWith("/blackboard")
  || isLocalBlackboardReaderRoute(location);
