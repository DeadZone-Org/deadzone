import { useState } from 'react';

export function SendPanel({
  onSend,
  running,
}: {
  onSend: (args: { to: string; amount: string; expire: boolean }) => void;
  running: boolean;
}) {
  const [amount, setAmount] = useState('100');
  const [to, setTo] = useState('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
  const [expire, setExpire] = useState(false);

  return (
    <div className="panel panel--corner">
      <div className="panel__head">
        <span>
          <b>SEND</b> · offline · gasless
        </span>
        <span>EIP-3009</span>
      </div>
      <div className="send">
        <div className="field send__amount">
          <label>amount · dUSD</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            inputMode="decimal"
            aria-label="amount in dUSD"
          />
        </div>
        <div className="field">
          <label>recipient</label>
          <input value={to} onChange={(e) => setTo(e.target.value.trim())} spellCheck={false} aria-label="recipient address" />
        </div>

        <label className="toggle">
          <input type="checkbox" checked={expire} onChange={(e) => setExpire(e.target.checked)} />
          simulate a stale hop — watch the agent reject it
        </label>

        <button className="btn" disabled={running || !amount || !to} onClick={() => onSend({ to, amount, expire })}>
          {running ? 'relaying…' : '⚡ send with no signal'}
        </button>

        <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
          You sign locally. Your phone never touches the internet — nearby phones relay the payment until one reaches a
          gateway that settles it on Mantle.
        </div>
      </div>
    </div>
  );
}
