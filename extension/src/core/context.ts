/** Content script : l'extension a été rechargée ou désinstallée, ce script est orphelin. */
export function contextAlive(): boolean {
  return chrome.runtime?.id !== undefined;
}
