import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Apply the saved theme before first paint so there is no flash of the wrong one.
document.documentElement.setAttribute("data-theme", localStorage.getItem("theme") ?? "light");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
