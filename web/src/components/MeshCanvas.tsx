import { useEffect, useState } from 'react';

/** Phase of the packet's journey across the mesh, driven by the parent. */
export type MeshPhase = 'idle' | 'sign' | 'relay' | 'gateway' | 'settled' | 'rejected';

interface Node {
  id: string;
  x: number;
  y: number;
  kind: 'sender' | 'relay' | 'gateway';
  label: string;
}

// positions in a 0..100 viewBox space
const NODES: Node[] = [
  { id: 'a', x: 14, y: 30, kind: 'sender', label: 'YOU · no signal' },
  { id: 'r1', x: 33, y: 58, kind: 'relay', label: 'relay' },
  { id: 'r2', x: 52, y: 26, kind: 'relay', label: 'relay' },
  { id: 'r3', x: 60, y: 66, kind: 'relay', label: 'relay' },
  { id: 'gw', x: 84, y: 46, kind: 'gateway', label: 'GATEWAY · online' },
];
// the hop path the packet takes
const PATH = ['a', 'r1', 'r3', 'gw'];

const byId = (id: string) => NODES.find((n) => n.id === id)!;

export function MeshCanvas({ phase }: { phase: MeshPhase }) {
  const [hop, setHop] = useState(0);

  // advance the packet along PATH while relaying; rest at gateway when settling
  useEffect(() => {
    if (phase === 'idle' || phase === 'sign') {
      setHop(0);
      return;
    }
    if (phase === 'relay') {
      setHop(0);
      let i = 0;
      const t = setInterval(() => {
        i += 1;
        setHop(Math.min(i, PATH.length - 1));
        if (i >= PATH.length - 1) clearInterval(t);
      }, 520);
      return () => clearInterval(t);
    }
    // gateway / settled / rejected → packet sits at gateway
    setHop(PATH.length - 1);
  }, [phase]);

  const pkt = byId(PATH[hop]);
  const active = phase !== 'idle';
  const gwState =
    phase === 'settled' ? 'settled' : phase === 'rejected' ? 'rejected' : phase === 'gateway' ? 'working' : 'wait';

  return (
    <div className="radar panel panel--corner">
      <div className="radar__sweep" />
      {/* concentric range rings centered on the gateway */}
      <div className="radar__rings" aria-hidden>
        {[120, 230, 340, 460].map((d) => (
          <span key={d} style={{ width: d, height: d }} />
        ))}
      </div>

      <svg viewBox="0 0 100 86" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {/* mesh links */}
        {[
          ['a', 'r1'], ['a', 'r2'], ['r1', 'r3'], ['r2', 'r3'], ['r2', 'gw'], ['r3', 'gw'], ['r1', 'r2'],
        ].map(([s, e], i) => {
          const A = byId(s);
          const B = byId(e);
          return (
            <line
              key={i}
              x1={A.x}
              y1={A.y}
              x2={B.x}
              y2={B.y}
              stroke="var(--line-bright)"
              strokeWidth={0.25}
              strokeDasharray="1.2 1.2"
              opacity={0.7}
            />
          );
        })}

        {/* the live hop path */}
        {active &&
          PATH.slice(0, hop + 1).map((id, i) => {
            if (i === 0) return null;
            const A = byId(PATH[i - 1]);
            const B = byId(id);
            return (
              <line
                key={`p${i}`}
                x1={A.x}
                y1={A.y}
                x2={B.x}
                y2={B.y}
                stroke={phase === 'rejected' ? 'var(--danger)' : 'var(--signal)'}
                strokeWidth={0.5}
                style={{ filter: 'drop-shadow(0 0 2px currentColor)' }}
              />
            );
          })}

        {/* nodes */}
        {NODES.map((n) => {
          const isGw = n.kind === 'gateway';
          const color =
            isGw && gwState === 'settled'
              ? 'var(--signal)'
              : isGw && gwState === 'rejected'
                ? 'var(--danger)'
                : isGw
                  ? 'var(--amber)'
                  : n.kind === 'sender'
                    ? 'var(--danger)'
                    : 'var(--muted)';
          return (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r={isGw ? 3 : 1.7} fill="var(--void)" stroke={color} strokeWidth={0.5} />
              <circle cx={n.x} cy={n.y} r={isGw ? 1.4 : 0.8} fill={color} />
              {isGw && (
                <circle cx={n.x} cy={n.y} r={3} fill="none" stroke={color} strokeWidth={0.3}>
                  <animate attributeName="r" from="3" to="7" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.8" to="0" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        })}

        {/* the packet */}
        {active && (
          <g
            style={{
              transform: `translate(${pkt.x}px, ${pkt.y}px)`,
              transition: 'transform 0.45s cubic-bezier(0.5,0,0.2,1)',
            }}
          >
            <rect
              x={-1.4}
              y={-1.4}
              width={2.8}
              height={2.8}
              fill={phase === 'rejected' ? 'var(--danger)' : 'var(--signal)'}
              style={{ filter: 'drop-shadow(0 0 3px currentColor)' }}
            >
              <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2.4s" repeatCount="indefinite" />
            </rect>
          </g>
        )}
      </svg>

      {/* node labels (HTML overlay for crisp type) */}
      {NODES.filter((n) => n.kind !== 'relay').map((n) => (
        <span
          key={n.id}
          style={{
            position: 'absolute',
            left: `${n.x}%`,
            top: `${n.y}%`,
            transform: 'translate(-50%, 14px)',
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: n.kind === 'gateway' ? 'var(--amber)' : 'var(--danger)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {n.label}
        </span>
      ))}

      {/* status ticker */}
      <div
        style={{
          position: 'absolute',
          left: 14,
          bottom: 12,
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
        }}
      >
        <span className="dot" style={{ display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }} />
        {phase === 'idle' && 'mesh idle · 4 peers in range'}
        {phase === 'sign' && 'signing offline · no internet'}
        {phase === 'relay' && `relaying · hop ${hop}/${PATH.length - 1}`}
        {phase === 'gateway' && 'gateway reached · agent working'}
        {phase === 'settled' && 'settled on mantle ✓'}
        {phase === 'rejected' && 'rejected · nothing settled'}
      </div>
    </div>
  );
}
