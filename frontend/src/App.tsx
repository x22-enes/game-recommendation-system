import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import GameDetail from './pages/GameDetail';
import Wishlist from './pages/Wishlist';
import Recommendations from './pages/Recommendations';
import Library from './pages/Library';
import Preferences from './pages/Preferences';
import Profile from './pages/Profile';
import PublicProfile from './pages/PublicProfile';
import TopGames from './pages/TopGames';

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <div className="page-container">
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/games/:id" element={<GameDetail />} />
            <Route path="/library" element={<Library />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/recommendations" element={<Recommendations />} />
            <Route path="/top-games" element={<TopGames />} />
            <Route path="/preferences" element={<Preferences />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/users/:id" element={<PublicProfile />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
export default App;
