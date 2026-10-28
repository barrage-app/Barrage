// Actions d'une ligne de la liste. Chacune écrit dans le stockage, puis
// s'assure qu'un onglet x.com est là pour l'exécuter.
import { wakeXTab } from "../blocking/x-tab.ts";
import { write } from "../../core/write.ts";

/** Interrupteur « Blocage automatique ». Sur Off, un compte bloqué par Barrage est débloqué. */
export async function toggle(handle: string, enabled: boolean): Promise<void> {
  await write("setEnabled", handle, enabled);
  if (!enabled) await wakeXTab();
}

/** Bloquer à la main : le compte passe en tête de file. */
export async function blockNow(handle: string): Promise<void> {
  await write("requestBlock", handle);
  await wakeXTab();
}

/** Débloquer à la main : le blocage automatique passe sur Off. */
export async function unblockNow(handle: string): Promise<void> {
  await write("requestUnblock", handle);
  await wakeXTab();
}
