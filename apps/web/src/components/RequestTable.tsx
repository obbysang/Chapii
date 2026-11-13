import { Link } from 'react-router-dom';
import type { RequestDto } from '@agentvault/shared';
import { ArrowUpRight, CalendarClock } from 'lucide-react';
import { amountWithSymbol, shortDate, truncateMiddle, isRejection } from '../lib/utils';
import { ReasonBadge, RequestStatusBadge } from './ui';

export function RequestTable({
  requests,
  vaultId,
  empty,
  showAgent = true,
}: {
  requests: RequestDto[];
  vaultId: string;
  empty?: React.ReactNode;
  showAgent?: boolean;
}) {
  if (requests.length === 0) return <>{empty}</>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-ink-700 text-[10px] uppercase tracking-wider text-slate-500">
            <th scope="col" className="px-3 py-2 font-semibold">#</th>
            <th scope="col" className="px-3 py-2 font-semibold">Status</th>
            <th scope="col" className="px-3 py-2 font-semibold">Amount</th>
            <th scope="col" className="px-3 py-2 font-semibold">Recipient</th>
            {showAgent ? (
              <th scope="col" className="px-3 py-2 font-semibold">Agent</th>
            ) : null}
            <th scope="col" className="px-3 py-2 font-semibold">Reason / memo</th>
            <th scope="col" className="px-3 py-2 font-semibold">When</th>
            {/* `relative` keeps the absolutely positioned label inside this cell,
                so it cannot escape the table's horizontal scroll container. */}
            <th scope="col" className="relative px-3 py-2">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id} className="table-row group">
              <td className="px-3 py-3 text-xs text-slate-500">#{request.onchainId}</td>
              <td className="px-3 py-3">
                <RequestStatusBadge status={request.status} />
              </td>
              <td className="px-3 py-3">
                <span className="font-medium tabular-nums text-slate-100">
                  {amountWithSymbol(request.amount, request.asset)}
                </span>
                <span className="ml-1.5 text-[10px] uppercase text-slate-500">{request.chain}</span>
              </td>
              <td className="px-3 py-3">
                <span className="mono block max-w-[180px] truncate text-xs text-slate-300" title={request.address}>
                  {truncateMiddle(request.address, 12, 8)}
                </span>
                <span className="text-[10px] text-slate-500">{request.clientRef}</span>
              </td>
              {showAgent ? (
                <td className="px-3 py-3 text-xs text-slate-300">
                  {request.agentName ?? truncateMiddle(request.agentPublicKey, 8, 6)}
                </td>
              ) : null}
              <td className="max-w-[240px] px-3 py-3">
                {request.reason ? (
                  <ReasonBadge reason={request.reason} />
                ) : isRejection(request.status) ? (
                  <span className="text-xs text-slate-500">—</span>
                ) : null}
                {request.memo ? (
                  <p className="mt-1 line-clamp-1 text-[11px] text-slate-500" title={request.memo}>
                    {request.memo}
                  </p>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" /> {shortDate(request.createdAt)}
                </span>
              </td>
              <td className="px-3 py-3 text-right">
                <Link
                  to={`/app/requests/${request.onchainId}`}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-ink-800 hover:text-slate-200"
                >
                  Open <ArrowUpRight className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
