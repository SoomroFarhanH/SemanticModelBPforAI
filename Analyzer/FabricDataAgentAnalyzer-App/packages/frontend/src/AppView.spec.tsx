import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppView } from './AppView';
import type { RunsApi } from './hooks/use-runs';
import { sampleRecords, sampleText } from '@/test/fixtures';

// Charts render through Vega, which needs a real browser; the specs assert the
// data the charts receive instead.
vi.mock('@microsoft/fabric-visuals', () => ({
  useCssTheme: () => ({}),
  VegaVisual: ({ data }: { data: { rows: unknown[] } }) => (
    <div data-testid="chart" data-rows={data.rows.length} />
  ),
}));

const { run, findings } = sampleRecords();

function fakeApi(overrides: Partial<RunsApi> = {}): RunsApi {
  return {
    runs: [run],
    runsStatus: 'ready',
    runsError: null,
    selectedRun: run,
    selectRun: vi.fn(),
    findings,
    findingsStatus: 'ready',
    findingsError: null,
    reloadFindings: vi.fn(async () => {}),
    reloadRuns: vi.fn(async () => {}),
    importState: { status: 'idle' },
    importParsed: vi.fn(async () => true),
    resetImport: vi.fn(),
    removeRun: vi.fn(async () => {}),
    deleting: false,
    actionError: null,
    clearActionError: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
});

