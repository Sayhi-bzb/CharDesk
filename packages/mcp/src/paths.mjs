import { homedir } from 'node:os';
import { join } from 'node:path';

const configDirectory = () => {
  const root = process.env.XDG_CONFIG_HOME
    || (process.platform === 'win32' ? process.env.APPDATA : join(homedir(), '.config'));
  return join(root || join(homedir(), '.config'), 'chardesk', 'mcp');
};
export const credentialsPath = () => join(configDirectory(), 'credentials.json');
export const pairingPath = () => join(configDirectory(), 'pairing.json');
