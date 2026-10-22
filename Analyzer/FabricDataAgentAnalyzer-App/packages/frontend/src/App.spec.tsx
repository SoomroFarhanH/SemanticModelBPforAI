import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import App from '@/App';

vi.mock('@/lib/runs-api', () => ({
  listRuns: vi.fn(async () => []),
  listFindings: vi.fn(async () => []),
  importRun: vi.fn(),
  deleteRun: vi.fn(),
}));

describe('App', () => {
  it('loads history and guides a first-time user to import results', async () => {
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'How ready is your data agent?' })
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Data Agent Readiness' })
    ).toBeVisible();
  });
});
