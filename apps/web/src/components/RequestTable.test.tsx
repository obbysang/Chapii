import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { RequestDto } from '@agentvault/shared';
import { RequestTable } from './RequestTable';

const base: RequestDto = {
  id: 'req-1',
  vaultId: 'demo.agentvault.testnet',
  onchainId: 7,
  agentPublicKey: 'ed25519:9rA8mJgY7sM4H1xQ2vN5bK6cD3eF0gH8iJ2kL4mN6pQ',
  agentName: 'Research agent',
  clientRef: 'ref-abc',
  asset: 'NEAR',
  amount: '1500000000000000000000000',
  chain: 'near',
  address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  destAsset: null,
  memo: 'API usage',
  status: 'COMPLETED',
  reason: null,
  txHash: null,
  depositAddress: null,
  settlementRef: null,
  verification: 'UNVERIFIED',
  createdAt: '2026-01-02T03:04:05.000Z',
  decidedAt: '2026-01-02T03:04:06.000Z',
  jobState: null,
};

function renderTable(requests: RequestDto[], empty?: React.ReactNode) {
  return render(
    <MemoryRouter>
      <RequestTable requests={requests} vaultId={base.vaultId} empty={empty} />
    </MemoryRouter>,
  );
}

describe('RequestTable', () => {
  it('renders the empty slot when there are no requests', () => {
    renderTable([], <p>No requests yet</p>);
    expect(screen.getByText('No requests yet')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders a completed request with amount, status and memo', () => {
    renderTable([base]);
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('1.5 NEAR')).toBeTruthy();
    expect(screen.getByText('API usage')).toBeTruthy();
    expect(screen.getByText('Research agent')).toBeTruthy();
    expect(screen.getByText('#7')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open/ }).getAttribute('href')).toBe(
      '/app/requests/7',
    );
  });

  it('shows the reason badge for a rejected request', () => {
    renderTable([
      {
        ...base,
        status: 'REJECTED',
        reason: 'PER_TX_CAP_EXCEEDED',
      },
    ]);
    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(screen.getByText('PER_TX_CAP_EXCEEDED')).toBeTruthy();
  });
});
