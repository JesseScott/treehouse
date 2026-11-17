import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installDebugApi } from './harness/debugApi';
import { installFocusCamera } from './map/focusCamera';
import './styles.css';

installDebugApi();
installFocusCamera();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
