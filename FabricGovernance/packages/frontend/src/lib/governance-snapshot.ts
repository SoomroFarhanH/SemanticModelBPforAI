import type { GovernanceWorkspace } from '@rayfin-app/shared';

export type WorkspaceFilter = 'all' | 'suspended' | 'single-admin' | 'empty' | 'unresolved' | 'unassigned';

export function formatUtc(value: string) {
  return `${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))} UTC`;
}

export function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@\t\r\n]/.test(text.trimStart()) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function workspaceMatches(w: GovernanceWorkspace, filter: WorkspaceFilter) {
  switch (filter) {
    case 'suspended': return w.capacityState === 'Suspended';
    case 'single-admin': return w.singleHuman;
    case 'empty': return w.items === 0;
    case 'unresolved': return w.capacity === 'Not resolvable';
    case 'unassigned': return w.domainId !== undefined ? !w.domainId : w.domain === 'Unassigned';
    default: return true;
  }

}

export function saveFile(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
