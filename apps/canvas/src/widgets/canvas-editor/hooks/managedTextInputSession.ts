export type FinalizedManagedComposition = {
  value: string;
};

export const isCompositionInputType = (inputType: string | undefined) =>
  inputType === "insertCompositionText" || inputType === "insertFromComposition";

export const shouldSuppressFinalizedCompositionInput = (
  finalized: FinalizedManagedComposition | null,
  value: string,
  inputType: string | undefined
) =>
  !!finalized &&
  finalized.value === value &&
  (!inputType || isCompositionInputType(inputType));
