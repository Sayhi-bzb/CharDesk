export const isCtrlOrMeta = (event: { ctrlKey: boolean; metaKey: boolean }) => {
  return event.ctrlKey || event.metaKey;
};
