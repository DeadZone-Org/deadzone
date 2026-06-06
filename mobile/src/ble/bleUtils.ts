import base64 from 'react-native-base64';
import BleAdvertiser from 'react-native-ble-advertiser';
import { BleManager, ScanMode } from 'react-native-ble-plx';

// --- Constants ---
export const MESH_SERVICE_UUID = 'f1d0c001-c9e5-4d6c-96ff-7f73f4f99c15';

export type MessageState = {
  id: number;
  totalChunks: number;
  isComplete: boolean;
  isAck: boolean;
  chunks: Map<number, Uint8Array>;
  fullMessage: string;
};

// --- BLE Broadcasting Functions ---
// Android AdvertiseSettings constants (this library version doesn't export them).
const ADVERTISE_MODE_LOW_LATENCY = 2;
const ADVERTISE_TX_POWER_HIGH = 3;
let companyIdSet = false;

export const broadcastOverBle = async (chunk: Uint8Array): Promise<void> => {
  const payload = Array.from(chunk);

  // broadcast() rejects with "Invalid company id" unless a non-zero company id is set first.
  if (!companyIdSet) {
    try {
      (BleAdvertiser as any).setCompanyId(0xffff);
    } catch {
      /* some builds don't require it */
    }
    companyIdSet = true;
  }

  try {
    await (BleAdvertiser as any).stopBroadcast();
  } catch {
    /* nothing was advertising */
  }

  // Service-data broadcast (the proven path). Errors propagate so the caller can surface
  // the real reason (e.g. "Advertiser unavailable on this device"). No manufacturer-data
  // fallback — that method does not exist in react-native-ble-advertiser 0.0.17.
  await (BleAdvertiser as any).broadcast(MESH_SERVICE_UUID, payload, {
    connectable: false,
    includeDeviceName: false,
    includeTxPowerLevel: false,
    advertiseMode: ADVERTISE_MODE_LOW_LATENCY,
    txPowerLevel: ADVERTISE_TX_POWER_HIGH,
  });
};

export const stopBleBroadcast = async (): Promise<void> => {
  try {
    await (BleAdvertiser as any).stopBroadcast();
  } catch {
    /* ignore */
  }
};

// --- Data Conversion Functions ---
export const base64ToUint8Array = (b64: string): Uint8Array => {
  const byteString = base64.decode(b64);
  return Uint8Array.from(byteString, (c) => c.charCodeAt(0));
};

// --- Protocol encoding/decoding ---
export const HEADER_SIZE = 3;
// BLE legacy advert is 31 bytes; a 128-bit service UUID + flags leaves room for only a
// ~9-byte payload, so 3 header + 6 data is the safe max. (8 overflowed → "larger than 31 bytes".)
export const DATA_PER_CHUNK = 6;

/** Fragment raw bytes into BLE-sized chunks: [id, totalChunks, chunkNum|ackFlag, ...data]. */
export const encodeBytesToChunks = (
  binaryArray: Uint8Array,
  options: { id?: number; isAck?: boolean } = {}
): Uint8Array[] => {
  const MAX_PAYLOAD_SIZE = HEADER_SIZE + DATA_PER_CHUNK;
  const totalChunks = Math.ceil(binaryArray.length / DATA_PER_CHUNK) || 1;
  if (totalChunks > 127) {
    throw new Error('Message is too large and exceeds the 127 chunk limit.');
  }

  let uniqueId = options.id;
  if (uniqueId === undefined) {
    const idArray = new Uint8Array(1);
    if (typeof crypto !== 'undefined' && (crypto as any).getRandomValues) {
      (crypto as any).getRandomValues(idArray);
    } else {
      idArray[0] = Math.floor(Math.random() * 256);
    }
    uniqueId = idArray[0];
  }

  const isAck = options.isAck || false;
  const createdChunks: Uint8Array[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const chunkNumber = i + 1;
    const chunkPayload = new Uint8Array(MAX_PAYLOAD_SIZE);
    chunkPayload[0] = uniqueId;
    chunkPayload[1] = totalChunks;
    chunkPayload[2] = (chunkNumber & 0b01111111) | (isAck ? 0b10000000 : 0);
    chunkPayload.set(binaryArray.slice(i * DATA_PER_CHUNK, i * DATA_PER_CHUNK + DATA_PER_CHUNK), HEADER_SIZE);
    createdChunks.push(chunkPayload);
  }
  return createdChunks;
};

/** String convenience wrapper (used for the presence beacon). */
export const encodeMessageToChunks = (
  message: string,
  options: { id?: number; isAck?: boolean } = {}
): Uint8Array[] => encodeBytesToChunks(new TextEncoder().encode(message), options);

export const decodeSingleChunk = (
  chunk: Uint8Array
):
  | (MessageState & {
      chunkNumber: number;
      data: Uint8Array;
      decodedData: string;
    })
  | null => {
  if (!chunk || chunk.length < 3) return null;
  const view = new DataView(chunk.buffer);
  const id = view.getUint8(0);
  const totalChunks = view.getUint8(1);
  const chunkNumAndFlagByte = view.getUint8(2);
  const isAck = (chunkNumAndFlagByte & 0b10000000) !== 0;
  const chunkNumber = chunkNumAndFlagByte & 0b01111111;
  const data = chunk.slice(3);

  const decoder = new TextDecoder();
  const firstNullByte = data.indexOf(0);
  const dataWithoutPadding =
    firstNullByte === -1 ? data : data.slice(0, firstNullByte);
  const decodedData = decoder.decode(dataWithoutPadding);

  return {
    id,
    totalChunks,
    isComplete: false,
    isAck,
    chunks: new Map<number, Uint8Array>(),
    fullMessage: '',
    chunkNumber,
    data,
    decodedData,
  } as any;
};

// --- BLE Listening Function ---
export const listenOverBle = (
  bleManager: BleManager | null,
  onChunkReceived: (chunk: Uint8Array) => void
): (() => void) => {
  if (!bleManager) {
    console.error('BLE Manager not initialized');
    return () => {};
  }

  bleManager.startDeviceScan(
    null,
    {
      allowDuplicates: true,
      scanMode: ScanMode.LowLatency,
    },
    (error, device) => {
      if (error) {
        console.error('BLE Scan Error:', error.message);
        return;
      }
      if (!device) return;

      const serviceDataB64 = (device as any).serviceData?.[MESH_SERVICE_UUID];
      const manufacturerDataB64 = (device as any).manufacturerData;

      let chunk: Uint8Array | null = null;
      if (serviceDataB64) {
        try {
          chunk = base64ToUint8Array(serviceDataB64);
        } catch (e) {
          console.error('Error decoding service data:', e);
        }
      } else if (manufacturerDataB64) {
        try {
          const fullChunk = base64ToUint8Array(manufacturerDataB64);
          if (
            fullChunk.length > 2 &&
            fullChunk[0] === 255 &&
            fullChunk[1] === 255
          ) {
            chunk = fullChunk.slice(2);
          }
        } catch (e) {
          console.error('Error decoding manufacturer data:', e);
        }
      }

      if (chunk) {
        onChunkReceived(chunk);
      }
    }
  );

  return () => {
    try {
      bleManager.stopDeviceScan();
    } catch {
      /* ignore */
    }
    console.log('BLE Scan stopped (stop function called).');
  };
};
