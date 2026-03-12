import { useState, useEffect } from 'react';
import {
  collection, query, onSnapshot, getDocs,
  doc, updateDoc, deleteDoc, addDoc, serverTimestamp, orderBy, writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';

const ROLES = [
  { value: 'member',    label: '👤 Member',    color: 'var(--text3)' },
  { value: 'vip',       label: '⭐ VIP',        color: '#fbbf24' },
  { value: 'moderator', label: '🛡️ Moderator',  color: '#60a5fa' },
  { value: 'owner',     label: '👑 Owner',      color: '#f59e0b' },
];

const DEFAULT_CHANNELS = ['general', 'random', 'gaming', 'music'];

function StatCard({ label, value, icon }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', flex: 1 }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>{icon}</div>
      <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '2px' }}>{label}</div>
    </div>
  );
}

export default function DevPanel({ user, onClose, theme }) {
  const [activeTab, setActiveTab]         = useState('stats');
  const [users, setUsers]                 = useState([]);
  const [channels, setChannels]           = useState([]);
  const [allMessages, setAllMessages]     = useState([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [broadcastText, setBroadcastText] = useState('');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg]   = useState('');
  const [loading, setLoading]             = useState(false);
  const [toast, setToast]                 = useState(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // Load all users
  useEffect(() => {
    return onSnapshot(collection(db, 'users'), snap => {
      setUsers(snap.docs.map(d => d.data()));
    });
  }, []);

  // Load channels (default + custom)
  useEffect(() => {
    return onSnapshot(collection(db, 'customChannels'), snap => {
      const custom = snap.docs.map(d => ({ id: d.id, ...d.data(), custom: true }));
      setChannels(custom);
    });
  }, []);

  // Load maintenance mode
  useEffect(() => {
    return onSnapshot(doc(db, 'appConfig', 'maintenance'), snap => {
      const data = snap.data() || {};
      setMaintenanceMode(data.enabled || false);
      setMaintenanceMsg(data.message || '');
    });
  }, []);

  // Stats
  const totalUsers    = users.length;
  const onlineUsers   = users.filter(u => u.online && u.status !== 'offline').length;
  const mutedUsers    = users.filter(u => u.muted).length;

  const TABS = [
    { id: 'stats',    label: '📊 Stats'    },
    { id: 'users',    label: '👥 Users'    },
    { id: 'channels', label: '💬 Channels' },
    { id: 'system',   label: '⚙️ System'   },
  ];

  async function assignRole(uid, role) {
    await updateDoc(doc(db, 'users', uid), { role });
    showToast(`Role updated to ${role}`);
  }

  async function kickUser(uid, username) {
    await updateDoc(doc(db, 'users', uid), { kicked: true });
    setTimeout(() => updateDoc(doc(db, 'users', uid), { kicked: false }), 3000);
    showToast(`Kicked ${username}`);
  }

  async function muteUser(uid, username, currentlyMuted) {
    await updateDoc(doc(db, 'users', uid), { muted: !currentlyMuted });
    showToast(`${currentlyMuted ? 'Unmuted' : 'Muted'} ${username}`);
  }

  async function createChannel() {
    if (!newChannelName.trim()) return;
    const id = newChannelName.trim().toLowerCase().replace(/\s+/g, '-');
    if (DEFAULT_CHANNELS.includes(id)) return showToast('Channel already exists', 'error');
    await addDoc(collection(db, 'customChannels'), {
      id, name: id, icon: '💬', createdAt: serverTimestamp(),
    });
    setNewChannelName('');
    showToast(`#${id} created!`);
  }

  async function deleteChannel(channelId) {
    // Delete all messages in channel
    const msgs = await getDocs(collection(db, 'channels', channelId, 'messages'));
    const batch = writeBatch(db);
    msgs.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    // Delete channel doc
    const snap = await getDocs(query(collection(db, 'customChannels')));
    const channelDoc = snap.docs.find(d => d.data().id === channelId);
    if (channelDoc) await deleteDoc(channelDoc.ref);
    showToast(`#${channelId} deleted`);
  }

  async function toggleMaintenance() {
    const newVal = !maintenanceMode;
    await updateDoc(doc(db, 'appConfig', 'maintenance'), {
      enabled: newVal,
      message: maintenanceMsg || '🔧 Aighto is currently under maintenance. Check back soon!',
    }).catch(async () => {
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'appConfig', 'maintenance'), {
        enabled: newVal,
        message: maintenanceMsg || '🔧 Aighto is currently under maintenance. Check back soon!',
      });
    });
    setMaintenanceMode(newVal);
    showToast(newVal ? 'Maintenance mode ON' : 'Maintenance mode OFF');
  }

  async function broadcast() {
    if (!broadcastText.trim()) return;
    setLoading(true);
    const allChs = [...DEFAULT_CHANNELS, ...channels.map(c => c.id)];
    await Promise.all(allChs.map(chId =>
      addDoc(collection(db, 'channels', chId, 'messages'), {
        text: broadcastText,
        uid: user.uid,
        username: '📢 Announcement',
        createdAt: serverTimestamp(),
        reactions: {},
        edited: false,
        isAnnouncement: true,
      })
    ));
    setBroadcastText('');
    setLoading(false);
    showToast('Broadcast sent to all channels!');
  }

  const roleInfo = role => ROLES.find(r => r.value === role) || ROLES[0];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadein 0.15s ease' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '780px', height: '560px', background: 'var(--bg2)',
        border: `1px solid ${theme['--accent']}44`, borderRadius: '20px',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: `0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px ${theme['--accent']}22`,
        animation: 'settings-in 0.2s ease',
      }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.2rem' }}>👑</span>
            <span style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 700, color: 'var(--accent)' }}>Dev Panel</span>
            <span style={{ fontSize: '0.65rem', background: `${theme['--accent']}22`, border: `1px solid ${theme['--accent']}44`, borderRadius: '6px', padding: '2px 8px', color: 'var(--accent2)' }}>OWNER</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '1rem' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 16px', flexShrink: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ background: 'none', border: 'none', borderBottom: activeTab === t.id ? `2px solid var(--accent)` : '2px solid transparent',
                padding: '10px 14px', cursor: 'pointer', color: activeTab === t.id ? 'var(--accent)' : 'var(--text3)',
                fontSize: '0.82rem', fontWeight: activeTab === t.id ? 600 : 400, fontFamily: 'var(--font)', transition: 'all 0.15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* STATS */}
          {activeTab === 'stats' && (
            <div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <StatCard label="Total Users" value={totalUsers} icon="👥" />
                <StatCard label="Online Now" value={onlineUsers} icon="🟢" />
                <StatCard label="Muted Users" value={mutedUsers} icon="🔇" />
              </div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>All Users</div>
                {users.map(u => (
                  <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                      background: u.online && u.status !== 'offline' ? '#4ade80' : '#6b7280' }} />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text)', flex: 1 }}>{u.username}</span>
                    <span style={{ fontSize: '0.72rem', color: roleInfo(u.role).color }}>{roleInfo(u.role).label}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>{u.online && u.status !== 'offline' ? 'online' : 'offline'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* USERS */}
          {activeTab === 'users' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {users.filter(u => u.uid !== user.uid).map(u => (
                <div key={u.uid} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: u.online && u.status !== 'offline' ? '#4ade80' : '#6b7280' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text)', fontWeight: 600 }}>{u.username}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>{u.email}</div>
                  </div>
                  {/* Role selector */}
                  <select value={u.role || 'member'} onChange={e => assignRole(u.uid, e.target.value)}
                    style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px',
                      padding: '5px 8px', color: roleInfo(u.role).color, fontSize: '0.78rem',
                      fontFamily: 'var(--font)', cursor: 'pointer', outline: 'none' }}>
                    {ROLES.filter(r => r.value !== 'owner').map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  {/* Mute */}
                  <button onClick={() => muteUser(u.uid, u.username, u.muted)}
                    style={{ background: u.muted ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.06)',
                      border: u.muted ? '1px solid rgba(251,191,36,0.3)' : '1px solid var(--border)',
                      borderRadius: '8px', padding: '5px 10px', cursor: 'pointer',
                      color: u.muted ? '#fbbf24' : 'var(--text2)', fontSize: '0.78rem', fontFamily: 'var(--font)' }}>
                    {u.muted ? '🔇 Unmute' : '🔇 Mute'}
                  </button>
                  {/* Kick */}
                  <button onClick={() => kickUser(u.uid, u.username)}
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                      borderRadius: '8px', padding: '5px 10px', cursor: 'pointer',
                      color: '#f87171', fontSize: '0.78rem', fontFamily: 'var(--font)' }}>
                    ⚡ Kick
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* CHANNELS */}
          {activeTab === 'channels' && (
            <div>
              {/* Default channels */}
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Default Channels</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
                {DEFAULT_CHANNELS.map(ch => (
                  <div key={ch} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text)' }}>#{ch}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>default — cannot delete</span>
                  </div>
                ))}
              </div>

              {/* Custom channels */}
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Custom Channels</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                {channels.length === 0 && <div style={{ fontSize: '0.82rem', color: 'var(--text3)', padding: '10px 0' }}>No custom channels yet.</div>}
                {channels.map(ch => (
                  <div key={ch.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text)' }}>#{ch.id}</span>
                    <button onClick={() => deleteChannel(ch.id)}
                      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', color: '#f87171', fontSize: '0.78rem', fontFamily: 'var(--font)' }}>
                      🗑 Delete
                    </button>
                  </div>
                ))}
              </div>

              {/* Create channel */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={newChannelName} onChange={e => setNewChannelName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder="new-channel-name"
                  onKeyDown={e => e.key === 'Enter' && createChannel()}
                  style={{ flex: 1, background: 'var(--bg)', border: `1px solid ${theme['--accent']}44`, borderRadius: '10px',
                    padding: '10px 14px', color: 'var(--text)', fontSize: '0.85rem', fontFamily: 'var(--font)', outline: 'none' }} />
                <button onClick={createChannel}
                  style={{ background: `linear-gradient(135deg, var(--accent), var(--accent2))`, border: 'none', borderRadius: '10px',
                    padding: '10px 18px', color: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  + Create
                </button>
              </div>
            </div>
          )}

          {/* SYSTEM */}
          {activeTab === 'system' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Maintenance mode */}
              <div style={{ background: 'var(--bg)', border: `1px solid ${maintenanceMode ? 'rgba(251,191,36,0.3)' : 'var(--border)'}`, borderRadius: '14px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: maintenanceMode ? '#fbbf24' : 'var(--text)' }}>🔧 Maintenance Mode</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: '2px' }}>Shows a banner to all users</div>
                  </div>
                  <div onClick={toggleMaintenance} style={{ width: '42px', height: '24px', borderRadius: '12px', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                    background: maintenanceMode ? '#fbbf24' : 'rgba(255,255,255,0.1)', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '3px', left: maintenanceMode ? '21px' : '3px', width: '18px', height: '18px',
                      borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
                  </div>
                </div>
                <input value={maintenanceMsg} onChange={e => setMaintenanceMsg(e.target.value)}
                  placeholder="🔧 Aighto is under maintenance. Check back soon!"
                  style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '10px',
                    padding: '9px 14px', color: 'var(--text)', fontSize: '0.82rem', fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {/* Broadcast */}
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>📢 Broadcast Message</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginBottom: '10px' }}>Sends a message to every channel at once</div>
                <textarea value={broadcastText} onChange={e => setBroadcastText(e.target.value)} rows={3}
                  placeholder="Type your announcement..."
                  style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '10px',
                    padding: '10px 14px', color: 'var(--text)', fontSize: '0.85rem', fontFamily: 'var(--font)',
                    outline: 'none', resize: 'none', marginBottom: '10px', boxSizing: 'border-box' }} />
                <button onClick={broadcast} disabled={loading || !broadcastText.trim()}
                  style={{ background: broadcastText.trim() ? `linear-gradient(135deg, var(--accent), var(--accent2))` : 'rgba(255,255,255,0.06)',
                    border: 'none', borderRadius: '10px', padding: '9px 20px', color: 'white',
                    fontSize: '0.85rem', fontWeight: 600, cursor: broadcastText.trim() ? 'pointer' : 'default', fontFamily: 'var(--font)' }}>
                  {loading ? 'Sending...' : '📢 Broadcast'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'error' ? '#ef4444' : '#4ade80', color: 'white', borderRadius: '10px',
          padding: '10px 20px', fontSize: '0.85rem', fontWeight: 600, zIndex: 1000,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', animation: 'fadein 0.2s ease' }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes settings-in {
          from { transform: scale(0.95); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
