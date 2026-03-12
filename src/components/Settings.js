import { useState, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { updatePassword, updateProfile, reauthenticateWithCredential, EmailAuthProvider, deleteUser } from 'firebase/auth';
import { auth, db } from '../firebase';

const THEMES = {
  purple: { name: '🟣 Purple',     '--accent': '#7c5cfc', '--accent2': '#c084fc' },
  black:  { name: '⚫ Pure Black',  '--accent': '#e0e0e0', '--accent2': '#999999' },
  red:    { name: '🔴 Red Dark',    '--accent': '#ef4444', '--accent2': '#f87171' },
  pink:   { name: '🌸 Soft Pink',   '--accent': '#ec4899', '--accent2': '#f9a8d4' },
  ocean:  { name: '🔵 Ocean Blue',  '--accent': '#3b82f6', '--accent2': '#60a5fa' },
};

const FONT_SIZES = [
  { label: 'Small',  value: '13px' },
  { label: 'Medium', value: '15px' },
  { label: 'Large',  value: '17px' },
];

function Avatar({ name, size = 56, photoURL }) {
  const colors = ['#7c5cfc','#c084fc','#f472b6','#fb923c','#34d399','#60a5fa'];
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length];
  return photoURL ? (
    <img src={photoURL} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: 'white', fontFamily: 'var(--font-head)', flexShrink: 0 }}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      {label && <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text2)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{label}</label>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '11px 14px', color: 'var(--text)', fontSize: '0.88rem',
          fontFamily: 'var(--font)', outline: 'none', transition: 'border 0.2s', boxSizing: 'border-box' }}
        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'} />
    </div>
  );
}

function SaveBtn({ onClick, label = 'Save Changes', loading }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent2))', border: 'none',
        borderRadius: '10px', padding: '11px 24px', color: 'white', fontSize: '0.88rem',
        fontWeight: 700, cursor: loading ? 'default' : 'pointer', fontFamily: 'var(--font)',
        opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s' }}>
      {loading ? 'Saving...' : label}
    </button>
  );
}

function Toast({ msg, type }) {
  if (!msg) return null;
  return (
    <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      background: type === 'error' ? '#ef4444' : '#4ade80', color: 'white', borderRadius: '10px',
      padding: '10px 20px', fontSize: '0.85rem', fontWeight: 600, zIndex: 1000,
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)', animation: 'fadein 0.2s ease' }}>
      {msg}
    </div>
  );
}

