import { createSyncServer } from "./server.js";
import { AccountStore } from "./account-store.js";
import { createAccountApi } from "./account-api.js";

const readPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? "http://127.0.0.1:5173,http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const accountEnabled = Boolean(process.env.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_SECRET);
if (accountEnabled && (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET ||
  !process.env.ACCOUNT_DATABASE || !process.env.ACCOUNT_PUBLIC_ORIGIN || !process.env.ACCOUNT_APP_ORIGIN)) {
  throw new Error("Account API requires GitHub OAuth credentials, database path, and public/app origins.");
}
if (accountEnabled && !allowedOrigins.has(process.env.ACCOUNT_APP_ORIGIN!)) {
  throw new Error("ACCOUNT_APP_ORIGIN must be included in ALLOWED_ORIGINS.");
}
const accountStore = accountEnabled ? new AccountStore(process.env.ACCOUNT_DATABASE!) : null;
const accountApi = accountStore ? createAccountApi({
  store: accountStore,
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  publicOrigin: process.env.ACCOUNT_PUBLIC_ORIGIN!,
  appOrigin: process.env.ACCOUNT_APP_ORIGIN!,
  allowedOrigins,
}) : undefined;

const syncServer = createSyncServer({
  host: process.env.HOST ?? "0.0.0.0",
  port: readPositiveInteger(process.env.PORT, 1234),
  allowedOrigins,
  maxConnectionsPerRoom: readPositiveInteger(process.env.MAX_CONNECTIONS_PER_ROOM, 30),
  maxConnectionsPerIp: readPositiveInteger(process.env.MAX_CONNECTIONS_PER_IP, 20),
  maxConnectionAttemptsPerMinute: readPositiveInteger(
    process.env.MAX_CONNECTION_ATTEMPTS_PER_MINUTE,
    120
  ),
  trustProxy: process.env.TRUST_PROXY === "1",
  accountApi,
});

const address = await syncServer.listen();
console.log(JSON.stringify({ event: "listening", ...address }));

const shutdown = async () => {
  await syncServer.close();
  accountStore?.close();
  process.exit(0);
};

process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
