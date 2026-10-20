import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { parseMirrorWindowParams } from './features/mirror/mirror-window-params';
import { I18nProvider } from './shared/I18nProvider';
import { PreferencesProvider } from './shared/PreferencesProvider';
import './features/mirror/mirror-port-delivery';
import './index.css';

// Each window loads only its own screen: the device list never ships the decoder, and vice versa.
const App = lazy(() => import('./App'));
const MirrorWindowApp = lazy(() =>
  import('./features/mirror/MirrorWindowApp').then((m) => ({ default: m.MirrorWindowApp })),
);

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
          <Suspense fallback={null}>
            <MirrorWindowApp
              deviceId={mirrorParams.deviceId}
              deviceLabel={mirrorParams.deviceLabel}
            />
          </Suspense>
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
            <Suspense fallback={null}>
              <App />
            </Suspense>
          </ErrorBoundary>
        </I18nProvider>
      </PreferencesProvider>
    </React.StrictMode>,
  );
}
