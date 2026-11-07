export type LocalMcpToolContract = Readonly<{
  name: string;
  title?: string;
  description: string;
  readOnly: boolean;
  inputSchema: Readonly<Record<string, unknown>>;
}>;

export const localToolContracts: readonly LocalMcpToolContract[];

export const tools: readonly (Omit<LocalMcpToolContract, 'readOnly'> & {annotations:{readOnlyHint:boolean}})[];
export const toolNames: Set<string>;

export function permissionFor(name:string,input?:{action?:unknown}): 'inspect'|'read'|'search'|'write';
