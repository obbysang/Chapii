import "./lib/polyfill";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Shell from "./components/Shell";
import Landing from "./pages/Landing";
import NewVault from "./pages/NewVault";
import Demo from "./pages/Demo";
import Overview from "./pages/Overview";
import Agents from "./pages/Agents";
import { Requests, RequestDetail } from "./pages/Requests";
import { Approvals, Security, Fund, SettingsPage } from "./pages/Approvals";
import { WalletProvider } from "./lib/wallet";
import "./index.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <WalletProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route path="/" element={<Landing />} />
              <Route path="/new" element={<NewVault />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="/v/:vaultId" element={<Overview />} />
              <Route path="/v/:vaultId/agents" element={<Agents />} />
              <Route path="/v/:vaultId/requests" element={<Requests />} />
              <Route path="/v/:vaultId/requests/:requestId" element={<RequestDetail />} />
              <Route path="/v/:vaultId/approvals" element={<Approvals />} />
              <Route path="/v/:vaultId/fund" element={<Fund />} />
              <Route path="/v/:vaultId/security" element={<Security />} />
              <Route path="/v/:vaultId/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </WalletProvider>
    </StrictMode>
  );
}
