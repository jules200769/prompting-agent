import ReactDOM from "react-dom/client";
import "./index.css";
import { Router } from "./router";
import { ErrorBoundary } from "./components/ErrorBoundary";

const root = document.getElementById("root")!;
root.classList.add("overlay-root");

ReactDOM.createRoot(root).render(
  <ErrorBoundary>
    <Router />
  </ErrorBoundary>
);
