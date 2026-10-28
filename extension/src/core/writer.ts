// Service worker : seul contexte qui modifie l'état. Les écritures qui lisent
// l'état puis le réécrivent s'y appliquent une à la fois, d'où qu'elles
// viennent (onglets x.com, options, service worker lui-même). Sans cela, deux
// écritures simultanées liraient le même état et la seconde effacerait la
// première.
import { addHandles, requestBlock, requestUnblock, setEnabled } from "../features/accounts/store.ts";
import { finishUnblock, markAlreadyBlocked, recordBlockFailure, refuseUnblock } from "../features/blocking/store.ts";
import { addSeen } from "../features/timeline/store.ts";
import { isWriteRequest, type WriteReply } from "./messages.ts";

const WRITES = {
  addHandles,
  addSeen,
  finishUnblock,
  markAlreadyBlocked,
  recordBlockFailure,
  refuseUnblock,
  requestBlock,
  requestUnblock,
  setEnabled,
};

export type Writes = typeof WRITES;

let tail: Promise<unknown> = Promise.resolve();

/** Applique `task` après les écritures en cours, dans l'ordre d'arrivée. */
export function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => {});
  return run;
}

export function serveWrites(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (reply: WriteReply) => void) => {
    if (!isWriteRequest(message) || !Object.hasOwn(WRITES, message.name)) return false;
    const write = WRITES[message.name as keyof Writes] as (...args: unknown[]) => Promise<unknown>;
    serial(() => write(...message.args)).then(
      (value) => sendResponse({ ok: true, value }),
      (err: unknown) => sendResponse({ ok: false, error: String(err) }),
    );
    return true; // réponse asynchrone
  });
}
