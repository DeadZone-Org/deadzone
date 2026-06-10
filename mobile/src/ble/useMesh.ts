import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import BleAdvertiser from 'react-native-ble-advertiser';
import { BleManager } from 'react-native-ble-plx';
import { healthCheck, pushLogs, relay, type SettleResult } from '../lib/gateway';
import type { WireAuth } from '../lib/eip3009';
import { decodeAuth, encodeAuth } from '../lib/codec';
import {
  DATA_PER_CHUNK,
  HEADER_SIZE,
  broadcastOverBle,
  encodeBytesToChunks,
  encodeMessageToChunks,
  listenOverBle,
  stopBleBroadcast,
} from './bleUtils';

export type MeshRole = 'offline' | 'gateway';
export interface MeshEvent {
  at: number;
  kind: 'info' | 'rx' | 'tx' | 'settle' | 'error' | 'peer';
  line: string;
}

interface Reassembly {
  total: number;
  chunks: Map<number, Uint8Array>;
  done: boolean;
}

const PRESENCE_PREFIX = 'DZP:';
const PEER_TTL_MS = 7000;

/**
 * Deadzone mesh radio. Adapted from NONET's proven BLE context, plus a continuous
 * presence beacon so nearby phones can SEE each other before any payment is sent.
 *  - always advertises: a tiny presence beacon when idle, payment fragments when sending
 *  - always scans + relays
 *  - if THIS device has internet (gateway role): reassemble a full authorization and
 *    forward it to the gateway to settle on Mantle
 */
