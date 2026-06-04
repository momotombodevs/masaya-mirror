import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MirrorWindowApp, parseMirrorWindowParams } from './features/mirror/MirrorWindowApp';
import './features/mirror/mirror-port-delivery';
import './index.css';

const mirrorParams = parseMirrorWindowParams();

const root = ReactDOM.createRoot(document.getElementById('root')!);

if (mirrorParams) {
  root.render(
    <ErrorBoundary>
      <MirrorWindowApp
        deviceId={mirrorParams.deviceId}
        deviceLabel={mirrorParams.deviceLabel}
      />
    </ErrorBoundary>,
  );
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
