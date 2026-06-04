import { useEffect, useRef, useState } from 'react';
import { AgentConsole } from './components/AgentConsole';
import { CourierCard } from './components/CourierCard';
import { MeshCanvas, type MeshPhase } from './components/MeshCanvas';
import { SendPanel } from './components/SendPanel';
import { getStatus, pay, type PayResult, type Status } from './lib/api';

const FLOW = [
  { n: '01', t: 'Sign', d: 'Sign an EIP-3009 payment locally. No internet, no gas, no popup.' },
  { n: '02', t: 'Relay', d: 'Fragments hop phone-to-phone over Bluetooth LE until one finds signal.' },
  { n: '03', t: 'Decide', d: 'The gateway agent validates, rejects bad payments, and plans the settlement.' },
  { n: '04', t: 'Settle', d: 'It pre-commits the decision to ERC-8004, then settles on Mantle.' },
  { n: '05', t: 'Earn', d: 'The courier attests the outcome and earns verifiable on-chain reputation.' },
];

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<MeshPhase>('idle');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PayResult | null>(null);
  const [justDelivered, setJustDelivered] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getStatus().then(setStatus);
  }, []);

  async function handleSend(args: { to: string; amount: string; expire: boolean }) {
    if (running) return;
    setRunning(true);
    setResult(null);
    setJustDelivered(false);

    // animate the mesh journey while the (real) gateway works
    setPhase('sign');
    await wait(700);
    setPhase('relay');
    await wait(1700);
    setPhase('gateway');

    const res = await pay(args);

    // reveal outcome on the mesh after the console has streamed a beat
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      setPhase(res.ok ? 'settled' : 'rejected');
      if (res.ok) {
        setJustDelivered(true);
        setStatus((s) => (s ? { ...s, reputation: res.reputation } : s));
        setTimeout(() => setJustDelivered(false), 2200);
      }
      setRunning(false);
    }, 2600);

    setResult(res);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden>
            <i /><i /><i /><i />
          </span>
          <span className="brand__name">
            DEAD<b>ZONE</b>
          </span>
        </div>
        <div className="topbar__meta">
          <span className="chip chip--hide">
            <span className="dot dot--amber" /> {status?.chain.name ?? 'Mantle Sepolia'}
          </span>
          <span className="chip chip--hide">
            brain ·{' '}
            <b>{status?.brain === 'glm' ? 'Z.ai GLM' : status?.brain === 'claude' ? 'Claude' : 'rules'}</b>
          </span>
          <span className="chip">
            <span className="dot dot--pulse" /> courier <b>#{status?.courier.agentId ?? '—'}</b>
          </span>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div>
          <div className="hero__eyebrow">offline payments · settled by an AI agent</div>
          <h1>
            Send crypto<br />
            with <span className="strike">no</span> <em>signal</em>.
          </h1>
          <p className="hero__sub">
            No internet? No problem. Your gasless payment hops across a <b>Bluetooth mesh</b> of nearby phones until one
            reaches a gateway — where an <b>autonomous AI agent</b> settles it on <b>Mantle</b> and earns verifiable
            on-chain reputation for honest delivery.
          </p>
        </div>
        <MeshCanvas phase={phase} />
      </section>

      {/* CONTROL ROOM */}
      <section className="section" id="demo">
        <div className="section__title">live demo · drive a real settlement on mantle</div>
        <div className="grid2">
          <div style={{ display: 'grid', gap: 22 }}>
            <SendPanel onSend={handleSend} running={running} />
            <CourierCard status={status} justDelivered={justDelivered} />
          </div>
          <AgentConsole result={result} running={running} brain={status?.brain ?? 'glm'} />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section">
        <div className="section__title">how a payment crosses the dead zone</div>
        <div className="flow">
          {FLOW.map((f, i) => (
            <div className="flowstep fade-up" key={f.n} style={{ animationDelay: `${i * 90}ms` }}>
              <div className="flowstep__n">{f.n}</div>
              <div className="flowstep__t">{f.t}</div>
              <div className="flowstep__d">{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CONTRACTS */}
      {status && (
        <section className="section">
          <div className="section__title">live on mantle sepolia · open + verifiable</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
            }}
          >
            {Object.entries(status.addresses).map(([k, v]) => (
              <a
                key={k}
                className="receipt"
                href={`${status.chain.explorer}/address/${v}`}
                target="_blank"
                rel="noreferrer"
              >
                <span className="receipt__l">{k}</span>
                <span className="receipt__hash mono">
                  {v.slice(0, 8)}…{v.slice(-6)} ↗
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      <footer className="foot">
        <span>DEADZONE · Mantle Turing Test Hackathon 2026</span>
        <span>offline → mesh → ERC-8004 → settled on Mantle</span>
      </footer>
    </div>
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
