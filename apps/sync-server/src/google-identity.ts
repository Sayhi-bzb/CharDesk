import { OAuth2Client } from "google-auth-library";

export type GoogleIdentity = {
  subject: string;
  login: string;
  avatarUrl: string | null;
  nonce: string;
};

export const verifyGoogleIdToken = async (idToken: string, clientId: string): Promise<GoogleIdentity> => {
  const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken, audience: clientId });
  const claims = ticket.getPayload();
  if (!claims || (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") ||
    !claims.sub || !claims.nonce) throw new Error("Invalid Google identity");
  return { subject: claims.sub, login: claims.name?.trim() || "Google user",
    avatarUrl: claims.picture ?? null, nonce: claims.nonce };
};
