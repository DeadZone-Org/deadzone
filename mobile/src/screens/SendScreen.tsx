import { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { Wallet, parseUnits } from 'ethers';
import { Btn, Chip, Panel } from '../components/ui';
import { signOffline } from '../lib/eip3009';
import { CHAIN, C, MONO, TOKEN } from '../theme';
import type { useMesh } from '../ble/useMesh';

export function SendScreen({
  wallet,
  mesh,
}: {
  wallet: Wallet;
  mesh: ReturnType<typeof useMesh>;
}) {
  const [amount, setAmount] = useState('25');
  const [to, setTo] = useState('0x000000000000000000000000000000000000dEaD');
  const [status, setStatus] = useState<string | null>(null);

  async function send() {
    try {
      setStatus('signing offline…');
      const auth = await signOffline(wallet, { to, valueWei: parseUnits(amount || '0', 18) });
      setStatus('broadcasting over the mesh');
      await mesh.sendOffline(auth);
    } catch (e) {
      setStatus(`error: ${(e as Error).message}`);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <Panel
        title="send · offline · gasless"
        right={<Chip color={mesh.online ? C.amber : C.danger}>{mesh.online ? 'GATEWAY' : 'NO SIGNAL'}</Chip>}
      >
        <Text style={st.label}>amount · {TOKEN.symbol}</Text>
        <TextInput
          value={amount}
          onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))}
          keyboardType="decimal-pad"
          style={[st.input, st.amount]}
          placeholderTextColor={C.muted2}
        />
        <Text style={[st.label, { marginTop: 14 }]}>recipient</Text>
        <TextInput
          value={to}
          onChangeText={(v) => setTo(v.trim())}
          autoCapitalize="none"
          style={st.input}
          placeholderTextColor={C.muted2}
        />
        <View style={{ height: 16 }} />
        <Btn label={mesh.broadcasting ? 'broadcasting…' : '⚡ send with no signal'} onPress={send} busy={!!status && status.includes('signing')} />
        {status && <Text style={st.status}>{status}</Text>}
        <Text style={st.hint}>
          You sign locally with your own key. The payment hops phone-to-phone over Bluetooth until one reaches a gateway
          that settles it on Mantle. Turn airplane mode ON to prove it works with no internet.
        </Text>
      </Panel>

      <Panel title="mesh activity">
        <View style={{ gap: 6 }}>
          {mesh.events.length === 0 && <Text style={st.logMuted}>idle · waiting for a payment…</Text>}
          {mesh.events.slice(-8).map((e, i) => (
            <View key={i} style={st.logRow}>
              <Text style={st.logT}>+{(e.at / 1000).toFixed(1)}s</Text>
              <Text style={[st.logB, color(e.kind)]}>{e.line}</Text>
            </View>
          ))}
          {settledTx(mesh) && (
            <Text style={st.txLink} onPress={() => Linking.openURL(`${CHAIN.explorer}/tx/${settledTx(mesh)}`)}>
              view settlement on Mantlescan ↗
            </Text>
          )}
        </View>
      </Panel>
    </View>
  );
}

function settledTx(mesh: ReturnType<typeof useMesh>): string | null {
  const e = [...mesh.events].reverse().find((x) => x.kind === 'settle');
  const m = e?.line.match(/(0x[0-9a-fA-F]{6,})/);
  return m ? m[1] : null;
}

function color(kind: string) {
  if (kind === 'settle') return { color: C.signal };
  if (kind === 'error') return { color: C.danger };
  if (kind === 'tx') return { color: C.amber };
  if (kind === 'rx') return { color: C.ink };
  return { color: C.muted };
}

const st = StyleSheet.create({
  label: { color: C.muted, fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: C.void, borderWidth: 1, borderColor: C.lineBright, color: C.ink, fontFamily: MONO, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
  amount: { fontSize: 30, fontWeight: '700' },
  status: { color: C.signal, fontFamily: MONO, fontSize: 12, marginTop: 12 },
  hint: { color: C.muted, fontFamily: MONO, fontSize: 11, lineHeight: 18, marginTop: 14 },
  logRow: { flexDirection: 'row', gap: 10 },
  logT: { color: C.muted2, fontFamily: MONO, fontSize: 12, width: 48 },
  logB: { fontFamily: MONO, fontSize: 12, flex: 1 },
  logMuted: { color: C.muted, fontFamily: MONO, fontSize: 12 },
  txLink: { color: C.signal, fontFamily: MONO, fontSize: 12, marginTop: 8 },
});
