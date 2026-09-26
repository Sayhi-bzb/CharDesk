import assert from "node:assert/strict";
import { test } from "node:test";
import { syncManifestDependencies } from "./sync-workspace-dependencies.mjs";

test("updates published workspace ranges across dependency fields", () => {
  const manifest = {
    dependencies: { "@chardesk/cell-core": "^0.4.0", "@chardesk/fonts": "*" },
    devDependencies: { "@chardesk/protocol": "^0.4.4" },
    peerDependencies: { "@chardesk/rendering": "^0.4.0", react: "^19.0.0" },
  };
  assert.equal(syncManifestDependencies(manifest, "0.5.0"), true);
  assert.equal(manifest.dependencies["@chardesk/cell-core"], "^0.5.0");
  assert.equal(manifest.dependencies["@chardesk/fonts"], "*");
  assert.equal(manifest.devDependencies["@chardesk/protocol"], "^0.5.0");
  assert.equal(manifest.peerDependencies["@chardesk/rendering"], "^0.5.0");
  assert.equal(manifest.peerDependencies.react, "^19.0.0");
  assert.equal(syncManifestDependencies(manifest, "0.5.0"), false);
});
