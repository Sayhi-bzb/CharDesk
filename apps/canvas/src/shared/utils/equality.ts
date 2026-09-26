const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getJsonKeys = (value: Record<string, unknown>) =>
  Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();

export const areJsonValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => areJsonValuesEqual(value, right[index]))
    );
  }

  if (!isRecord(left) || !isRecord(right)) return false;

  const leftKeys = getJsonKeys(left);
  const rightKeys = getJsonKeys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && areJsonValuesEqual(left[key], right[key])
    )
  );
};
