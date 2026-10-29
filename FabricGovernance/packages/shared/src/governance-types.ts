export interface GovernanceMetric {
  numerator: number;
  denominator: number;
  percent: number;
  scope: string;
  source: string;
}

export interface GovernanceWorkspace {
  id: string;
  name: string;
  domain: string;
  domainId?: string;
  capacity: string;
  capacityId: string;
  capacityState: string;
  admins: { name: string; type: string; contact: string }[];
  adminCount: number;
  items: number;
  described: number;
  tagged: number;
  singleHuman: boolean;
  url: string;
}

export interface GovernanceSnapshot {
  schemaVersion: 1;
  dataClassification: 'synthetic' | 'tenant';
  readOnly: true;
  tenantId: string;
  purpose: string;
  skill: string;
  status: string;
  interpretation: string;
  collectedFrom: string;
  collectedTo: string;
  scope: {
    workspaces: number; allWorkspaces: number; inventoryItems: number;
    rawInventoryItems: number; excludedItems: number;
    exclusions: { key: string; count: number }[];
    domains: number; capacities: number; personalWorkspaces: number;
    scannedWorkspaces: number; labelArtifacts: number;
    endorsementArtifacts: number; scanOnlyArtifacts: number; freshness: string;
  };
  metrics: Record<'suspended' | 'singleAdmin' | 'unlabeled' | 'failedRefresh' | 'domainAssigned' | 'described' | 'tagged' | 'labeled' | 'endorsed', GovernanceMetric>;
  workspaces: GovernanceWorkspace[];
  capacities: {
    id: string; name: string; sku: string; state: string; admins: string[];
    serviceManagedReserved: boolean; workspaceCount: number;
    workspaceNames: string[]; itemCount: number;
  }[];
  domains: {
    id: string; displayName: string; description: string;
    workspaceNames: string[]; workspaceCount: number; adminCount: number;
    entireTenantContributor: boolean; directAdminContacts: string[];
  }[];
  findings: {
    key: string; pillar: 'Health' | 'Protect' | 'Trust';
    priority: 'Critical' | 'High' | 'Medium' | 'Low';
    title: string; evidence: GovernanceMetric; why: string; action: string;
    owner: string; effort: string; examples: string[]; detail: string;
  }[];
  itemTypes: { type: string; total: number; described: number; tagged: number }[];
  labelTypes: { type: string; total: number; labeled: number }[];
  refreshFailures: {
    id: string; name: string; workspace: string; status: string; error: string;
    lastAttempt: string; scheduleEnabled: boolean; configuredBy: string[];
    endorsed: boolean;
  }[];
  sources: { name: string; source: string; complete: true; pages: number; count: number; fetchedAt: string }[];
  scanner: { id: string; complete: true; requested: number; returned: number; startedAt: string }[];
  remediation: { step: number; title: string; owner: string; action: string }[];
  clean: string[];
  blindSpots: string[];
  docs: { title: string; url: string }[];
}
