import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Auth from './components/Auth';
import Chat from './components/Chat';
import './App.css';

export default function App() {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady]     = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      // Show splash for at least 1.5s for the animation
      setTimeout(() => setReady(true), 1500);
    });
    return unsub;
  }, []);

  if (loading || !ready) return (
    <div className="splash">
      <div className="splash-logo">Aighto</div>
      <div className="splash-dots">
        <div className="splash-dot" />
        <div className="splash-dot" />
        <div className="splash-dot" />
      </div>
    </div>
  );

  return user ? <Chat user={user} /> : <Auth />;
}
