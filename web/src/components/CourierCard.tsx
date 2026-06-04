import type { Status } from '../lib/api';

/** The courier's ERC-8004 identity — a dynamic, tradeable "reputation card". */
export function CourierCard({ status, justDelivered }: { status: Status | null; justDelivered: boolean }) {
  const id = status?.courier.agentId ?? '—';
  const deliveries = status?.reputation.deliveries ?? 0;
  const score = status?.reputation.score ?? 0;

  return (
    <div className="card" style={justDelivered ? { boxShadow: 'var(--glow-signal)' } : undefined}>
      <div className="card__top">
        <div>
          <div className="card__id">ERC-8004 · courier</div>
          <div className="card__num">#{id}</div>
        </div>
        <div className="card__seal">DEAD&nbsp;ZONE</div>
      </div>

      <div className="card__stats">
        <div className="stat">
          <div className="stat__k">deliveries</div>
          <div className="stat__v">{deliveries}</div>
        </div>
        <div className="stat">
          <div className="stat__k">trust score</div>
          <div className="stat__v">
            {score}
            <small> / 100</small>
          </div>
          <div className="gauge">
            <i style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          fontFamily: 'var(--mono)',
          fontSize: 11.5,
          color: 'var(--muted)',
          lineHeight: 1.6,
          position: 'relative',
        }}
      >
        Earned on-chain for honest delivery. Every decision is pre-committed to the ERC-8004 Validation Registry
        <span className="signal"> before</span> settlement — so this record can't be faked.
      </div>

      {status?.addresses?.identity && (
        <a
          href={`${status.chain.explorer}/address/${status.addresses.identity}`}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex',
            marginTop: 16,
            fontFamily: 'var(--mono)',
            fontSize: 11.5,
            letterSpacing: '0.06em',
          }}
        >
          view identity registry ↗
        </a>
      )}
    </div>
  );
}
