import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/app";
import { initClient } from "./zaf";

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <StrictMode>
      <App client={initClient()} />
    </StrictMode>,
  );
}
