import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/Layout';
import AgentDetail from './pages/AgentDetail';
import Agents from './pages/Agents';
import Approvals from './pages/Approvals';
import Demo from './pages/Demo';
import Fund from './pages/Fund';
import Landing from './pages/Landing';
import NewVault from './pages/NewVault';
import NotFound from './pages/NotFound';
import Overview from './pages/Overview';
import RequestDetail from './pages/RequestDetail';
import Requests from './pages/Requests';
import Security from './pages/Security';
import Settings from './pages/Settings';
import Vaults from './pages/Vaults';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/demo" element={<Demo />} />

      <Route path="/app" element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="agents" element={<Agents />} />
        <Route path="agents/:pk" element={<AgentDetail />} />
        <Route path="requests" element={<Requests />} />
        <Route path="requests/:id" element={<RequestDetail />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="fund" element={<Fund />} />
        <Route path="security" element={<Security />} />
        <Route path="settings" element={<Settings />} />
        <Route path="vaults" element={<Vaults />} />
        <Route path="vaults/new" element={<NewVault />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