describe('overview', () => {
  it('shows the score, rating, release gates and charts for the selected run', () => {
    render(<AppView api={fakeApi()} />);

    expect(
      screen.getByRole('heading', { name: /SAMPLE - Contoso Sales Agent/ })
    ).toBeVisible();
    expect(screen.getByRole('img', { name: 'Readiness score 50 percent' })).toBeVisible();
    expect(screen.getByText('NOT READY')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Evaluation coverage' })).toHaveAttribute(
      'aria-valuenow',
      '75'
    );
    expect(screen.getByText('5 of 10 passed')).toBeVisible();
    expect(screen.getByText('No open BLOCKER findings')).toBeVisible();
    expect(screen.getByTestId('chart')).toBeInTheDocument();
  });

  it('lists the highest-severity items first under "Fix these first"', () => {
    render(<AppView api={fakeApi()} />);
    const section = screen.getByRole('heading', { name: 'Fix these first' })
      .closest('section')!;
    const items = within(section).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent('AI Data Schema is configured');
    expect(items[0]).toHaveTextContent('Blocker');
  });

  it('opens the findings tab filtered to a severity from its tile', () => {
    render(<AppView api={fakeApi()} />);
    fireEvent.click(screen.getByRole('button', { name: /^1\s*Blocker$/ }));

    expect(screen.getByRole('tab', { name: 'Findings' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('SM-019')).toBeVisible();
    expect(screen.queryByText('DA-002')).toBeNull();
  });

  it('hides the trend chart until the agent has more than one run', () => {
    render(<AppView api={fakeApi()} />);
    expect(screen.queryByText('Progress across runs')).toBeNull();

    const older = { ...run, id: 'run-0', generatedAt: new Date('2026-09-01') };
    render(<AppView api={fakeApi({ runs: [run, older] })} />);
    expect(screen.getByText('Progress across runs')).toBeVisible();
  });
});

describe('findings', () => {
  function openFindings() {
    render(<AppView api={fakeApi()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Findings' }));
  }

  it('defaults to open issues and explains how to fix an item on expand', () => {
    openFindings();
    expect(screen.getByRole('tab', { name: /Open issues/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.queryByText('DA-001')).toBeNull();

    const card = screen.getByText('DA-002').closest('li')!;
    fireEvent.click(within(card).getByRole('button'));
    expect(within(card).getByText('How to fix')).toBeVisible();
    expect(within(card).getByText(/Add agent instructions/)).toBeVisible();
    expect(within(card).getByRole('link', { name: /Microsoft Learn/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer'
    );
  });

  it('switches views and filters by search text', () => {
    openFindings();
    fireEvent.click(screen.getByRole('tab', { name: /Needs evidence/ }));
    expect(screen.getByText('DA-009')).toBeVisible();
    expect(screen.queryByText('DA-002')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /All checks/ }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search findings' }), {
      target: { value: 'naming' },
    });
    expect(screen.getByText('SM-005')).toBeVisible();
    expect(screen.queryByText('DA-002')).toBeNull();
  });

  it('copies the filtered list as a checklist', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    openFindings();
    fireEvent.click(screen.getByRole('button', { name: 'Copy as checklist' }));
    await screen.findByRole('button', { name: 'Copied' });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('- [ ] **SM-019**')
    );
  });

  it('shows an actionable error when findings fail to load', () => {
    const reloadFindings = vi.fn(async () => {});
    render(
      <AppView
        api={fakeApi({
          findings: [],
          findingsStatus: 'error',
          findingsError: 'Network down',
          reloadFindings,
        })}
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Findings' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reloadFindings).toHaveBeenCalled();
  });
});

describe('states', () => {
  it('guides a first-time user instead of showing empty numbers', () => {
    render(<AppView api={fakeApi({ runs: [], selectedRun: null, findings: [] })} />);
    expect(
      screen.getByRole('heading', { name: 'How ready is your data agent?' })
    ).toBeVisible();
    expect(screen.queryByRole('img', { name: /Readiness score/ })).toBeNull();
  });

  it('reports a failed history load with a retry', () => {
    const reloadRuns = vi.fn(async () => {});
    render(
      <AppView
        api={fakeApi({
          runs: [],
          selectedRun: null,
          runsStatus: 'error',
          runsError: 'Not signed in',
          reloadRuns,
        })}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Not signed in');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reloadRuns).toHaveBeenCalled();
  });

  it('asks for confirmation before deleting a run', () => {
    const removeRun = vi.fn(async () => {});
    render(<AppView api={fakeApi({ removeRun })} />);
    fireEvent.click(screen.getByRole('button', { name: /^Delete SAMPLE/ }));
    expect(removeRun).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('and its findings');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(removeRun).toHaveBeenCalledWith('run-1');
  });
});

describe('import', () => {
  function openImport(api: RunsApi) {
    render(<AppView api={api} />);
    fireEvent.click(screen.getByRole('button', { name: /Import results/ }));
    return screen.getByRole('dialog', { name: 'Import analyzer results' });
  }

  async function chooseFile(dialog: HTMLElement, text: string) {
    const file = new File([text], 'agent_evidence.json', {
      type: 'application/json',
    });
    fireEvent.change(within(dialog).getByLabelText('Analyzer evidence JSON file'), {
      target: { files: [file] },
    });
  }

  it('previews a chosen export and imports it', async () => {
    const importParsed = vi.fn<RunsApi['importParsed']>(async () => true);
    const dialog = openImport(
      fakeApi({ runs: [], selectedRun: null, importParsed })
    );
    expect(within(dialog).getByRole('button', { name: 'Import results' })).toBeDisabled();

    await chooseFile(dialog, sampleText());
    expect(await within(dialog).findByText('29 checks', { exact: false })).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import results' }));

    expect(importParsed).toHaveBeenCalledTimes(1);
    expect(importParsed.mock.calls[0][0].findings).toHaveLength(29);
  });

  it('rejects a file that is not an analyzer export', async () => {
    const dialog = openImport(fakeApi());
    await chooseFile(dialog, '{"hello":"world"}');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/scorecard/);
    expect(within(dialog).getByRole('button', { name: 'Import results' })).toBeDisabled();
  });

  it('blocks importing the same export twice', async () => {
    const dialog = openImport(fakeApi());
    await chooseFile(dialog, sampleText());
    expect(await within(dialog).findByText(/already imported/)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Import results' })).toBeDisabled();
  });

  it('shows save progress and a failure that kept nothing', () => {
    const importing = openImport(
      fakeApi({
        importState: {
          status: 'importing',
          progress: { phase: 'findings', done: 8, total: 29 },
        },
      })
    );
    expect(within(importing).getByText('Saving checks 8 of 29')).toBeVisible();
    expect(within(importing).getByRole('progressbar', { name: 'Import progress' })).toHaveAttribute(
      'aria-valuenow',
      '28'
    );
  });

  it('reports a failed import', () => {
    const dialog = openImport(
      fakeApi({ importState: { status: 'error', error: 'Server said no.' } })
    );
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'nothing was kept. Server said no.'
    );
  });
});
