// Contrat des messages entre les options, les content scripts et le service worker.

/** Options → content script : vérifier que le script de l'onglet est vivant. */
export const PING = "barrage/ping";

export function isPingRequest(message: unknown): boolean {
  return typeof message === "object" && message !== null && (message as { type?: unknown }).type === PING;
}

/** Onglet x.com ou options → service worker : écriture à appliquer, voir core/writer.ts. */
export const WRITE = "barrage/write";

export type WriteRequest = { type: typeof WRITE; name: string; args: unknown[] };
export type WriteReply = { ok: true; value: unknown } | { ok: false; error: string };

export function isWriteRequest(message: unknown): message is WriteRequest {
  const m = message as Partial<WriteRequest> | null;
  return typeof m === "object" && m !== null && m.type === WRITE && typeof m.name === "string" && Array.isArray(m.args);
}

/** Réponse d'un content script aux pings des options : y répondre prouve qu'il est vivant. */
export type PingReply = { session: boolean };
