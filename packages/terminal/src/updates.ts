/** Distribution-owned service; the terminal only presents its state. */
export type UpdateState = {
  current: string;
  phase: 'idle' | 'checking' | 'current' | 'available' | 'error' | 'development';
  latest?: string;
  available?: boolean;
  error?: string;
};

export interface TerminalUpdates {
  readonly state: UpdateState;
  readonly commands: readonly { label: string; command: string }[];
  subscribe(listener: () => void): () => void;
  setAutomatic(enabled: boolean): void;
  check(): Promise<void>;
  openReleaseNotes(): Promise<void>;
}
