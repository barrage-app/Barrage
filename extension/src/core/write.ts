// Onglets x.com et options : écriture confiée au service worker, qui les
// applique une à la fois (voir core/writer.ts).
import { WRITE, type WriteReply, type WriteRequest } from "./messages.ts";
import type { Writes } from "./writer.ts";

export async function write<K extends keyof Writes>(
  name: K,
  ...args: Parameters<Writes[K]>
): Promise<Awaited<ReturnType<Writes[K]>>> {
  const request: WriteRequest = { type: WRITE, name, args };
  const reply = (await chrome.runtime.sendMessage(request)) as WriteReply | undefined;
  if (!reply) throw new Error(`Écriture ${name} sans réponse du service worker.`);
  if (!reply.ok) throw new Error(reply.error);
  return reply.value as Awaited<ReturnType<Writes[K]>>;
}
