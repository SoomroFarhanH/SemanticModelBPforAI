import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DataTable } from '@microsoft/fabric-visuals-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import sample from './data/governance-snapshot.json';
import { MAX_SNAPSHOT_BYTES } from '@rayfin-app/shared/governance-snapshot';

vi.mock('@microsoft/fabric-visuals', async importOriginal => {
  const actual = await importOriginal<typeof import('@microsoft/fabric-visuals')>();
  return { ...actual, VegaVisual: ({ data }: { data: DataTable }) => <pre data-testid="label-chart">{JSON.stringify(data)}</pre> };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function clientReview() {
  const review = structuredClone(sample);
  review.dataClassification = 'tenant';
  review.tenantId = 'CLIENT-EXAMPLE-NOT-A-REAL-TENANT';
  review.interpretation = 'A separate client example loaded in this browser session.';
  review.labelTypes[0].labeled = 3;
  review.metrics.unlabeled.numerator = 7;
  review.metrics.unlabeled.percent = 58.3;
  review.metrics.labeled.numerator = 5;
  review.metrics.labeled.percent = 41.7;
  review.refreshFailures[0].name = 'Client Example Model';
  const finding = review.findings.find(f => f.key === 'unlabeled');
  if (finding) finding.evidence = review.metrics.unlabeled;
  return review;
}
function select(contents: string, name = 'client-review.json') {
  fireEvent.change(screen.getByLabelText('Select governance review JSON'), {
    target: { files: [new File([contents], name, { type: 'application/json' })] },
  });
}
async function previewClient() {
  select(JSON.stringify(clientReview()));
  return screen.findByRole('region', { name: 'Review import preview' });
}
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Expected text.'));
    reader.onerror = () => reject(new Error('Could not read the exported test blob.'));
    reader.readAsText(blob);
  });
}

