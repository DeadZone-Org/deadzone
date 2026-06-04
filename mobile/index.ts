// Polyfills MUST load before ethers / app code (RN has no native crypto/URL).
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
