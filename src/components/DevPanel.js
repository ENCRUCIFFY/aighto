import { useState, useEffect } from 'react';
import {
  collection, query, onSnapshot, getDocs,
  doc, updateDoc, deleteDoc, addDoc, setDoc,
  serverTimestamp, orderBy, writeBatch
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
    <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'14px', padding:'16px', flex:1 }}>
      <div style={{ fontSize:'1.5rem', marginBottom:'6px' }}>{icon}</div>
      <div style={{ fontFamily:'var(--font-head)', fontSize:'1.6rem', fontWeight:800, color:'var(--accent)' }}>{value}</div>
      <div style={{ fontSize:'0.75rem', color:'var(--text3)', marginTop:'2px' }}>{label}</div>
    </div>
  );
}

function formatDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(ts) {
  if (!ts) return 'Unknown';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function formatDateTime(ts) {
  if (!ts) return 'Unknown';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

const roleInfo = role => ROLES.find(r => r.value === role) || ROLES[0];

// Separate component for user row so hooks are valid
function UserRow({ u, currentUser, userNotes, assignRole, muteUser, kickUser, banUser, unbanUser, warnUser, loadUserMessages, saveNote, theme }) {
  const [banReason,  setBanReason]  = useState('');
  const [warnReason, setWarnReason] = useState('');
  const [noteText,   setNoteText]   = useState(userNotes[u.uid] || '');

  useEffect(() => { setNoteText(userNotes[u.uid] || ''); }, [userNotes, u.uid]);

  return (
    <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'12px', padding:'12px 14px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
        <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:u.online&&u.status!=='offline'?'#4ade80':'#6b7280' }} />
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'0.88rem', color:'var(--text)', fontWeight:600 }}>{u.username}</div>
          <div style={{ fontSize:'0.68rem', color:'var(--text3)' }}>{u.email} · {u.os||'Unknown OS'} · v{u.appVersion||'?'} · {u.timezone||'?'}</div>
          <div style={{ fontSize:'0.68rem', color:'var(--text3)' }}>Joined {formatDate(u.createdAt)} · Last seen {formatDateTime(u.lastSeen)} · Time in app: {u.sessionTime?formatDuration(u.sessionTime):'—'}</div>
        </div>
        <select value={u.role||'member'} onChange={e => assignRole(u.uid, e.target.value)}
          style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'8px', padding:'4px 8px', color:roleInfo(u.role).color, fontSize:'0.75rem', fontFamily:'var(--font)', cursor:'pointer', outline:'none' }}>
          {ROLES.filter(r => r.value !== 'owner').map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'8px' }}>
        <button onClick={() => muteUser(u.uid, u.username, u.muted)}
          style={{ background:u.muted?'rgba(251,191,36,0.15)':'rgba(255,255,255,0.06)', border:u.muted?'1px solid rgba(251,191,36,0.3)':'1px solid var(--border)', borderRadius:'8px', padding:'4px 10px', cursor:'pointer', color:u.muted?'#fbbf24':'var(--text2)', fontSize:'0.75rem', fontFamily:'var(--font)' }}>
          {u.muted?'🔇 Unmute':'🔇 Mute'}
        </button>
        <button onClick={() => kickUser(u.uid, u.username)}
          style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'8px', padding:'4px 10px', cursor:'pointer', color:'#f87171', fontSize:'0.75rem', fontFamily:'var(--font)' }}>
          ⚡ Kick
        </button>
        <button onClick={() => loadUserMessages(u)}
          style={{ background:'rgba(96,165,250,0.08)', border:'1px solid rgba(96,165,250,0.2)', borderRadius:'8px', padding:'4px 10px', cursor:'pointer', color:'#60a5fa', fontSize:'0.75rem', fontFamily:'var(--font)' }}>
          💬 Messages
        </button>
        {!u.banned ? (
          <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
            <input type="text" value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Ban reason..."
              style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'8px', padding:'4px 8px', color:'var(--text)', fontSize:'0.72rem', fontFamily:'var(--font)', outline:'none', width:'110px' }} />
            <button onClick={() => { banUser(u.uid, u.username, banReason); setBanReason(''); }}
              style={{ background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'8px', padding:'4px 10px', cursor:'pointer', color:'#f87171', fontSize:'0.75rem', fontFamily:'var(--font)' }}>
              🚫 Ban
            </button>
          </div>
        ) : (
          <button onClick={() => unbanUser(u.uid, u.username)}
            style={{ background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.25)', borderRadius:'8px', padding:'4px 10px', cursor:'pointer', color:'#4ade80', fontSize:'0.75rem', fontFamily:'var(--font)' }}>
            ✓ Unban
          </button>
        )}
        <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
          <input type="text" value={warnReason} onChange={e => setWarnReason(e.target.value)} placeholder="Warn reason..."
            style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'8px', padding:'4px 8px', color:'var(--text)', fontSize:'0.72rem', fontFamily:'var(--font)', outline:'none', width:'110px' }} />
          <button onClick={() => { warnUser(u.uid, u.username, warnReason); setWarnReason(''); }}
            style={{ background:'rgba(251,191,36,0.1)', border:'1px solid rgba(251,191,36,0.25)', borderRadius:'8px', padding:'4px 10px', cursor:'pointer', color:'#fbbf24', fontSize:'0.75rem', fontFamily:'var(--font)' }}>
            ⚠️ Warn
          </button>
        </div>
      </div>
      <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
        <input type="text" value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Private note (only you see this)..."
          style={{ flex:1, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'8px', padding:'5px 10px', color:'var(--text)', fontSize:'0.72rem', fontFamily:'var(--font)', outline:'none' }} />
        <button onClick={() => saveNote(u.uid, noteText)}
          style={{ background:`${theme['--accent']}22`, border:`1px solid ${theme['--accent']}44`, borderRadius:'8px', padding:'5px 10px', cursor:'pointer', color:'var(--accent2)', fontSize:'0.72rem', fontFamily:'var(--font)' }}>
          Save
        </button>
      </div>
      {userNotes[u.uid] && <div style={{ fontSize:'0.68rem', color:'var(--accent2)', marginTop:'4px', paddingLeft:'4px' }}>📝 {userNotes[u.uid]}</div>}
    </div>
  );
}

