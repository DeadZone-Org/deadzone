import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, MONO } from '../theme';

export function Panel({ title, right, children }: { title?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={s.panel}>
      {title && (
        <View style={s.panelHead}>
          <Text style={s.panelTitle}>{title}</Text>
          {right}
        </View>
      )}
      <View style={s.panelBody}>{children}</View>
    </View>
  );
}

export function Btn({
  label,
  onPress,
  disabled,
  busy,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'ghost';
}) {
  const ghost = variant === 'ghost';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        s.btn,
        ghost && s.btnGhost,
        (disabled || busy) && { opacity: 0.4 },
        pressed && { transform: [{ translateY: 1 }] },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={ghost ? C.signal : C.void} />
      ) : (
        <Text style={[s.btnText, ghost && { color: C.ink }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Dot({ color = C.signal, pulse }: { color?: string; pulse?: boolean }) {
  return <View style={[s.dot, { backgroundColor: color, shadowColor: color }, pulse && { opacity: 0.9 }]} />;
}

export function Chip({ children, color = C.muted }: { children: ReactNode; color?: string }) {
  return (
    <View style={s.chip}>
      <Text style={[s.chipText, { color }]}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  panel: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, marginBottom: 14 },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  panelTitle: { color: C.muted, fontFamily: MONO, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  panelBody: { padding: 16 },
  btn: {
    backgroundColor: C.signal,
    borderWidth: 1,
    borderColor: C.signal,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: 'transparent', borderColor: C.lineBright },
  btnText: { color: C.void, fontWeight: '700', fontSize: 15, letterSpacing: 1.5, textTransform: 'uppercase' },
  dot: { width: 8, height: 8, borderRadius: 4, shadowOpacity: 0.9, shadowRadius: 6 },
  chip: { borderWidth: 1, borderColor: C.lineBright, backgroundColor: C.void2, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontFamily: MONO, fontSize: 11, letterSpacing: 0.5 },
});
