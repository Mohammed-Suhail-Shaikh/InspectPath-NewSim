import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ViewStateProvider } from "./app/viewState";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ViewStateProvider>
      <App />
    </ViewStateProvider>
  </React.StrictMode>
);
