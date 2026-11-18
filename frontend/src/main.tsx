import {GrantProgramsProvider} from "./GrantPrograms";
import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { ConfirmProvider } from "./ConfirmDialog";

const container = document.getElementById("root");
if (!container) throw new Error("Application root is missing");
const root = (import.meta.hot?.data.root as Root | undefined) ?? createRoot(container);
if (import.meta.hot) { import.meta.hot.data.root = root; import.meta.hot.accept(); }
root.render(
  <AppErrorBoundary>
    <ConfirmProvider>
      <GrantProgramsProvider>
        <App />
      </GrantProgramsProvider>
    </ConfirmProvider>
  </AppErrorBoundary>,
);