export default function DevPanel({ user, onClose, theme }) {
  const [activeTab, setActiveTab]             = useState('stats');
  const [users, setUsers]                     = useState([]);
  const [channels, setChannels]               = useState([]);
  const [newChannelName, setNewChannelName]   = useState('');
  const [broadcastText, setBroadcastText]     = useState('');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg]   = useState('');
  const [motdEnabled, setMotdEnabled]         = useState(false);
  const [motdText, setMotdText]               = useState('');
  const [patchNotes, setPatchNotes]           = useState('');
  const [patchVersion, setPatchVersion]       = useState('');
  const [minVersion, setMinVersion]           = useState('');
  const [modLog, setModLog]                   = useState([]);
  const [userNotes, setUserNotes]             = useState({});
  const [selectedUser, setSelectedUser]       = useState(null);
  const [userMessages, setUserMessages]       = useState([]);
  const [dmConvoA, setDmConvoA]               = useState('');
  const [dmConvoB, setDmConvoB]               = useState('');
  const [dmMessages, setDmMessages]           = useState([]);
  const [loading, setLoading]                 = useState(false);
  const [toast, setToast]                     = useState(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => { return onSnapshot(collection(db, 'users'), snap => setUsers(snap.docs.map(d => d.data()))); }, []);
  useEffect(() => { return onSnapshot(collection(db, 'customChannels'), snap => setChannels(snap.docs.map(d => ({ id:d.id, ...d.data() })))); }, []);
  useEffect(() => { return onSnapshot(doc(db, 'appConfig', 'maintenance'), snap => { const d = snap.data()||{}; setMaintenanceMode(d.enabled||false); setMaintenanceMsg(d.message||''); }); }, []);
  useEffect(() => { return onSnapshot(doc(db, 'appConfig', 'motd'), snap => { const d = snap.data()||{}; setMotdEnabled(d.enabled||false); setMotdText(d.text||''); }); }, []);
  useEffect(() => { return onSnapshot(doc(db, 'appConfig', 'patchNotes'), snap => { const d = snap.data()||{}; setPatchNotes(d.notes||''); setPatchVersion(d.version||''); }); }, []);
  useEffect(() => { return onSnapshot(doc(db, 'appConfig', 'minVersion'), snap => setMinVersion(snap.data()?.version||'')); }, []);
  useEffect(() => { return onSnapshot(query(collection(db, 'modLog'), orderBy('timestamp', 'desc')), snap => setModLog(snap.docs.map(d => ({ id:d.id, ...d.data() })))); }, []);
  useEffect(() => { return onSnapshot(collection(db, 'userNotes'), snap => { const n={}; snap.docs.forEach(d => { n[d.id]=d.data().note||''; }); setUserNotes(n); }); }, []);

  const totalUsers  = users.length;
  const onlineUsers = users.filter(u => u.online && u.status !== 'offline').length;
  const mutedUsers  = users.filter(u => u.muted).length;
  const bannedUsers = users.filter(u => u.banned).length;

  const TABS = [
    { id:'stats',    label:'📊 Stats'    },
    { id:'users',    label:'👥 Users'    },
    { id:'messages', label:'💬 Messages' },
    { id:'dms',      label:'🔒 DMs'      },
    { id:'channels', label:'📡 Channels' },
    { id:'system',   label:'⚙️ System'   },
    { id:'modlog',   label:'📋 Mod Log'  },
  ];

  async function logMod(action, targetUid, targetName, reason = '') {
    await addDoc(collection(db, 'modLog'), { action, targetUid, targetName, reason, byUid:user.uid, byName:user.displayName, timestamp:serverTimestamp() });
  }

  async function assignRole(uid, role) { await updateDoc(doc(db, 'users', uid), { role }); showToast(`Role → ${role}`); }
  async function kickUser(uid, username) { await updateDoc(doc(db, 'users', uid), { kicked:true }); setTimeout(() => updateDoc(doc(db, 'users', uid), { kicked:false }), 3000); await logMod('kick', uid, username); showToast(`Kicked ${username}`); }
  async function muteUser(uid, username, muted) { await updateDoc(doc(db, 'users', uid), { muted:!muted }); await logMod(muted?'unmute':'mute', uid, username); showToast(`${muted?'Unmuted':'Muted'} ${username}`); }
  async function banUser(uid, username, reason) { await updateDoc(doc(db, 'users', uid), { banned:true, banReason:reason||'No reason' }); await logMod('ban', uid, username, reason); showToast(`Banned ${username}`); }
  async function unbanUser(uid, username) { await updateDoc(doc(db, 'users', uid), { banned:false, banReason:'' }); await logMod('unban', uid, username); showToast(`Unbanned ${username}`); }
  async function warnUser(uid, username, reason) { await updateDoc(doc(db, 'users', uid), { warned:true, warnMessage:reason||'Please follow the community guidelines.', warnedAt:serverTimestamp() }); await logMod('warn', uid, username, reason); showToast(`Warned ${username}`); }
  async function saveNote(uid, note) { await setDoc(doc(db, 'userNotes', uid), { note }); showToast('Note saved'); }

  async function loadUserMessages(u) {
    setSelectedUser(u); setUserMessages([]); setActiveTab('messages');
    const allChs = [...DEFAULT_CHANNELS, ...channels.map(c => c.id)];
    const msgs = [];
    for (const chId of allChs) {
      const snap = await getDocs(query(collection(db, 'channels', chId, 'messages'), orderBy('createdAt')));
      snap.docs.forEach(d => { const data = d.data(); if (data.uid === u.uid) msgs.push({ id:d.id, channel:chId, ...data }); });
    }
    msgs.sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    setUserMessages(msgs);
  }

  async function loadDmConvo() {
    if (!dmConvoA || !dmConvoB) return;
    const uidA = users.find(u => u.username === dmConvoA)?.uid;
    const uidB = users.find(u => u.username === dmConvoB)?.uid;
    if (!uidA || !uidB) return showToast('User not found', 'error');
    const dmId = [uidA, uidB].sort().join('_');
    const snap = await getDocs(query(collection(db, 'dms', dmId, 'messages'), orderBy('createdAt')));
    setDmMessages(snap.docs.map(d => ({ id:d.id, ...d.data() })));
  }

  async function createChannel() {
    if (!newChannelName.trim()) return;
    const id = newChannelName.trim().toLowerCase().replace(/\s+/g, '-');
    if (DEFAULT_CHANNELS.includes(id)) return showToast('Already exists', 'error');
    await addDoc(collection(db, 'customChannels'), { id, name:id, icon:'💬', createdAt:serverTimestamp() });
    setNewChannelName(''); showToast(`#${id} created!`);
  }

  async function deleteChannel(channelId) {
    const msgs = await getDocs(collection(db, 'channels', channelId, 'messages'));
    const batch = writeBatch(db);
    msgs.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    const snap = await getDocs(query(collection(db, 'customChannels')));
    const found = snap.docs.find(d => d.data().id === channelId);
    if (found) await deleteDoc(found.ref);
    showToast(`#${channelId} deleted`);
  }

  async function saveConfig(docId, data) {
    try { await updateDoc(doc(db, 'appConfig', docId), data); }
    catch { await setDoc(doc(db, 'appConfig', docId), data); }
  }

  async function broadcast() {
    if (!broadcastText.trim()) return;
    setLoading(true);
    const allChs = [...DEFAULT_CHANNELS, ...channels.map(c => c.id)];
    await Promise.all(allChs.map(chId => addDoc(collection(db, 'channels', chId, 'messages'), {
      text:broadcastText, uid:user.uid, username:'📢 Announcement',
      createdAt:serverTimestamp(), reactions:{}, edited:false, isAnnouncement:true,
    })));
    setBroadcastText(''); setLoading(false); showToast('Broadcast sent!');
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width:'860px', height:'600px', background:'var(--bg2)', border:`1px solid ${theme['--accent']}44`, borderRadius:'20px', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <span>👑</span>
            <span style={{ fontFamily:'var(--font-head)', fontSize:'1rem', fontWeight:700, color:'var(--accent)' }}>Dev Panel</span>
            <span style={{ fontSize:'0.62rem', background:`${theme['--accent']}22`, border:`1px solid ${theme['--accent']}44`, borderRadius:'6px', padding:'2px 8px', color:'var(--accent2)' }}>OWNER</span>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:'1rem' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', padding:'0 16px', flexShrink:0, overflowX:'auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ background:'none', border:'none', borderBottom:activeTab===t.id?'2px solid var(--accent)':'2px solid transparent', padding:'10px 12px', cursor:'pointer', color:activeTab===t.id?'var(--accent)':'var(--text3)', fontSize:'0.78rem', fontWeight:activeTab===t.id?600:400, fontFamily:'var(--font)', whiteSpace:'nowrap' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>

          {/* STATS */}
          {activeTab === 'stats' && (
            <div>
              <div style={{ display:'flex', gap:'10px', marginBottom:'16px' }}>
                <StatCard label="Total Users"  value={totalUsers}  icon="👥" />
                <StatCard label="Online Now"   value={onlineUsers} icon="🟢" />
                <StatCard label="Muted"        value={mutedUsers}  icon="🔇" />
                <StatCard label="Banned"       value={bannedUsers} icon="🚫" />
              </div>
              <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'14px', overflow:'hidden' }}>
                <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', fontSize:'0.7rem', fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em' }}>All Users</div>
                {users.map(u => (
                  <div key={u.uid} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ width:'8px', height:'8px', borderRadius:'50%', flexShrink:0, background:u.online&&u.status!=='offline'?'#4ade80':'#6b7280' }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'0.85rem', color:'var(--text)', fontWeight:500 }}>{u.username}</div>
                      <div style={{ fontSize:'0.68rem', color:'var(--text3)' }}>{u.email} · {u.os||'Unknown OS'} · Joined {formatDate(u.createdAt)}</div>
                    </div>
                    <div style={{ fontSize:'0.72rem', color:'var(--text3)' }}>{u.sessionTime ? formatDuration(u.sessionTime) : '—'}</div>
                    <span style={{ fontSize:'0.72rem', color:roleInfo(u.role).color }}>{roleInfo(u.role).label}</span>
                    {u.banned && <span style={{ fontSize:'0.62rem', background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'5px', padding:'1px 6px', color:'#f87171' }}>banned</span>}
                    {u.muted  && <span style={{ fontSize:'0.62rem', background:'rgba(251,191,36,0.15)', border:'1px solid rgba(251,191,36,0.3)', borderRadius:'5px', padding:'1px 6px', color:'#fbbf24' }}>muted</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* USERS */}
          {activeTab === 'users' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {users.filter(u => u.uid !== user.uid).map(u => (
                <UserRow key={u.uid} u={u} currentUser={user} userNotes={userNotes} theme={theme}
                  assignRole={assignRole} muteUser={muteUser} kickUser={kickUser}
                  banUser={banUser} unbanUser={unbanUser} warnUser={warnUser}
                  loadUserMessages={loadUserMessages} saveNote={saveNote} />
              ))}
            </div>
          )}

          {/* MESSAGES */}
          {activeTab === 'messages' && (
            <div>
              {!selectedUser ? (
                <div>
                  <div style={{ fontSize:'0.82rem', color:'var(--text3)', marginBottom:'12px' }}>Select a user to view all their messages:</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                    {users.filter(u => u.uid !== user.uid).map(u => (
                      <button key={u.uid} onClick={() => loadUserMessages(u)}
                        style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'10px', padding:'10px 14px', display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', textAlign:'left' }}>
                        <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:u.online&&u.status!=='offline'?'#4ade80':'#6b7280' }} />
                        <span style={{ fontSize:'0.85rem', color:'var(--text)' }}>{u.username}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <button onClick={() => { setSelectedUser(null); setUserMessages([]); }}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'var(--accent)', fontSize:'0.82rem', marginBottom:'12px', fontFamily:'var(--font)', padding:0 }}>
                    ← Back
                  </button>
                  <div style={{ fontSize:'0.88rem', color:'var(--text)', fontWeight:600, marginBottom:'10px' }}>
                    Messages by {selectedUser.username} ({userMessages.length})
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                    {userMessages.length === 0 && <div style={{ fontSize:'0.82rem', color:'var(--text3)' }}>No messages found.</div>}
                    {userMessages.map(msg => (
                      <div key={msg.id} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'10px', padding:'10px 14px' }}>
                        <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'4px' }}>
                          <span style={{ fontSize:'0.68rem', background:`${theme['--accent']}22`, borderRadius:'5px', padding:'1px 6px', color:'var(--accent2)' }}>#{msg.channel}</span>
                          <span style={{ fontSize:'0.68rem', color:'var(--text3)' }}>{formatDateTime(msg.createdAt)}</span>
                        </div>
                        <div style={{ fontSize:'0.85rem', color:'var(--text)' }}>{msg.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DMs */}
          {activeTab === 'dms' && (
            <div>
              <div style={{ fontSize:'0.72rem', color:'var(--text3)', marginBottom:'12px' }}>View any DM conversation between two users.</div>
              <div style={{ display:'flex', gap:'8px', marginBottom:'12px', alignItems:'center' }}>
                <select value={dmConvoA} onChange={e => setDmConvoA(e.target.value)}
                  style={{ flex:1, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'10px', padding:'8px 12px', color:'var(--text)', fontSize:'0.82rem', fontFamily:'var(--font)', outline:'none' }}>
                  <option value="">User A...</option>
                  {users.map(u => <option key={u.uid} value={u.username}>{u.username}</option>)}
                </select>
                <span style={{ color:'var(--text3)' }}>↔</span>
                <select value={dmConvoB} onChange={e => setDmConvoB(e.target.value)}
                  style={{ flex:1, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'10px', padding:'8px 12px', color:'var(--text)', fontSize:'0.82rem', fontFamily:'var(--font)', outline:'none' }}>
                  <option value="">User B...</option>
                  {users.map(u => <option key={u.uid} value={u.username}>{u.username}</option>)}
                </select>
                <button onClick={loadDmConvo}
                  style={{ background:`linear-gradient(135deg, var(--accent), var(--accent2))`, border:'none', borderRadius:'10px', padding:'8px 16px', color:'white', fontSize:'0.82rem', fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                  Load
                </button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {dmMessages.length === 0 && dmConvoA && dmConvoB && <div style={{ fontSize:'0.82rem', color:'var(--text3)' }}>No messages found.</div>}
                {dmMessages.map(msg => (
                  <div key={msg.id} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'10px', padding:'10px 14px' }}>
                    <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'4px' }}>
                      <span style={{ fontSize:'0.78rem', color:'var(--accent2)', fontWeight:600 }}>{msg.username}</span>
                      <span style={{ fontSize:'0.68rem', color:'var(--text3)' }}>{formatDateTime(msg.createdAt)}</span>
                    </div>
                    <div style={{ fontSize:'0.85rem', color:'var(--text)' }}>{msg.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CHANNELS */}
          {activeTab === 'channels' && (
            <div>
              <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' }}>Default Channels</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'5px', marginBottom:'16px' }}>
                {DEFAULT_CHANNELS.map(ch => (
                  <div key={ch} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'10px', padding:'10px 14px', display:'flex', justifyContent:'space-between' }}>
                    <span style={{ fontSize:'0.85rem', color:'var(--text)' }}>#{ch}</span>
                    <span style={{ fontSize:'0.68rem', color:'var(--text3)' }}>default</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' }}>Custom Channels</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'5px', marginBottom:'12px' }}>
                {channels.length === 0 && <div style={{ fontSize:'0.82rem', color:'var(--text3)' }}>No custom channels yet.</div>}
                {channels.map(ch => (
                  <div key={ch.id} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'10px', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:'0.85rem', color:'var(--text)' }}>#{ch.id}</span>
                    <button onClick={() => deleteChannel(ch.id)}
                      style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'8px', padding:'4px 10px', cursor:'pointer', color:'#f87171', fontSize:'0.75rem', fontFamily:'var(--font)' }}>
                      🗑 Delete
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:'8px' }}>
                <input type="text" value={newChannelName} onChange={e => setNewChannelName(e.target.value.toLowerCase().replace(/\s+/g,'-'))}
                  placeholder="new-channel-name" onKeyDown={e => e.key==='Enter'&&createChannel()}
                  style={{ flex:1, background:'var(--bg)', border:`1px solid ${theme['--accent']}44`, borderRadius:'10px', padding:'9px 14px', color:'var(--text)', fontSize:'0.85rem', fontFamily:'var(--font)', outline:'none' }} />
                <button onClick={createChannel}
                  style={{ background:`linear-gradient(135deg, var(--accent), var(--accent2))`, border:'none', borderRadius:'10px', padding:'9px 18px', color:'white', fontSize:'0.85rem', fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                  + Create
                </button>
              </div>
            </div>
          )}

          {/* SYSTEM */}
          {activeTab === 'system' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              {/* MOTD */}
              <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'14px', padding:'14px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
                  <div>
                    <div style={{ fontSize:'0.88rem', fontWeight:600, color:'var(--text)' }}>📣 Message of the Day</div>
                    <div style={{ fontSize:'0.7rem', color:'var(--text3)' }}>Banner shown at top of chat for everyone</div>
                  </div>
                  <div onClick={() => saveConfig('motd', { enabled:!motdEnabled, text:motdText })}
                    style={{ width:'42px', height:'24px', borderRadius:'12px', cursor:'pointer', background:motdEnabled?'var(--accent)':'rgba(255,255,255,0.1)', position:'relative', flexShrink:0 }}>
                    <div style={{ position:'absolute', top:'3px', left:motdEnabled?'21px':'3px', width:'18px', height:'18px', borderRadius:'50%', background:'white', transition:'left 0.2s' }} />
                  </div>
                </div>
                <div style={{ display:'flex', gap:'8px' }}>
                  <input type="text" value={motdText} onChange={e => setMotdText(e.target.value)} placeholder="Enter MOTD..."
                    style={{ flex:1, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'8px 12px', color:'var(--text)', fontSize:'0.82rem', fontFamily:'var(--font)', outline:'none' }} />
                  <button onClick={() => { saveConfig('motd', { enabled:motdEnabled, text:motdText }); showToast('MOTD saved!'); }}
                    style={{ background:`${theme['--accent']}22`, border:`1px solid ${theme['--accent']}44`, borderRadius:'10px', padding:'8px 14px', color:'var(--accent2)', fontSize:'0.78rem', cursor:'pointer', fontFamily:'var(--font)' }}>Save</button>
                </div>
              </div>
              {/* Patch Notes */}
              <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'14px', padding:'14px' }}>
                <div style={{ fontSize:'0.88rem', fontWeight:600, color:'var(--text)', marginBottom:'4px' }}>📝 Add Patch Notes</div>
                <div style={{ fontSize:'0.7rem', color:'var(--text3)', marginBottom:'10px' }}>Adds a new entry to the patch history visible in Settings → Patch Notes. Also triggers the first launch popup.</div>
                <input type="text" value={patchVersion} onChange={e => setPatchVersion(e.target.value)} placeholder="Version e.g. 1.0.7"
                  style={{ width:'100%', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'8px 12px', color:'var(--text)', fontSize:'0.82rem', fontFamily:'var(--font)', outline:'none', marginBottom:'6px', boxSizing:'border-box' }} />
                <textarea value={patchNotes} onChange={e => setPatchNotes(e.target.value)} rows={4} placeholder="Write patch notes..."
                  style={{ width:'100%', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'8px 12px', color:'var(--text)', fontSize:'0.82rem', fontFamily:'var(--font)', outline:'none', resize:'vertical', marginBottom:'8px', boxSizing:'border-box' }} />
                <button onClick={async () => {
                  if (!patchVersion.trim() || !patchNotes.trim()) return showToast('Fill in both fields', 'error');
                  await addDoc(collection(db, 'patchHistory'), {
                    version: patchVersion.trim(),
                    notes: patchNotes.trim(),
                    createdAt: serverTimestamp(),
                  });
                  // Also update appConfig/patchNotes for the popup trigger
                  await saveConfig('patchNotes', { notes: patchNotes.trim(), version: patchVersion.trim(), updatedAt: serverTimestamp() });
                  setPatchNotes('');
                  setPatchVersion('');
                  showToast('Patch notes added!');
                }}
                  style={{ background:`linear-gradient(135deg, var(--accent), var(--accent2))`, border:'none', borderRadius:'10px', padding:'8px 18px', color:'white', fontSize:'0.82rem', fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                  + Add Entry
                </button>
              </div>
              {/* Maintenance */}
              <div style={{ background:'var(--bg)', border:`1px solid ${maintenanceMode?'rgba(251,191,36,0.3)':'var(--border)'}`, borderRadius:'14px', padding:'14px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
                  <div>
                    <div style={{ fontSize:'0.88rem', fontWeight:600, color:maintenanceMode?'#fbbf24':'var(--text)' }}>🔧 Maintenance Mode</div>
                    <div style={{ fontSize:'0.7rem', color:'var(--text3)' }}>Shows a banner to all non-owner users</div>
                  </div>
                  <div onClick={() => { const v = !maintenanceMode; saveConfig('maintenance', { enabled:v, message:maintenanceMsg }); setMaintenanceMode(v); }}
                    style={{ width:'42px', height:'24px', borderRadius:'12px', cursor:'pointer', background:maintenanceMode?'#fbbf24':'rgba(255,255,255,0.1)', position:'relative', flexShrink:0 }}>
                    <div style={{ position:'absolute', top:'3px', left:maintenanceMode?'21px':'3px', width:'18px', height:'18px', borderRadius:'50%', background:'white', transition:'left 0.2s' }} />
                  </div>
                </div>
                <input type="text" value={maintenanceMsg} onChange={e => setMaintenanceMsg(e.target.value)} placeholder="Maintenance message..."
                  style={{ width:'100%', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'8px 12px', color:'var(--text)', fontSize:'0.82rem', fontFamily:'var(--font)', outline:'none', boxSizing:'border-box' }} />
              </div>
              {/* Force version */}
              <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'14px', padding:'14px' }}>
                <div style={{ fontSize:'0.88rem', fontWeight:600, color:'var(--text)', marginBottom:'4px' }}>🔒 Force Minimum Version</div>
                <div style={{ fontSize:'0.7rem', color:'var(--text3)', marginBottom:'10px' }}>Users below this version see a lock screen. Leave blank to disable.</div>
                <div style={{ display:'flex', gap:'8px' }}>
                  <input type="text" value={minVersion} onChange={e => setMinVersion(e.target.value)} placeholder="e.g. 1.0.6"
                    style={{ flex:1, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'8px 12px', color:'var(--text)', fontSize:'0.82rem', fontFamily:'var(--font)', outline:'none' }} />
                  <button onClick={() => { saveConfig('minVersion', { version:minVersion }); showToast('Saved!'); }}
                    style={{ background:`${theme['--accent']}22`, border:`1px solid ${theme['--accent']}44`, borderRadius:'10px', padding:'8px 14px', color:'var(--accent2)', fontSize:'0.78rem', cursor:'pointer', fontFamily:'var(--font)' }}>Save</button>
                </div>
              </div>
              {/* Broadcast */}
              <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'14px', padding:'14px' }}>
                <div style={{ fontSize:'0.88rem', fontWeight:600, color:'var(--text)', marginBottom:'4px' }}>📢 Broadcast</div>
                <div style={{ fontSize:'0.7rem', color:'var(--text3)', marginBottom:'8px' }}>Sends to every channel at once</div>
                <textarea value={broadcastText} onChange={e => setBroadcastText(e.target.value)} rows={2} placeholder="Type announcement..."
                  style={{ width:'100%', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'8px 12px', color:'var(--text)', fontSize:'0.82rem', fontFamily:'var(--font)', outline:'none', resize:'none', marginBottom:'8px', boxSizing:'border-box' }} />
                <button onClick={broadcast} disabled={loading||!broadcastText.trim()}
                  style={{ background:broadcastText.trim()?`linear-gradient(135deg, var(--accent), var(--accent2))`:'rgba(255,255,255,0.06)', border:'none', borderRadius:'10px', padding:'8px 18px', color:'white', fontSize:'0.82rem', fontWeight:600, cursor:broadcastText.trim()?'pointer':'default', fontFamily:'var(--font)' }}>
                  {loading?'Sending...':'📢 Broadcast'}
                </button>
              </div>
            </div>
          )}

          {/* MOD LOG */}
          {activeTab === 'modlog' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              {modLog.length === 0 && <div style={{ fontSize:'0.82rem', color:'var(--text3)' }}>No moderation actions yet.</div>}
              {modLog.map(entry => {
                const colors = { kick:'#f87171', ban:'#ef4444', unban:'#4ade80', mute:'#fbbf24', unmute:'#4ade80', warn:'#fbbf24' };
                return (
                  <div key={entry.id} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'10px', padding:'10px 14px', display:'flex', alignItems:'center', gap:'10px' }}>
                    <span style={{ fontSize:'0.8rem', fontWeight:700, color:colors[entry.action]||'var(--text2)', minWidth:'55px', textTransform:'uppercase' }}>{entry.action}</span>
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:'0.82rem', color:'var(--text)' }}>{entry.targetName}</span>
                      {entry.reason && <span style={{ fontSize:'0.72rem', color:'var(--text3)', marginLeft:'6px' }}>— {entry.reason}</span>}
                    </div>
                    <span style={{ fontSize:'0.68rem', color:'var(--text3)' }}>{formatDateTime(entry.timestamp)}</span>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>

      {toast && (
        <div style={{ position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)', background:toast.type==='error'?'#ef4444':'#4ade80', color:'white', borderRadius:'10px', padding:'10px 20px', fontSize:'0.85rem', fontWeight:600, zIndex:1000, boxShadow:'0 8px 24px rgba(0,0,0,0.4)', animation:'fadein 0.2s ease' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
