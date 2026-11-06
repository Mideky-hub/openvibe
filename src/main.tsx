// First: Excalidraw reads its asset path when it loads.
import "./app/assetPath";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppCrash } from "./shell/CrashNotice";
import { installLogging } from "./app/log";
import { langStore } from "./i18n";
import { startTheme } from "./app/theme";
import { trackTerminalFocus } from "./canvas/keyboardFocus";
import { installShortcuts } from "./commands/dispatch";
import { installCloseThrough } from "./canvas/closeThrough";
import { installPinchZoom } from "./canvas/pinchZoom";
import { installRadial } from "./radial/install";
import "./index.css";

// First: what follows can already write to the log file.
installLogging();
// Windows' language until the saved choice is read at boot.
document.documentElement.lang = langStore.getState().lang;
startTheme(matchMedia("(prefers-color-scheme: dark)"));
// For the app's whole life (spec fenêtre §6.2, §8).
installShortcuts(window);
trackTerminalFocus(document);
installRadial(window);
installPinchZoom(window);
installCloseThrough(window);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary scope="app" fallback={(error) => <AppCrash error={error} />}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
