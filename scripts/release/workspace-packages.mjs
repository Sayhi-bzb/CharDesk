export const releasedPackages = [
  { name: "@chardesk/cli", path: "packages/cli" },
  { name: "@chardesk/cell-core", path: "packages/cell-core" },
  { name: "@chardesk/fonts", path: "packages/fonts" },
  { name: "@chardesk/font-maple", path: "packages/font-maple" },
  { name: "@chardesk/protocol", path: "packages/protocol" },
  { name: "@chardesk/rendering", path: "packages/rendering" },
];

export const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

export const compatibleRange = (version) =>
  `^${version.split(".").slice(0, 2).join(".")}.0`;
