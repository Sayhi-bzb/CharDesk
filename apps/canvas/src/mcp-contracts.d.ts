declare module "@chardesk/mcp/contracts" {
  export type LocalMcpToolContract = Readonly<{
    name: string;
    title?: string;
    description: string;
    readOnly: boolean;
    inputSchema: Readonly<Record<string, unknown>>;
  }>;

  export const localToolContracts: readonly LocalMcpToolContract[];
}
