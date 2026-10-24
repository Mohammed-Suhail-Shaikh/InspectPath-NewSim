import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ViewStateProvider } from "./app/viewState";
import { initDataSource } from "./data/activeSource";
import "./styles.css";

function mount() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ViewStateProvider>
        <App />
      </ViewStateProvider>
    </React.StrictMode>
  );
}

// Resolve the data-source switch (real vs mock) before mounting, so views read
// from the correct source. Falls back to mock if resolution fails.
initDataSource().finally(mount);