// ── PROFILE SECTION ──
function ProfileSection({ user, myData }) {
  const [bio, setBio]                   = useState(myData.bio || '');
  const [customStatus, setCustomStatus] = useState(myData.customStatus || '');
  const [loading, setLoading]           = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [toast, setToast]               = useState(null);
  const fileInputRef                    = useRef(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function uploadPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const img = new window.Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX = 150;
        const scale = Math.min(MAX/img.width, MAX/img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.7);
        await updateDoc(doc(db, 'users', user.uid), { photoURL: base64 });
        setUploadingPhoto(false);
        showToast('Profile picture updated!');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { bio, customStatus });
      showToast('Profile saved!');
    } catch {
      showToast('Failed to save', 'error');
    }
    setLoading(false);
  }

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', margin: '0 0 24px' }}>Profile</h2>

      {/* Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '28px',
        padding: '18px', background: 'var(--bg)', borderRadius: '14px', border: '1px solid var(--border)' }}>
        <Avatar name={user.displayName || user.email} size={68} photoURL={myData.photoURL} />
        <div>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>{user.displayName}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: '10px' }}>{user.email}</div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={uploadPhoto} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()}
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)', borderRadius: '8px',
              padding: '6px 14px', color: 'var(--text2)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font)' }}>
            {uploadingPhoto ? 'Uploading...' : '📷 Change Photo'}
          </button>
        </div>
      </div>

      <Input label="Custom Status" value={customStatus} onChange={e => setCustomStatus(e.target.value)} placeholder="e.g. Playing Valorant 🎮" />

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text2)',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Bio</label>
        <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell your friends about yourself..." rows={4}
          style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px',
            padding: '11px 14px', color: 'var(--text)', fontSize: '0.88rem', fontFamily: 'var(--font)',
            outline: 'none', resize: 'vertical', boxSizing: 'border-box', transition: 'border 0.2s' }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'} />
      </div>

      <SaveBtn onClick={saveProfile} loading={loading} />
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}

// ── APPEARANCE SECTION ──
function AppearanceSection({ activeTheme, switchTheme }) {
  const [fontSize, setFontSize] = useState(localStorage.getItem('aighto_fontsize') || '15px');

  function changeFontSize(size) {
    setFontSize(size);
    localStorage.setItem('aighto_fontsize', size);
    document.documentElement.style.fontSize = size;
    document.documentElement.style.setProperty('--font-size', size);
  }

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', margin: '0 0 24px' }}>Appearance</h2>

      {/* Themes */}
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text2)',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Theme</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Object.entries(THEMES).map(([key, t]) => (
            <button key={key} onClick={() => switchTheme(key)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                background: activeTheme === key ? `${t['--accent']}18` : 'var(--bg)',
                border: activeTheme === key ? `1px solid ${t['--accent']}55` : '1px solid var(--border)',
                borderRadius: '12px', cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%',
                background: `linear-gradient(135deg, ${t['--accent']}, ${t['--accent2']})`, flexShrink: 0 }} />
              <span style={{ fontSize: '0.88rem', fontWeight: activeTheme === key ? 600 : 400,
                color: activeTheme === key ? t['--accent'] : 'var(--text2)', fontFamily: 'var(--font)' }}>{t.name}</span>
              {activeTheme === key && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: t['--accent'] }}>✓ Active</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Font size */}
      <div>
        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text2)',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Font Size</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          {FONT_SIZES.map(f => (
            <button key={f.value} onClick={() => changeFontSize(f.value)}
              style={{ flex: 1, padding: '10px', background: fontSize === f.value ? 'var(--accent)' : 'var(--bg)',
                border: `1px solid ${fontSize === f.value ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '10px', color: fontSize === f.value ? 'white' : 'var(--text2)',
                fontSize: f.value, fontWeight: fontSize === f.value ? 700 : 400,
                cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s' }}>
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: '12px', padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <span style={{ fontSize, color: 'var(--text2)' }}>Preview: This is what your messages will look like.</span>
        </div>
      </div>
    </div>
  );
}

// ── ACCOUNT SECTION ──
function AccountSection({ user }) {
  const [newPassword, setNewPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [deleteConfirm, setDeleteConfirm]   = useState('');
  const [showDelete, setShowDelete]         = useState(false);
  const [loading, setLoading]               = useState(false);
  const [toast, setToast]                   = useState(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function changePassword() {
    if (!currentPassword) return showToast('Enter your current password', 'error');
    if (!newPassword) return showToast('Enter a new password', 'error');
    if (newPassword !== confirmPassword) return showToast('Passwords do not match', 'error');
    if (newPassword.length < 6) return showToast('Password must be at least 6 characters', 'error');
    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      showToast('Password changed successfully!');
    } catch (err) {
      showToast(err.code === 'auth/wrong-password' ? 'Current password is incorrect' : 'Failed to change password', 'error');
    }
    setLoading(false);
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== user.displayName) return showToast('Username does not match', 'error');
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { deleted: true });
      await deleteUser(auth.currentUser);
    } catch (err) {
      showToast('Failed to delete account. You may need to sign in again first.', 'error');
    }
    setLoading(false);
  }

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', margin: '0 0 24px' }}>Account</h2>

      {/* Account info */}
      <div style={{ padding: '16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px', marginBottom: '28px' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Account Info</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text3)' }}>Username</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text)', fontWeight: 600 }}>{user.displayName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text3)' }}>Email</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text)', fontWeight: 600 }}>{user.email}</span>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>Change Password</div>
        <Input label="Current Password" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
        <Input label="New Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password" />
        <Input label="Confirm New Password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
        <SaveBtn onClick={changePassword} loading={loading} label="Change Password" />
      </div>

      {/* Minimize to tray */}
      <div style={{ marginBottom:'28px' }}>
        <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'14px' }}>App Behaviour</div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'12px' }}>
          <div>
            <div style={{ fontSize:'0.85rem', color:'var(--text)', fontWeight:500 }}>Minimize to tray on close</div>
            <div style={{ fontSize:'0.72rem', color:'var(--text3)', marginTop:'2px' }}>App stays running in the background when you close the window</div>
          </div>
          <div onClick={() => {
            const newVal = !trayEnabled;
            setTrayEnabled(newVal);
            localStorage.setItem('aighto_tray', newVal.toString());
            window.electron?.setMinimizeToTray?.(newVal);
          }} style={{ width:'42px', height:'24px', borderRadius:'12px', cursor:'pointer', transition:'background 0.2s', flexShrink:0,
            background:trayEnabled?'var(--accent)':'rgba(255,255,255,0.1)', position:'relative' }}>
            <div style={{ position:'absolute', top:'3px', left:trayEnabled?'21px':'3px', width:'18px', height:'18px',
              borderRadius:'50%', background:'white', transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }} />
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div style={{ padding: '18px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '14px' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f87171', marginBottom: '6px' }}>⚠️ Danger Zone</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: '14px' }}>Deleting your account is permanent and cannot be undone.</div>
        {!showDelete ? (
          <button onClick={() => setShowDelete(true)}
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px',
              padding: '8px 16px', color: '#f87171', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Delete Account
          </button>
        ) : (
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text2)', marginBottom: '8px' }}>
              Type your username <strong style={{ color: 'var(--text)' }}>{user.displayName}</strong> to confirm:
            </div>
            <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder={user.displayName}
              style={{ width: '100%', background: 'var(--bg)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px',
                padding: '9px 12px', color: 'var(--text)', fontSize: '0.85rem', fontFamily: 'var(--font)',
                outline: 'none', marginBottom: '10px', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleDeleteAccount} disabled={loading}
                style={{ background: '#ef4444', border: 'none', borderRadius: '8px', padding: '8px 16px',
                  color: 'white', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                {loading ? 'Deleting...' : 'Confirm Delete'}
              </button>
              <button onClick={() => { setShowDelete(false); setDeleteConfirm(''); }}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '8px',
                  padding: '8px 16px', color: 'var(--text2)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}

// ── MAIN SETTINGS ──
export default function Settings({ user, myData, activeTheme, switchTheme, onClose }) {
  const [activeSection, setActiveSection] = useState('profile');

  const NAV = [
    { id: 'profile',    label: 'Profile',    icon: '👤' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'account',    label: 'Account',    icon: '⚙️' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 400,
      display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadein 0.15s ease' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '680px', height: '500px', background: 'var(--bg2)',
        border: '1px solid var(--border)', borderRadius: '20px',
        display: 'flex', overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        animation: 'settings-in 0.2s ease',
      }}>

        {/* Sidebar */}
        <div style={{ width: '190px', flexShrink: 0, background: 'var(--bg)', borderRight: '1px solid var(--border)', padding: '20px 10px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', paddingLeft: '10px', marginBottom: '8px' }}>Settings</div>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setActiveSection(n.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                background: activeSection === n.id ? `var(--accent)22` : 'transparent',
                border: 'none', borderRadius: '10px', cursor: 'pointer', transition: 'background 0.15s', marginBottom: '2px' }}>
              <span style={{ fontSize: '1rem' }}>{n.icon}</span>
              <span style={{ fontSize: '0.85rem', fontWeight: activeSection === n.id ? 600 : 400,
                color: activeSection === n.id ? 'var(--accent)' : 'var(--text2)', fontFamily: 'var(--font)' }}>{n.label}</span>
            </button>
          ))}
          <div style={{ marginTop: 'auto' }}>
            <button onClick={onClose}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                background: 'transparent', border: 'none', borderRadius: '10px', cursor: 'pointer', color: 'var(--text3)', fontFamily: 'var(--font)', fontSize: '0.85rem' }}>
              ✕ Close
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '28px', overflowY: 'auto' }}>
          {activeSection === 'profile'    && <ProfileSection user={user} myData={myData} />}
          {activeSection === 'appearance' && <AppearanceSection activeTheme={activeTheme} switchTheme={switchTheme} />}
          {activeSection === 'account'    && <AccountSection user={user} />}
        </div>
      </div>

      <style>{`
        @keyframes settings-in {
          from { transform: scale(0.95); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
