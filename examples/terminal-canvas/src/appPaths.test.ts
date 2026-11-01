import { expect, test } from 'bun:test';
import { resolveAppPaths } from './appPaths.ts';

test('application roots respect platform directories and absolute portable overrides', () => {
  const linux = resolveAppPaths({
    platform: 'linux',
    home: '/users/example',
    environment: {
      XDG_DATA_HOME: '/data',
      XDG_CONFIG_HOME: '/config',
      XDG_STATE_HOME: '/state',
      XDG_CACHE_HOME: '/cache',
    },
  });
  expect(linux.catalog).toBe('/data/chardesk/catalog.sqlite');
  expect(linux.settings).toBe('/config/chardesk/terminal.json');
  expect(linux.workspace).toBe('/state/chardesk/workspaces/default.json');
  expect(
    resolveAppPaths({
      platform: 'linux',
      home: '/users/example',
      environment: { XDG_DATA_HOME: 'relative' },
    }).data
  ).toBe('/users/example/.local/share/chardesk');
  const mac = resolveAppPaths({ platform: 'darwin', home: '/users/example', environment: {} });
  expect(mac.data).toBe('/users/example/Library/Application Support/chardesk');
  const windows = resolveAppPaths({
    platform: 'win32',
    home: 'C:\\Users\\Example',
    environment: { APPDATA: 'D:\\Roaming', LOCALAPPDATA: 'D:\\Local' },
  });
  expect(windows.data).toBe('D:\\Local\\chardesk\\Data');
  expect(windows.settings).toBe('D:\\Roaming\\chardesk\\Config\\terminal.json');
  const portable = resolveAppPaths({ environment: { CHARDESK_HOME: '/portable' } });
  expect(portable.catalog).toBe('/portable/data/catalog.sqlite');
  expect(portable.workspace).toBe('/portable/state/workspaces/default.json');
  expect(() => resolveAppPaths({ environment: { CHARDESK_HOME: './relative' } })).toThrow(
    'absolute'
  );
});
