import type { BlackboardWorkspaceSnapshot } from "./repository";

const encoder = new TextEncoder();

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  bytes.forEach((byte) => { crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8); });
  return (crc ^ 0xffffffff) >>> 0;
};

const header = (size: number) => {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
};

const concat = (parts: readonly Uint8Array[]) => {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.byteLength;
  });
  return output;
};

export const createBlackboardArchive = (
  snapshot: BlackboardWorkspaceSnapshot,
) => {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  snapshot.files.forEach((file) => {
    const name = encoder.encode(file.path);
    const content = encoder.encode(file.content);
    const checksum = crc32(content);
    const local = header(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(8, 0, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, content.byteLength, true);
    local.view.setUint32(22, content.byteLength, true);
    local.view.setUint16(26, name.byteLength, true);
    localParts.push(local.bytes, name, content);

    const central = header(46);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x0800, true);
    central.view.setUint16(10, 0, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, content.byteLength, true);
    central.view.setUint32(24, content.byteLength, true);
    central.view.setUint16(28, name.byteLength, true);
    central.view.setUint32(42, localOffset, true);
    centralParts.push(central.bytes, name);
    localOffset += local.bytes.byteLength + name.byteLength + content.byteLength;
  });

  const central = concat(centralParts);
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, snapshot.files.length, true);
  end.view.setUint16(10, snapshot.files.length, true);
  end.view.setUint32(12, central.byteLength, true);
  end.view.setUint32(16, localOffset, true);
  const archive = concat([...localParts, central, end.bytes]);
  return new Blob([archive.buffer as ArrayBuffer], { type: "application/zip" });
};
