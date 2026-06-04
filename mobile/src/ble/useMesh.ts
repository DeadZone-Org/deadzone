import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { relay, type SettleResult } from '../lib/gateway';
import type { WireAuth } from '../lib/eip3009';
import {
  broadcastOverBle,
  encodeMessageToChunks,
  listenOverBle,
  stopBleBroadcast,
} from './bleUtils';

export type MeshRole = 'offline' | 'gateway';
export interface MeshEvent {
  at: number;
  kind: 'info' | 'rx' | 'tx' | 'settle' | 'error';
  line: string;
}

interface Reassembly {
  total: number;
  chunks: Map<number, Uint8Array>;
  done: boolean;
}

const HEADER = 3;
const DATA_PER_CHUNK = 6;

/**
 * Deadzone mesh radio. Adapted from NONET's proven BLE context:
 *  - sendOffline(): fragment a signed authorization and advertise it over BLE
 *  - always scanning + relaying chunks it hears
 *  - if THIS device has internet (gateway role): reassemble a full authorization and
 *    forward it to the gateway to settle on Mantle
 */
export function useMesh() {
  const [online, setOnline] = useState(false);
  const [peers, setPeers] = useState(0);
  const [events, setEvents] = useState<MeshEvent[]>([]);
  const [broadcasting, setBroadcasting] = useState(false);

  const managerRef = useRef<BleManager | null>(null);
  const inbox = useRef<Map<number, Reassembly>>(new Map());
  const seenPeers = useRef<Set<string>>(new Set());
  const onlineRef = useRef(false);
  const t0 = useRef(Date.now());
  const queueRef = useRef<Uint8Array[]>([]);
  const cursorRef = useRef(0);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const log = useCallback((kind: MeshEvent['kind'], line: string) => {
    setEvents((prev) => [...prev.slice(-40), { at: Date.now() - t0.current, kind, line }]);
  }, []);

  // connectivity → role
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      const up = Boolean(s.isConnected);
      onlineRef.current = up;
      setOnline(up);
    });
    return () => unsub();
  }, []);

  // permissions + manager + scan loop
  useEffect(() => {
    let stopListen: (() => void) | null = null;
    (async () => {
      if (Platform.OS === 'android') {
        await PermissionsAndroid.requestMultiple([
          'android.permission.BLUETOOTH_SCAN' as any,
          'android.permission.BLUETOOTH_ADVERTISE' as any,
          'android.permission.BLUETOOTH_CONNECT' as any,
          'android.permission.ACCESS_FINE_LOCATION' as any,
        ]);
      }
      const mgr = new BleManager();
      managerRef.current = mgr;
      log('info', 'mesh radio online · scanning for peers');
      stopListen = listenOverBle(mgr, (chunk) => onChunk(chunk));
    })();

    // round-robin re-broadcast loop (keeps fragments alive across the mesh)
    loopRef.current = setInterval(() => {
      const q = queueRef.current;
      if (q.length === 0) return;
      const chunk = q[cursorRef.current % q.length];
      cursorRef.current += 1;
      broadcastOverBle(chunk).catch(() => {});
    }, 280);

    return () => {
      stopListen?.();
      if (loopRef.current) clearInterval(loopRef.current);
      stopBleBroadcast().catch(() => {});
      managerRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // handle one received chunk: reassemble; relay to gateway if we're online
  const onChunk = useCallback((chunk: Uint8Array) => {
    if (!chunk || chunk.length < HEADER) return;
    const id = chunk[0];
    const total = chunk[1];
    const idx = chunk[2] & 0b01111111;

    // count this as a live peer signal
    const key = `${id}`;
    if (!seenPeers.current.has(key)) {
      seenPeers.current.add(key);
      setPeers(seenPeers.current.size);
    }

    let entry = inbox.current.get(id);
    if (!entry) {
      entry = { total, chunks: new Map(), done: false };
      inbox.current.set(id, entry);
    }
    if (entry.done) return;
    if (!entry.chunks.has(idx)) {
      entry.chunks.set(idx, chunk.slice(HEADER));
      // keep relaying what we hear
      queueRef.current = dedupePush(queueRef.current, chunk);
    }

    if (entry.chunks.size >= entry.total) {
      entry.done = true;
      const bytes: number[] = [];
      for (let i = 1; i <= entry.total; i++) {
        const part = entry.chunks.get(i);
        if (part) bytes.push(...Array.from(part).slice(0, DATA_PER_CHUNK));
      }
      const text = new TextDecoder().decode(Uint8Array.from(bytes)).replace(/\0/g, '');
      log('rx', `reassembled a payment off the mesh (${entry.total} fragments)`);
      tryGateway(text);
    }
  }, [log]);

  // if we have internet, settle the reassembled authorization
  const tryGateway = useCallback(async (text: string) => {
    if (!onlineRef.current) {
      log('info', 'no internet here — re-broadcasting for the next hop');
      return;
    }
    let auth: WireAuth;
    try {
      auth = JSON.parse(text);
      if (!auth?.signature) throw new Error('not an auth');
    } catch {
      return; // not a Deadzone payment
    }
    log('info', 'gateway role · forwarding to settle on Mantle…');
    try {
      const res: SettleResult = await relay(auth);
      if (res.ok) {
        log('settle', `settled on Mantle ✓ ${res.txs?.settle?.slice(0, 14)}…`);
      } else {
        log('error', `rejected: ${res.rejected?.[0]?.reason ?? res.error ?? 'unknown'}`);
      }
    } catch (e) {
      log('error', `gateway error: ${(e as Error).message}`);
    }
  }, [log]);

  /** Fragment a signed authorization and start advertising it across the mesh. */
  const sendOffline = useCallback(
    async (auth: WireAuth) => {
      const payload = JSON.stringify(auth);
      const chunks = encodeMessageToChunks(payload);
      queueRef.current = chunks;
      cursorRef.current = 0;
      setBroadcasting(true);
      log('tx', `signed offline · broadcasting ${chunks.length} fragments over BLE`);
      // if we ourselves are the gateway (online), settle immediately too
      if (onlineRef.current) tryGateway(payload);
    },
    [log, tryGateway],
  );

  const role: MeshRole = online ? 'gateway' : 'offline';
  return { role, online, peers, events, broadcasting, sendOffline };
}

function dedupePush(arr: Uint8Array[], chunk: Uint8Array): Uint8Array[] {
  if (arr.length > 64) return arr;
  return [...arr, chunk];
}
