import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

export default function Auth() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (mode === 'signup') {
        if (!username.trim()) { setError('Username is required'); setLoading(false); return; }
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: username.trim() });
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid,
          username: username.trim(),
          email,
          createdAt: serverTimestamp(),
          online: true,
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      const msgs = {
        'auth/email-already-in-use': 'Email already in use',
        'auth/invalid-email': 'Invalid email address',
        'auth/weak-password': 'Password must be at least 6 characters',
        'auth/user-not-found': 'No account found with that email',
        'auth/wrong-password': 'Incorrect password',
        'auth/invalid-credential': 'Invalid email or password',
      };
      setError(msgs[err.code] || 'Something went wrong');
    }
    setLoading(false);
  }

  return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
      fontFamily: 'var(--font)',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,92,252,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '380px', animation: 'fadein 0.4s ease',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '16px', margin: '0 auto 14px',
            background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', boxShadow: '0 0 30px rgba(124,92,252,0.4)',
          }}>💬</div>
          <h1 style={{
            fontFamily: 'var(--font-head)', fontSize: '2rem', fontWeight: 800,
            background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.02em',
          }}>Aighto</h1>
          <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginTop: '4px' }}>
            {mode === 'login' ? 'Welcome back 👋' : 'Create your account'}
          </p>
        </div>

        {/* Form card */}
        <div style={{
          background: 'var(--bg2)', borderRadius: '20px',
          border: '1px solid var(--border)', padding: '28px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {mode === 'signup' && (
              <Field label="Username" value={username} onChange={setUsername}
                placeholder="how your friends see you" type="text" />
            )}
            <Field label="Email" value={email} onChange={setEmail}
              placeholder="you@example.com" type="email" />
            <Field label="Password" value={password} onChange={setPassword}
              placeholder="••••••••" type="password" />

            {error && (
              <div style={{
                background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)',
                borderRadius: '10px', padding: '10px 14px',
                fontSize: '0.8rem', color: 'var(--danger)',
              }}>{error}</div>
            )}

            <button type="submit" disabled={loading} style={{
              background: loading ? 'rgba(124,92,252,0.5)' : 'linear-gradient(135deg, var(--accent), var(--accent2))',
              border: 'none', borderRadius: '12px', padding: '13px',
              color: 'white', fontSize: '0.9rem', fontWeight: 700,
              fontFamily: 'var(--font-head)', cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', marginTop: '4px',
              boxShadow: loading ? 'none' : '0 4px 20px rgba(124,92,252,0.35)',
            }}>
              {loading ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        {/* Toggle */}
        <p style={{ textAlign: 'center', marginTop: '18px', fontSize: '0.82rem', color: 'var(--text2)' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--accent2)', fontWeight: 600, fontFamily: 'var(--font)', fontSize: '0.82rem',
            }}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type }) {
  return (
    <div>
      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
        {label}
      </label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required
        style={{
          width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '11px 14px', color: 'var(--text)',
          fontSize: '0.88rem', fontFamily: 'var(--font)', outline: 'none',
          transition: 'border 0.2s',
        }}
        onFocus={e => e.target.style.borderColor = 'rgba(124,92,252,0.5)'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      />
    </div>
  );
}
