import snapshot from '@/data/governance-snapshot.json';

type Workspace = (typeof snapshot.workspaces)[number];
export type WorkspaceFilter = 'all' | 'suspended' | 'single-admin' | 'empty' | 'unresolved' | 'unassigned';

export function formatUtc(value: string) {
  return `${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))} UTC`;
}

export function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@\t\r\n]/.test(text.trimStart()) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function workspaceMatches(w: Workspace, filter: WorkspaceFilter) {
  switch (filter) {
    case 'suspended': return w.capacityState === 'Suspended';
    case 'single-admin': return w.singleHuman;
    case 'empty': return w.items === 0;
    case 'unresolved': return w.capacity === 'Not resolvable';
    case 'unassigned': return w.domain === 'Unassigned';
    default: return true;
  }
}
