import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Wallet, formatUnits } from 'ethers';
import { Btn, Chip, Panel } from '../components/ui';
import { balance, faucet } from '../lib/gateway';
import { CHAIN, C, MONO, TOKEN } from '../theme';

export function WalletScreen({ wallet }: { wallet: Wallet }) {
  const [bal, setBal] = useState<string>('—');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function refresh() {
    try {
      const b = await balance(wallet.address); // via the gateway, no in-app RPC
      setBal(formatUnits(b, TOKEN.decimals));
    } catch {
      setBal('offline');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getFunds() {
    setBusy(true);
    setNote('requesting demo dUSD from the gateway…');
    try {
      const r = await faucet(wallet.address, '1000');
      setNote(r.ok ? 'funded ✓' : `error: ${r.error}`);
      await refresh();
    } catch (e) {
      setNote(`error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <Panel title="this device · wallet" right={<Chip color={C.signal}>{CHAIN.name}</Chip>}>
        <Text style={st.k}>balance</Text>
        <Text style={st.bal}>
          {bal} <Text style={st.sym}>{TOKEN.symbol}</Text>
        </Text>
        <Text style={[st.k, { marginTop: 16 }]}>address</Text>
        <Text style={st.addr} onPress={() => Linking.openURL(`${CHAIN.explorer}/address/${wallet.address}`)}>
          {wallet.address} ↗
        </Text>
        <View style={{ height: 16 }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Btn label="get demo dUSD" onPress={getFunds} busy={busy} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn label="refresh" variant="ghost" onPress={refresh} />
          </View>
        </View>
        {note && <Text style={st.note}>{note}</Text>}
      </Panel>

      <Panel title="how deadzone works">
        <Text style={st.body}>
          You hold the key. Payments are signed <Text style={{ color: C.signal }}>offline</Text> (EIP-3009, gasless) and
          relayed over a Bluetooth mesh until a phone with signal forwards it to the gateway — where an autonomous AI
          agent settles it on Mantle and earns on-chain ERC-8004 reputation for honest delivery.
        </Text>
      </Panel>
    </View>
  );
}

const st = StyleSheet.create({
  k: { color: C.muted, fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  bal: { color: C.ink, fontSize: 38, fontWeight: '700', marginTop: 6 },
  sym: { color: C.muted, fontSize: 16, fontWeight: '400' },
  addr: { color: C.signal, fontFamily: MONO, fontSize: 12, marginTop: 6 },
  note: { color: C.amber, fontFamily: MONO, fontSize: 12, marginTop: 12 },
  body: { color: C.muted, fontFamily: MONO, fontSize: 12.5, lineHeight: 20 },
});
