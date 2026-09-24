declare module "virtual:gallery-code-tokens" {
  const tokens: Readonly<Record<string, readonly Readonly<{ content: string; color?: string; bold?: boolean }>[]>>;
  export default tokens;
}
