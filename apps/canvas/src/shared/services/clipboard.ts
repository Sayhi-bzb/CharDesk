const hasClipboard = () =>
  typeof navigator !== "undefined" && typeof navigator.clipboard !== "undefined";

const writeItemsResult = async (items: ClipboardItem[]) => {
  if (!hasClipboard() || items.length === 0) {
    return { ok: false as const, cause: undefined };
  }
  try {
    await navigator.clipboard.write(items);
    return { ok: true as const };
  } catch (cause) {
    return { ok: false as const, cause };
  }
};

export const clipboard = {
  async writeText(text: string) {
    if (!hasClipboard()) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  },
  async writeItems(items: ClipboardItem[]) {
    return (await writeItemsResult(items)).ok;
  },
  writeItemsResult,
  async readItems() {
    if (!hasClipboard()) return null;
    try {
      return await navigator.clipboard.read();
    } catch {
      return null;
    }
  },
  async readText() {
    if (!hasClipboard()) return null;
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  },
};
