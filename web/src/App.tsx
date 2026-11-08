import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { CharacterEditorPage } from './pages/CharacterEditorPage';
import { CharactersPage } from './pages/CharactersPage';
import { DialoguePage } from './pages/DialoguePage';
import { MemoryPage } from './pages/MemoryPage';
import { ScenarioEditorPage, ScenarioSessionPage } from './pages/ScenarioEditorPage';
import { ScenariosPage } from './pages/ScenariosPage';
import { SettingsPage } from './pages/SettingsPage';
import { SimulationPage, SimulationsPage } from './pages/SimulationsPage';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/characters" replace />} />
        <Route path="/characters" element={<CharactersPage />} />
        <Route path="/characters/new" element={<CharacterEditorPage key="new" />} />
        <Route path="/characters/:id" element={<CharacterEditorPage />} />
        <Route path="/dialogue" element={<DialoguePage />} />
        <Route path="/dialogue/:characterId" element={<DialoguePage />} />
        <Route path="/dialogue/:characterId/:conversationId" element={<DialoguePage />} />
        <Route path="/scenarios" element={<ScenariosPage />} />
        <Route path="/scenarios/:id" element={<ScenarioEditorPage />} />
        <Route path="/scenarios/:id/sessions/:conversationId" element={<ScenarioSessionPage />} />
        <Route path="/simulations" element={<SimulationsPage />} />
        <Route path="/simulations/:conversationId" element={<SimulationPage />} />
        <Route path="/memory" element={<MemoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/characters" replace />} />
      </Routes>
    </Layout>
  );
}
