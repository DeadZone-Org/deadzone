import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useMesh } from './src/ble/useMesh';
import { useWallet } from './src/lib/wallet';
import { Dot } from './src/components/ui';
import { SendScreen } from './src/screens/SendScreen';
import { WalletScreen } from './src/screens/WalletScreen';
import { C, MONO } from './src/theme';

type Tab = 'send' | 'wallet';

export default function App() {
  const { wallet, loading } = useWallet();
  const mesh = useMesh(wallet?.address ?? null);
  const [tab, setTab] = useState<Tab>('send');

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={st.root} edges={['top', 'bottom']}>
        {/* header */}
        <View style={st.header}>
          <View style={st.brand}>
            <View style={st.bars}>
              <View style={[st.bar, { height: 8 }]} />
              <View style={[st.bar, { height: 15 }]} />
              <View style={[st.bar, { height: 22 }]} />
              <View style={[st.bar, { height: 11, backgroundColor: C.danger }]} />
            </View>
            <Text style={st.word}>
              DEAD<Text style={{ color: C.signal }}>ZONE</Text>
            </Text>
          </View>
          <View style={st.meshState}>
            <Dot color={mesh.online ? C.amber : C.danger} />
            <Text style={st.meshText} numberOfLines={1}>
              {mesh.online ? 'GATEWAY' : 'OFFLINE'} · {mesh.peers}p
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
          {loading || !wallet ? (
            <Text style={st.loading}>initializing wallet…</Text>
          ) : tab === 'send' ? (
            <SendScreen wallet={wallet} mesh={mesh} />
          ) : (
            <WalletScreen wallet={wallet} />
          )}
        </ScrollView>

        {/* tab bar */}
        <View style={st.tabs}>
          {(['send', 'wallet'] as Tab[]).map((t) => (
            <Pressable key={t} style={st.tab} onPress={() => setTab(t)}>
              <Text style={[st.tabText, tab === t && { color: C.signal }]}>{t.toUpperCase()}</Text>
              {tab === t && <View style={st.tabUnderline} />}
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.void },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    gap: 8,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1, minWidth: 0 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 22 },
  bar: { width: 4, backgroundColor: C.signal },
  word: { color: C.ink, fontWeight: '700', fontSize: 17, letterSpacing: 2.5 },
  meshState: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 },
  meshText: { color: C.muted, fontFamily: MONO, fontSize: 11, letterSpacing: 0.5 },
  body: { padding: 16 },
  loading: { color: C.muted, fontFamily: MONO, textAlign: 'center', marginTop: 40 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  tabText: { color: C.muted, fontFamily: MONO, fontSize: 12, letterSpacing: 2 },
  tabUnderline: { position: 'absolute', bottom: 0, height: 2, width: 40, backgroundColor: C.signal },
});
