import { createLocalBackup, restoreLocalBackup } from "./localDb";

export async function downloadLocalBackup(): Promise<void> {
  const blob = await createLocalBackup();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `incident-triage-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export { restoreLocalBackup };
