//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import App from '@/App';
import snapshot from '@/data/governance-snapshot.json';
import { csvCell, workspaceMatches } from '@/lib/governance-snapshot';

describe('App', () => {
  it('renders the snapshot governance overview and evidence', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: snapshot.metrics.suspended.numerator > 0 ? 'Restore availability first.' : 'Review governance priorities.' })
    ).toBeVisible();
    for (const [label, metric] of [
      ['Workspaces on suspended capacity', snapshot.metrics.suspended],
      ['Workspaces with a single human admin', snapshot.metrics.singleAdmin],
      ['Unlabeled Power BI artifacts', snapshot.metrics.unlabeled],
      ['Failed last-recorded refreshes', snapshot.metrics.failedRefresh],
    ] as const) {
      expect(within(screen.getByRole('article', { name: label })).getByRole('img', { name: `${metric.percent}% of ${metric.denominator}` })).toBeVisible();
    }
    expect(screen.getByRole('heading', { name: 'Failed last-recorded refreshes' })).toBeVisible();
    expect(screen.getByText(snapshot.dataClassification === 'synthetic' ? 'Synthetic demo data, not a real tenant audit.' : 'Historical snapshot, not live tenant status.')).toBeVisible();
    expect(screen.getByText(`${snapshot.findings.length} of ${snapshot.findings.length} findings shown`)).toBeVisible();
  });

  it('filters workspace evidence by name and finding', () => {
    render(<App />);

    const search = screen.getByRole('searchbox', {
      name: 'Search workspace, capacity, or admin',
    });
    const workspace = snapshot.workspaces[0];
    const workspaceGrid = screen.getByRole('region', {
      name: 'Workspace evidence grid',
    });
    if (workspace) {
      fireEvent.change(search, { target: { value: workspace.name } });
      expect(within(workspaceGrid).getAllByText(workspace.name).length).toBeGreaterThan(0);
    }

    fireEvent.change(search, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filter workspace findings'), {
      target: { value: 'empty' },
    });
    expect(screen.getByText(`Showing ${snapshot.workspaces.filter(w => w.items === 0).length} of ${snapshot.scope.workspaces} workspaces`)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Filter workspace findings'), {
      target: { value: 'suspended' },
    });
    expect(screen.getByText(`Showing ${snapshot.metrics.suspended.numerator} of ${snapshot.scope.workspaces} workspaces`)).toBeVisible();
  });

  it('filters evidence by pillar and priority', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Filter pillar'), { target: { value: 'Protect' } });
    expect(screen.getByText(`${snapshot.findings.filter(f => f.pillar === 'Protect').length} of ${snapshot.findings.length} findings shown`)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Filter pillar'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filter priority'), { target: { value: 'Critical' } });
    expect(screen.getByText(`${snapshot.findings.filter(f => f.priority === 'Critical').length} of ${snapshot.findings.length} findings shown`)).toBeVisible();
  });

  it('shows supplied owner contacts without linking synthetic IDs to real Fabric', () => {
    render(<App />);
    const workspace = snapshot.workspaces[0];
    if (!workspace) {
      expect(screen.getByText('Showing 0 of 0 workspaces')).toBeVisible();
      return;
    }
    fireEvent.change(screen.getByLabelText('Workspace owner contacts and portal link'), {
      target: { value: workspace.id },
    });
    if (snapshot.dataClassification === 'synthetic') {
      expect(screen.queryByRole('link', { name: `Open ${workspace.name} in Fabric` })).toBeNull();
      expect(screen.getByText('Synthetic workspace - no real Fabric portal link.')).toBeVisible();
    } else if (workspace.url) {
      expect(screen.getByRole('link', { name: `Open ${workspace.name} in Fabric` })).toHaveAttribute('href', workspace.url);
    } else {
      expect(screen.getByText('No verified Fabric portal link supplied.')).toBeVisible();
    }
    for (const admin of workspace.admins) expect(screen.getAllByText(admin.contact).length).toBeGreaterThan(0);
  });

  it('preserves verified source-specific denominators and pagination', () => {
    expect(snapshot.scope.workspaces).toBe(snapshot.workspaces.length);
    expect(snapshot.scope.inventoryItems).toBe(snapshot.itemTypes.reduce((n, t) => n + t.total, 0));
    expect(snapshot.labelTypes.reduce((n, t) => n + t.total, 0)).toBe(snapshot.metrics.unlabeled.denominator);
    expect(snapshot.metrics.unlabeled.numerator).toBe(snapshot.labelTypes.reduce((n, t) => n + t.total - t.labeled, 0));
    expect(snapshot.metrics.endorsed.denominator).toBe(snapshot.scope.endorsementArtifacts);
    expect(snapshot.refreshFailures).toHaveLength(snapshot.metrics.failedRefresh.numerator);
    expect(snapshot.sources.every(s => s.complete)).toBe(true);
    expect(snapshot.workspaces.filter(w => workspaceMatches(w, 'single-admin'))).toHaveLength(snapshot.metrics.singleAdmin.numerator);
    expect(snapshot.workspaces.filter(w => workspaceMatches(w, 'unresolved'))).toHaveLength(snapshot.workspaces.filter(w => w.capacity === 'Not resolvable').length);
  });

  it('quotes CSV fields and prevents spreadsheet formula interpretation', () => {
    expect(csvCell('A "quoted", name')).toBe('"A ""quoted"", name"');
    expect(csvCell('=HYPERLINK("example")')).toBe('"\'=HYPERLINK(""example"")"');
    expect(csvCell('  +formula')).toBe('"\'  +formula"');
    expect(csvCell(44)).toBe('"44"');
  });
});
