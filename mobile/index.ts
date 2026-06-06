// Polyfill MUST load before ethers (RN has no native crypto).
import 'react-native-get-random-values';

import { Text, TextInput } from 'react-native';
import { registerRootComponent } from 'expo';
import App from './App';

// Lock font scaling so the monospace tactical-HUD layout looks identical on every
// device, regardless of the phone's system font-size setting (the usual cause of
// "perfect on one phone, distorted on another").
const T = Text as unknown as { defaultProps?: Record<string, unknown> };
T.defaultProps = { ...T.defaultProps, allowFontScaling: false };
const TI = TextInput as unknown as { defaultProps?: Record<string, unknown> };
TI.defaultProps = { ...TI.defaultProps, allowFontScaling: false };

registerRootComponent(App);