describe('session-only review import', () => {
  it('previews the tenant/counts without replacing the current dashboard until confirmed', async () => {
    render(<App />);
    const preview = await previewClient();
    expect(within(preview).getByText(/CLIENT-EXAMPLE-NOT-A-REAL-TENANT/)).toBeVisible();
    expect(screen.getByText('Synthetic demo data, not a real tenant audit.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Show this review' }));
    expect(screen.getByText('Historical snapshot, not live tenant status.')).toBeVisible();
    expect(screen.getByText('A separate client example loaded in this browser session.')).toBeVisible();
    expect(screen.getByText(/Loaded client-review.json in this tab only/)).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Review import preview' })).toBeNull();
  });

  it('updates KPIs, chart rows, coverage and endorsed model evidence together', async () => {
    render(<App />);
    await previewClient();
    fireEvent.click(screen.getByRole('button', { name: 'Show this review' }));
    const metric = screen.getByRole('article', { name: 'Unlabeled Power BI artifacts' });
    expect(within(metric).getByRole('img', { name: '58.3% of 12' })).toBeVisible();
    expect(screen.getByTestId('label-chart')).toHaveTextContent('["SemanticModel",3]');
    expect(screen.getByRole('img', { name: 'Sensitivity label present: 5 of 12' })).toBeVisible();
    expect(screen.getAllByText(/Client Example Model/).length).toBeGreaterThan(0);
  });

  it('clears stale filters/selections when a different review is applied and when restored', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Filter workspace findings'), { target: { value: 'empty' } });
    fireEvent.change(screen.getByLabelText('Filter pillar'), { target: { value: 'Protect' } });
    await previewClient();
    fireEvent.click(screen.getByRole('button', { name: 'Show this review' }));
    expect(screen.getByLabelText('Filter workspace findings')).toHaveValue('all');
    expect(screen.getByLabelText('Filter pillar')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Restore bundled snapshot' }));
    expect(screen.getByText('Synthetic demo data, not a real tenant audit.')).toBeVisible();
    expect(screen.getByTestId('label-chart')).toHaveTextContent('["SemanticModel",4]');
    expect(screen.queryByText(/Loaded client-review/)).toBeNull();
  });

  it('cancels a validated preview without applying it', async () => {
    render(<App />);
    await previewClient();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel import' }));
    expect(screen.queryByRole('region', { name: 'Review import preview' })).toBeNull();
    expect(screen.getByText('Synthetic demo data, not a real tenant audit.')).toBeVisible();
  });

  it('does not resurrect a file read that completes after restore was selected', () => {
    const readers: FileReader[] = [];
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) { readers.push(this); });
    render(<App />);
    select(JSON.stringify(clientReview()));
    expect(screen.getByLabelText('Select governance review JSON')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Restore bundled snapshot' }));
    expect(screen.getByLabelText('Select governance review JSON')).not.toBeDisabled();
    const pending = readers[0];
    expect(pending).toBeDefined();
    if (!pending) throw new Error('The fixture must start a file read.');
    Object.defineProperty(pending, 'result', { value: JSON.stringify(clientReview()) });
    pending.dispatchEvent(new ProgressEvent('load'));
    expect(screen.queryByRole('region', { name: 'Review import preview' })).toBeNull();
    expect(screen.getByText('Synthetic demo data, not a real tenant audit.')).toBeVisible();
  });

  it('rejects malformed, unsupported and inconsistent reviews, retaining the already loaded review', async () => {
    render(<App />);
    await previewClient();
    fireEvent.click(screen.getByRole('button', { name: 'Show this review' }));
    select('<html>not an export</html>');
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid JSON');
    expect(screen.getByText('A separate client example loaded in this browser session.')).toBeVisible();
    const newer = clientReview(); newer.schemaVersion = 2;
    select(JSON.stringify(newer));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unsupported schemaVersion'));
    const inconsistent = clientReview(); inconsistent.metrics.suspended.percent = 99;
    select(JSON.stringify(inconsistent));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('percentage'));
    expect(screen.getByText('A separate client example loaded in this browser session.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Show this review' })).toBeNull();
  });

  it('rejects oversized files before reading and surfaces file read errors', async () => {
    render(<App />);
    const oversized = new File([], 'oversized.json');
    Object.defineProperty(oversized, 'size', { value: MAX_SNAPSHOT_BYTES + 1 });
    fireEvent.change(screen.getByLabelText('Select governance review JSON'), { target: { files: [oversized] } });
    expect(screen.getByRole('alert')).toHaveTextContent('25 MB');
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      this.dispatchEvent(new ProgressEvent('error'));
    });
    select('{}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to read');
  });

  it('does not upload or persist an imported review and returns to the bundle after unmount', async () => {
    const view = render(<App />);
    const network = vi.spyOn(globalThis, 'fetch');
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    await previewClient();
    fireEvent.click(screen.getByRole('button', { name: 'Show this review' }));
    expect(network).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    view.unmount();
    render(<App />);
    expect(screen.getByText('Synthetic demo data, not a real tenant audit.')).toBeVisible();
    expect(screen.queryByText('A separate client example loaded in this browser session.')).toBeNull();
  });

  it('exports the active imported review, not the bundled sample', async () => {
    render(<App />);
    await previewClient();
    fireEvent.click(screen.getByRole('button', { name: 'Show this review' }));
    const created = vi.fn<(blob: Blob) => string>(() => 'blob:test');
    vi.stubGlobal('URL', class extends URL {
      static override createObjectURL = created;
      static override revokeObjectURL = vi.fn();
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Report JSON' }));
    const exported = JSON.parse(await readBlob(created.mock.calls[0][0]));
    expect(exported.tenantId).toBe('CLIENT-EXAMPLE-NOT-A-REAL-TENANT');
    expect(exported.metrics.unlabeled.numerator).toBe(7);
    expect(exported.schemaVersion).toBe(1);
  });

  it('provides the copy-ready prompt and formal schema without a network fetch', () => {
    render(<App />);
    const details = screen.getByText('First time? Get the skills, prompt, and export contract').closest('details');
    expect(details).not.toBeNull();
    details!.open = true;
    expect(screen.getByLabelText<HTMLTextAreaElement>('Health review prompt').value).toContain('snapshot:validate');
    expect(screen.getByRole('button', { name: 'Download export schema' })).toBeVisible();
  });
});
