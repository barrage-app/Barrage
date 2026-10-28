export async function setNotify(notify: boolean): Promise<void> {
  await chrome.storage.local.set({ notify });
}
