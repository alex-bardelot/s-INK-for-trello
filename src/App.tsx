import React from 'react';

import {HomeScreen} from './screens/HomeScreen';

/**
 * Root component rendered by the Supernote plugin host when the
 * SuperTrello toolbar button is pressed.
 */
export default function App(): React.JSX.Element {
  return <HomeScreen />;
}