export function useMesh(selfAddress?: string | null) {
  const [online, setOnline] = useState(false);
  const [peers, setPeers] = useState(0);
  const [events, setEvents] = useState<MeshEvent[]>([]);
  const [broadcasting, setBroadcasting] = useState(false);
  const [lastSettle, setLastSettle] = useState<{ tx: string; url: string; delta: string } | null>(null);

  const managerRef = useRef<BleManager | null>(null);
  const inbox = useRef<Map<number, Reassembly>>(new Map());
  const peerSeen = useRef<Map<string, number>>(new Map());
  const onlineRef = useRef(false);
  const t0 = useRef(Date.now());
  const queueRef = useRef<Uint8Array[]>([]);
  const cursorRef = useRef(0);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const myIdRef = useRef<string>(Math.floor(Math.random() * 256).toString(16).padStart(2, '0'));
  const presenceRef = useRef<Uint8Array[]>([]);
  const advOkRef = useRef(false);
  const advErrRef = useRef(false);
  const advStateRef = useRef<'idle' | 'presence' | 'payment'>('idle');
  const pendingLogsRef = useRef<string[]>([]);
  const scanHitsRef = useRef(0);
  const scanErrRef = useRef(false);

  const log = useCallback((kind: MeshEvent['kind'], line: string) => {
    const at = ((Date.now() - t0.current) / 1000).toFixed(1);
    pendingLogsRef.current.push(`+${at}s [${kind}] ${line}`); // streamed to the gateway for remote debugging
    setEvents((prev) => [...prev.slice(-40), { at: Date.now() - t0.current, kind, line }]);
  }, []);

  // log this device's wallet address (so remote logs are unambiguous about who is who)
  useEffect(() => {
    if (selfAddress) log('info', `this wallet ${selfAddress}`);
  }, [selfAddress, log]);

  // connectivity → role. Authoritative signal = can we actually REACH the gateway?
  // (NetInfo.isConnected is unreliable in standalone builds.) NetInfo is used only as an
  // instant "went offline" hint for airplane mode; a real reachability ping confirms online.
  useEffect(() => {
    let mounted = true;
    const apply = (up: boolean) => {
      if (!mounted) return;
      onlineRef.current = up;
      setOnline(up);
    };
    const ping = async () => {
      const ok = await healthCheck();
      apply(ok);
    };
    ping(); // check immediately on launch
    const iv = setInterval(ping, 6000);
    const unsub = NetInfo.addEventListener((s) => {
      if (s.isConnected === false) apply(false); // airplane mode → offline instantly
      else ping(); // (re)connected → confirm by reaching the gateway
    });
    return () => {
      mounted = false;
      clearInterval(iv);
      unsub();
    };
  }, []);

  // permissions + manager + scan loop + presence beacon
  useEffect(() => {
    let stopListen: (() => void) | null = null;
    let btSub: { remove: () => void } | null = null;

    // precompute our presence beacon: "DZP:<id>" (single BLE fragment)
    presenceRef.current = encodeMessageToChunks(`${PRESENCE_PREFIX}${myIdRef.current}`);

    const onScan = (device: any | null, error: string | null) => {
      if (error) {
        if (!scanErrRef.current) {
          scanErrRef.current = true;
          log('error', `scan error: ${error}`);
        }
        return;
      }
      scanHitsRef.current += 1; // any BLE device seen → scanner is alive
    };

    (async () => {
      if (Platform.OS === 'android') {
        const res = await PermissionsAndroid.requestMultiple([
          'android.permission.BLUETOOTH_SCAN' as any,
          'android.permission.BLUETOOTH_ADVERTISE' as any,
          'android.permission.BLUETOOTH_CONNECT' as any,
          'android.permission.ACCESS_FINE_LOCATION' as any,
        ]);
        const denied = Object.entries(res)
          .filter(([, v]) => v !== 'granted')
          .map(([k]) => k.split('.').pop());
        if (denied.length) {
          log('error', `permission NOT granted: ${denied.join(', ')} → Settings ▸ Apps ▸ Deadzone ▸ Permissions`);
        } else {
          log('info', 'BLE permissions granted ✓');
        }
      }
      try {
        (BleAdvertiser as any).setCompanyId(0xffff);
      } catch {
        /* some versions don't need this */
      }
      const mgr = new BleManager();
      managerRef.current = mgr;
      log('info', `mesh radio online · id ${myIdRef.current} · scanning + beaconing`);
      stopListen = listenOverBle(mgr, (chunk) => onChunk(chunk), onScan);

      // Recover from Bluetooth being toggled (airplane mode): when the adapter powers
      // back on, the OS has killed our scan + advertisement, so restart both.
      btSub = mgr.onStateChange((state) => {
        if (state === 'PoweredOn') {
          advStateRef.current = 'idle'; // force the loop to re-broadcast the beacon
          try {
            (BleAdvertiser as any).setCompanyId(0xffff);
          } catch {
            /* noop */
          }
          stopListen?.();
          stopListen = listenOverBle(mgr, (chunk) => onChunk(chunk), onScan);
          log('info', 'bluetooth on · restarted scan + beacon');
        }
      }, true);
    })();

    // broadcast loop: cycle payment fragments while sending, else KEEP re-asserting the
    // presence beacon (every ~2.5s) so it survives the OS killing the advertiser on BT toggle.
    let lastPresence = 0;
    loopRef.current = setInterval(async () => {
      try {
        if (queueRef.current.length > 0) {
          const chunk = queueRef.current[cursorRef.current % queueRef.current.length];
          cursorRef.current += 1;
          await broadcastOverBle(chunk);
          advStateRef.current = 'payment';
        } else if (
          presenceRef.current.length > 0 &&
          (advStateRef.current !== 'presence' || Date.now() - lastPresence > 2500)
        ) {
          await broadcastOverBle(presenceRef.current[0]);
          advStateRef.current = 'presence';
          lastPresence = Date.now();
        } else {
          return;
        }
        if (!advOkRef.current) {
          advOkRef.current = true;
          log('info', 'advertising ✓ — beacon on air');
        }
      } catch (e) {
        advStateRef.current = 'idle';
        if (!advErrRef.current) {
          advErrRef.current = true;
          log('error', `advertising failed: ${(e as Error)?.message ?? e}`);
        }
      }
    }, 220);

    // stream buffered logs to the gateway (works once this device is online; buffers while offline)
    const flush = setInterval(async () => {
      if (pendingLogsRef.current.length === 0) return;
      const batch = pendingLogsRef.current.slice(0, 60);
      const ok = await pushLogs(
        myIdRef.current,
        onlineRef.current ? 'gateway' : 'offline',
        peerSeen.current.size,
        batch,
      );
      if (ok) pendingLogsRef.current = pendingLogsRef.current.slice(batch.length);
    }, 2500);

    // prune stale peers + refresh the count
    const prune = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, ts] of peerSeen.current) {
        if (now - ts > PEER_TTL_MS) {
          peerSeen.current.delete(id);
          changed = true;
        }
      }
      if (changed) setPeers(peerSeen.current.size);
    }, 2000);

    // radio health heartbeat — streamed to the gateway so the failure mode is visible
    // remotely: scan-hits>0 ⇒ scanner alive; adv=presence ⇒ advertiser alive; peers ⇒ both ends working.
    let lastHits = 0;
    const heartbeat = setInterval(() => {
      const hits = scanHitsRef.current;
      const delta = hits - lastHits;
      lastHits = hits;
      log(
        'info',
        `radio · scan ${delta > 0 ? `alive (+${delta})` : 'SILENT'} · adv ${advStateRef.current} · peers ${peerSeen.current.size}`,
      );
    }, 5000);

    return () => {
      stopListen?.();
      btSub?.remove();
      if (loopRef.current) clearInterval(loopRef.current);
      clearInterval(prune);
      clearInterval(heartbeat);
      clearInterval(flush);
      stopBleBroadcast().catch(() => {});
      managerRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markPeer = useCallback(
    (peerId: string) => {
      if (peerId === myIdRef.current) return;
      const isNew = !peerSeen.current.has(peerId);
      peerSeen.current.set(peerId, Date.now());
      setPeers(peerSeen.current.size);
      if (isNew) log('peer', `peer ${peerId} in range`);
    },
    [log],
  );

  // handle one received fragment: presence beacon OR payment reassembly
  const onChunk = useCallback(
    (chunk: Uint8Array) => {
      if (!chunk || chunk.length < HEADER_SIZE) return;
      const id = chunk[0];
      const total = chunk[1];
      const idx = chunk[2] & 0b01111111;
      const data = chunk.slice(HEADER_SIZE);

      // single-fragment messages: could be a presence beacon — handle without reassembly
      if (total === 1) {
        const text = new TextDecoder().decode(data).replace(/\0/g, '');
        if (text.startsWith(PRESENCE_PREFIX)) {
          markPeer(text.slice(PRESENCE_PREFIX.length));
          return;
        }
      }

      // otherwise: payment fragment → reassemble
      let entry = inbox.current.get(id);
      if (!entry) {
        entry = { total, chunks: new Map(), done: false };
        inbox.current.set(id, entry);
      }
      if (entry.done) return;
      if (!entry.chunks.has(idx)) {
        entry.chunks.set(idx, data);
        // a gateway (online) settles; an offline node relays to the next hop
        if (!onlineRef.current) queueRef.current = relayPush(queueRef.current, chunk);
        const got = entry.chunks.size;
        if (got === 1 || got % 6 === 0 || got === entry.total) {
          log('rx', `receiving payment… ${got}/${entry.total} fragments`);
        }
      }

      if (entry.chunks.size >= entry.total) {
        entry.done = true;
        const bytes = new Uint8Array(entry.total * DATA_PER_CHUNK);
        for (let i = 1; i <= entry.total; i++) {
          const part = entry.chunks.get(i);
          if (part) bytes.set(part.slice(0, DATA_PER_CHUNK), (i - 1) * DATA_PER_CHUNK);
        }
        log('rx', `reassembled payment ✓ (${entry.total} fragments)`);
        try {
          tryGateway(decodeAuth(bytes));
        } catch {
          log('error', 'could not decode payment');
        }
      }
    },
    [log, markPeer],
  );

  // if we have internet, settle the reassembled authorization
  const tryGateway = useCallback(
    async (auth: WireAuth) => {
      if (!auth?.signature) return;
      if (!onlineRef.current) {
        log('info', 'no internet here — re-broadcasting for the next hop');
        return;
      }
      log('info', 'gateway role · forwarding to settle on Mantle…');
      try {
        const res: SettleResult = await relay(auth);
        if (res.ok) {
          log('settle', `settled on Mantle ✓ ${res.txs?.settle?.slice(0, 10)}…`);
          setLastSettle({
            tx: res.txs?.settle ?? '',
            url: res.explorerTxs?.settle ?? '',
            delta: res.recipientDelta ?? '0',
          });
        } else {
          log('error', `rejected: ${res.rejected?.[0]?.reason ?? res.error ?? 'unknown'}`);
        }
      } catch (e) {
        log('error', `gateway error: ${(e as Error).message}`);
      }
    },
    [log],
  );

  /** Fragment a signed authorization and start advertising it across the mesh. */
  const sendOffline = useCallback(
    async (auth: WireAuth) => {
      const chunks = encodeBytesToChunks(encodeAuth(auth)); // compact binary, ~20 fragments
      queueRef.current = chunks;
      cursorRef.current = 0;
      advStateRef.current = 'payment';
      setBroadcasting(true);
      log('tx', `signed offline · airing ${chunks.length} fragments — keep phones close`);
      if (onlineRef.current) tryGateway(auth); // we ARE the gateway → settle immediately
      // air the payment for 30s, then return to the presence beacon
      setTimeout(() => {
        queueRef.current = [];
        setBroadcasting(false);
      }, 30000);
    },
    [log, tryGateway],
  );

  const role: MeshRole = online ? 'gateway' : 'offline';
  return { role, online, peers, events, broadcasting, sendOffline, lastSettle };
}

function relayPush(arr: Uint8Array[], chunk: Uint8Array): Uint8Array[] {
  if (arr.length > 64) return arr;
  return [...arr, chunk];
}
