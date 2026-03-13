import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import Auth from './components/Auth';
import Chat from './components/Chat';
import './App.css';

export default function App() {
  const [user, setUser]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [fadeOut, setFadeOut]   = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        // Not logged in — still show splash briefly then show auth
        setTimeout(() => {
          setFadeOut(true);
          setTimeout(() => { setUser(null); setLoading(false); }, 400);
        }, 1200);
      } else {
        // Logged in — wait for user doc to exist in Firestore before showing app
        const userUnsub = onSnapshot(doc(db, 'users', u.uid), (snap) => {
          if (snap.exists()) {
            userUnsub();
            setFadeOut(true);
            setTimeout(() => { setUser(u); setLoading(false); }, 400);
          } else {
            // Doc doesn't exist yet, still fade in after a moment
            setTimeout(() => {
              userUnsub();
              setFadeOut(true);
              setTimeout(() => { setUser(u); setLoading(false); }, 400);
            }, 3000);
          }
        });
      }
    });
    return unsub;
  }, []);

  if (loading) return (
    <div className="splash" style={{ opacity: fadeOut ? 0 : 1, transition: 'opacity 0.4s ease' }}>
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
