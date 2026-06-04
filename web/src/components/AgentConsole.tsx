import { useEffect, useRef, useState } from 'react';
import type { PayResult } from '../lib/api';

export interface ConsoleStep {
  at: number;
  line: string;
}

function classify(line: string): string {
  if (line.includes('rejected') || line.includes('expired') || line.includes('error')) return 'logline--danger';
  if (line.includes('🧠') || line.includes('settled 1') || line.includes('✓')) return 'logline--signal';
  if (line.includes('🔒') || line.includes('📜') || line.includes('⛓️')) return 'logline--amber';
  if (line.includes('nothing')) return 'logline--muted';
  return '';
}

/** Streams the agent's reasoning steps with their real timings — the "black box" recorder. */
export function AgentConsole({
  result,
  running,
  brain,
}: {
  result: PayResult | null;
  running: boolean;
  brain: string;
}) {
  const [shown, setShown] = useState<ConsoleStep[]>([]);
  const [rationale, setRationale] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShown([]);
    setRationale(null);
    if (!result) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // compress real timings into a snappy <6s replay
    const span = Math.max(1, result.steps[result.steps.length - 1]?.at ?? 1);
    const scale = Math.min(1, 5000 / span);
    result.steps.forEach((s) => {
      timers.push(
        setTimeout(() => {
          setShown((prev) => [...prev, s]);
          if (s.line.includes('🧠')) {
            setRationale(result.plan.rationale);
          }
        }, s.at * scale + 200),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [result]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' });
  }, [shown, rationale]);

  const brainLabel = brain === 'glm' ? 'Z.AI GLM' : brain === 'claude' ? 'CLAUDE' : 'RULES ENGINE';

  return (
    <div className="panel panel--corner">
      <div className="panel__head">
        <span>
          <b>AGENT</b> · black-box recorder
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className={`dot ${running ? 'dot--pulse' : ''}`} />
          {running ? 'thinking' : 'standby'} · {brainLabel}
        </span>
      </div>

      <div className="console" ref={boxRef}>
        {shown.length === 0 && !running && (
          <div className="logline logline--muted" style={{ animation: 'none', opacity: 1, transform: 'none' }}>
            <span className="logline__t">--:--</span>
            <span className="logline__b">awaiting a payment off the mesh…</span>
          </div>
        )}

        {shown.map((s, i) => {
          const isBrain = s.line.includes('🧠');
          if (isBrain && rationale) {
            return (
              <div key={i} className="brainline" style={{ animation: 'lineIn 0.34s ease forwards' }}>
                <div className="brainline__tag">⛬ {brainLabel} decided</div>
                <div className="brainline__txt">"{rationale.replace(/^\[(GLM|Claude)\]\s*/, '')}"</div>
              </div>
            );
          }
          return (
            <div key={i} className={`logline ${classify(s.line)}`}>
              <span className="logline__t">+{(s.at / 1000).toFixed(2)}s</span>
              <span className="logline__b">{s.line.replace(/^[🔎🧠🔒⛓️📜]\s*/u, '')}</span>
            </div>
          );
        })}

        {running && (
          <div className="logline" style={{ animation: 'none', opacity: 1, transform: 'none' }}>
            <span className="logline__t signal">live</span>
            <span className="logline__b cursor" />
          </div>
        )}
      </div>

      {result && (
        <Receipts result={result} />
      )}
    </div>
  );
}

function Receipts({ result }: { result: PayResult }) {
  const rows: { k: string; tx: string; url: string }[] = [
    { k: 'pre-commit', tx: result.txs.preCommit, url: result.explorerTxs.preCommit },
    { k: 'settle', tx: result.txs.settle, url: result.explorerTxs.settle },
    { k: 'attest', tx: result.txs.attest, url: result.explorerTxs.attest },
  ].filter((r) => r.tx && r.tx !== '0xnone');

  return (
    <div className="receipts">
      {rows.map((r) => (
        <a className="receipt" key={r.k} href={r.url} target="_blank" rel="noreferrer">
          <span className="receipt__l">
            <span className="dot dot--amber" />
            {r.k}
          </span>
          <span className="receipt__hash">{r.tx.slice(0, 12)}…{r.tx.slice(-6)} ↗</span>
        </a>
      ))}
      {result.simulated && (
        <div className="receipt" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
          <span className="receipt__l">mode</span>
          <span className="mono muted">simulated (gateway offline) — run the gateway for real txs</span>
        </div>
      )}
    </div>
  );
}
