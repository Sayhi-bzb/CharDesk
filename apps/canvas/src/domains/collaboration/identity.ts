const IDENTITY_KEY = "chardesk-collaboration-identity";
const LEGACY_IDENTITY_KEY = "ascii-canvas-collaboration-identity";
const COLORS = ["#e5484d", "#30a46c", "#3e63dd", "#ab4aba", "#f76b15", "#0d9488"];

type CollaborationIdentity = { id: string; name: string; color: string };

const decodeIdentity = (raw: string | null): CollaborationIdentity | null => {
  try {
    const stored = JSON.parse(raw ?? "null") as Partial<CollaborationIdentity> | null;
    return stored?.id && stored.name && stored.color
      ? stored as CollaborationIdentity
      : null;
  } catch {
    return null;
  }
};

export const getCollaborationIdentity = (): CollaborationIdentity => {
  const current = decodeIdentity(localStorage.getItem(IDENTITY_KEY));
  if (current) {
    localStorage.removeItem(LEGACY_IDENTITY_KEY);
    return current;
  }
  const legacy = decodeIdentity(localStorage.getItem(LEGACY_IDENTITY_KEY));
  if (legacy) {
    const serialized = JSON.stringify(legacy);
    localStorage.setItem(IDENTITY_KEY, serialized);
    if (localStorage.getItem(IDENTITY_KEY) === serialized) {
      localStorage.removeItem(LEGACY_IDENTITY_KEY);
    }
    return legacy;
  }
  const id = crypto.randomUUID();
  const identity = {
    id,
    name: `Guest ${id.slice(0, 4).toUpperCase()}`,
    color: COLORS[Math.abs(id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % COLORS.length],
  };
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  localStorage.removeItem(LEGACY_IDENTITY_KEY);
  return identity;
};
