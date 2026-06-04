// Only the randomness polyfill is needed — ethers is used for OFFLINE SIGNING only
// (pure crypto, no network/URL). The url polyfill pollutes the global Event and breaks
// fetch/AbortController in Hermes ("Cannot assign to read-only property 'NONE'"), so it's out.
import 'react-native-get-random-values';

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
