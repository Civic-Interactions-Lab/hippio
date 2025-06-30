import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage/LandingPage';
import GamePage from './pages/GamePage/GamePage';
import Presenter from './pages/PresenterPage/Presenter';
import RoleSelect from './pages/RoleSelection/RoleSelect';
import { Navigate } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/gamepage/:sessionId/:userId" element={<GamePage />} />
        {/* delete /gamepage later, for testing */}
        <Route path="/gamepage" element={<GamePage />} /> 
        <Route path="/presenter/:sessionId" element={<Presenter />} />
        <Route path="/roleselect/:sessionId" element={<RoleSelect />} />

        {/* Redirect to landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;