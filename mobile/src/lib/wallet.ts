import AsyncStorage from '@react-native-async-storage/async-storage';
import { Wallet } from 'ethers';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'deadzone.privateKey';

/** Load or create the device wallet (ethers). The private key lives in AsyncStorage. */
export function useWallet() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        let pk = await AsyncStorage.getItem(KEY);
        if (!pk) {
          pk = Wallet.createRandom().privateKey;
          await AsyncStorage.setItem(KEY, pk);
        }
        setWallet(new Wallet(pk));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const reset = useCallback(async () => {
    const w = Wallet.createRandom();
    await AsyncStorage.setItem(KEY, w.privateKey);
    setWallet(new Wallet(w.privateKey));
  }, []);

  return { wallet, address: wallet?.address ?? null, loading, reset };
}
