import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MirrorWindowApp } from './features/mirror/MirrorWindowApp';
import { parseMirrorWindowParams } from './features/mirror/mirror-window-params';
import { I18nProvider } from './shared/I18nProvider';
import { PreferencesProvider } from './shared/PreferencesProvider';
import './features/mirror/mirror-port-delivery';
import './index.css';

const mirrorParams = parseMirrorWindowParams();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

const root = ReactDOM.createRoot(rootElement);

if (mirrorParams) {
  root.render(
    <PreferencesProvider>
      <I18nProvider>
        <ErrorBoundary>
          <MirrorWindowApp
            deviceId={mirrorParams.deviceId}
            deviceLabel={mirrorParams.deviceLabel}
          />
        </ErrorBoundary>
      </I18nProvider>
    </PreferencesProvider>,
  );
} else {
  root.render(
    <React.StrictMode>
      <PreferencesProvider>
        <I18nProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </I18nProvider>
      </PreferencesProvider>
    </React.StrictMode>,
  );
}
