import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installDebugApi } from './harness/debugApi';
import { installFocusCamera } from './map/focusCamera';
import { installJourneyPlayer } from './map/journeyPlayer';
import './styles.css';

installDebugApi();
// The camera starts its flight before the player waits for it to land.
installFocusCamera();
installJourneyPlayer();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
