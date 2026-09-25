declare module "virtual:gallery-code-tokens" {
  const tokens: Readonly<Record<string, readonly Readonly<{ content: string; color?: string; bold?: boolean }>[]>>;
  export default tokens;
}

declare module "virtual:gallery-installation-code-tokens" {
  type Token = Readonly<{ content: string; role?: "key" | "value" | "command" }>;
  const tokens: Readonly<Record<string, readonly (readonly Token[])[]>>;
  export default tokens;
}
