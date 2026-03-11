import { useState, useEffect, useRef } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc,
  serverTimestamp, doc, setDoc, getDoc, updateDoc,
  where, deleteDoc, arrayUnion, arrayRemove
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import Settings from './Settings';

const CHANNELS = [
  { id: 'general', name: 'general', icon: '💬' },
  { id: 'random',  name: 'random',  icon: '🎲' },
  { id: 'gaming',  name: 'gaming',  icon: '🎮' },
  { id: 'music',   name: 'music',   icon: '🎵' },
];

const STATUSES = [
  { value: 'online',  label: '● Online',    color: '#4ade80' },
  { value: 'away',    label: '◐ Away',      color: '#fbbf24' },
  { value: 'busy',    label: '⊘ Busy',      color: '#f87171' },
  { value: 'offline', label: '○ Invisible', color: '#6b7280' },
];

const REACTIONS = ['👍','❤️','😂','🔥','😮','😢','🎉','💯'];

const THEMES = {
  purple: {
    name: '🟣 Purple',
    '--bg':      '#0e0c1a', '--bg2': '#13111f', '--bg3': '#1a1728',
    '--accent':  '#7c5cfc', '--accent2': '#c084fc',
    '--border':  'rgba(255,255,255,0.07)',
    '--text':    '#f0eeff', '--text2': 'rgba(200,190,240,0.6)', '--text3': 'rgba(200,190,240,0.35)',
  },
  black: {
    name: '⚫ Pure Black',
    '--bg':      '#000000', '--bg2': '#0a0a0a', '--bg3': '#111111',
    '--accent':  '#ffffff', '--accent2': '#aaaaaa',
    '--border':  'rgba(255,255,255,0.08)',
    '--text':    '#ffffff', '--text2': 'rgba(255,255,255,0.55)', '--text3': 'rgba(255,255,255,0.25)',
  },
  red: {
    name: '🔴 Red Dark',
    '--bg':      '#0f0808', '--bg2': '#150c0c', '--bg3': '#1e1010',
    '--accent':  '#ef4444', '--accent2': '#f87171',
    '--border':  'rgba(239,68,68,0.12)',
    '--text':    '#fff0f0', '--text2': 'rgba(240,180,180,0.6)', '--text3': 'rgba(240,180,180,0.3)',
  },
  pink: {
    name: '🌸 Soft Pink',
    '--bg':      '#120a10', '--bg2': '#1a0f18', '--bg3': '#241520',
    '--accent':  '#ec4899', '--accent2': '#f9a8d4',
    '--border':  'rgba(236,72,153,0.12)',
    '--text':    '#fff0f8', '--text2': 'rgba(240,180,220,0.65)', '--text3': 'rgba(240,180,220,0.3)',
  },
  ocean: {
    name: '🔵 Ocean Blue',
    '--bg':      '#060d1a', '--bg2': '#0a1525', '--bg3': '#0f1e33',
    '--accent':  '#3b82f6', '--accent2': '#60a5fa',
    '--border':  'rgba(59,130,246,0.12)',
    '--text':    '#f0f6ff', '--text2': 'rgba(180,210,255,0.6)', '--text3': 'rgba(180,210,255,0.3)',
  },
};

const EMOJI_LIST = [
  '😀','😂','😍','🥰','😎','🤔','😅','😭','😤','🥳',
  '👍','👎','❤️','🔥','💯','✨','🎉','🙌','👀','💀',
  '😊','😇','🤣','😋','😘','🤗','😏','😒','🙄','😬',
  '🐶','🐱','🐸','🦊','🐼','🦁','🐯','🦋','🌸','🌈',
  '🍕','🍔','🍣','🍜','🍩','🎮','🎵','🎬','⚽','🏀',
  '💎','🚀','🌙','⭐','💫','🎯','💡','🔑','🎸','🏆',
];

function getDmId(uid1, uid2) { return [uid1, uid2].sort().join('_'); }

function applyTheme(theme) {
  const root = document.documentElement;
  Object.entries(theme).forEach(([k, v]) => {
    if (k.startsWith('--')) root.style.setProperty(k, v);
  });
}

function Avatar({ name, size = 32, status, photoURL }) {
  const colors = ['#7c5cfc','#c084fc','#f472b6','#fb923c','#34d399','#60a5fa'];
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length];
  const statusColor = { online: '#4ade80', away: '#fbbf24', busy: '#f87171', offline: '#6b7280' };
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {photoURL ? (
        <img src={photoURL} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: size, height: size, borderRadius: '50%', background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.4, fontWeight: 700, color: 'white', fontFamily: 'var(--font-head)' }}>
          {name?.[0]?.toUpperCase() || '?'}
        </div>
      )}
      {status && (
        <div style={{ position: 'absolute', bottom: 0, right: 0,
          width: size * 0.32, height: size * 0.32, borderRadius: '50%',
          background: statusColor[status] || '#6b7280', border: '2px solid var(--bg2)' }} />
      )}
    </div>
  );
}

export default function Chat({ user }) {
  const [activeChannel, setActiveChannel]   = useState('general');
  const [activeDM, setActiveDM]             = useState(null);
  const [view, setView]                     = useState('channel');
  const [messages, setMessages]             = useState([]);
  const [input, setInput]                   = useState('');
  const [users, setUsers]                   = useState([]);
  const [dmList, setDmList]                 = useState([]);
  const [searchUser, setSearchUser]         = useState('');
  const [searchResults, setSearchResults]   = useState([]);
  const [replyTo, setReplyTo]               = useState(null);
  const [hoveredMsg, setHoveredMsg]         = useState(null);
  const [editingMsg, setEditingMsg]         = useState(null);
  const [editText, setEditText]             = useState('');
  const [profileUser, setProfileUser]       = useState(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [myStatus, setMyStatus]             = useState('online');
  const [myData, setMyData]                 = useState({});
  const [friends, setFriends]               = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [unread, setUnread]                 = useState({});
  const [typingUsers, setTypingUsers]       = useState([]);
  const [showReactionPicker, setShowReactionPicker] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker]       = useState(false);
  const [activeTheme, setActiveTheme]       = useState('purple');
  const [showThemeMenu, setShowThemeMenu]   = useState(false);
  const [showSettings, setShowSettings]     = useState(false);
  const [updateStatus, setUpdateStatus]     = useState(null); // null | 'available' | 'downloaded'
  const [editBio, setEditBio]               = useState('');
  const [editCustomStatus, setEditCustomStatus] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const typingTimeout  = useRef(null);


  // Apply theme on mount + change
  useEffect(() => {
    const saved = localStorage.getItem('aighto_theme') || 'purple';
    setActiveTheme(saved);
    applyTheme(THEMES[saved]);
  }, []);

  // Auto updater listeners
  useEffect(() => {
    window.electron?.onUpdateAvailable?.(() => setUpdateStatus('available'));
    window.electron?.onUpdateDownloaded?.(() => setUpdateStatus('downloaded'));
  }, []);

  // Mark online
  useEffect(() => {
    setDoc(doc(db, 'users', user.uid), {
      online: true, status: 'online', lastSeen: serverTimestamp(),
      uid: user.uid, username: user.displayName, email: user.email,
    }, { merge: true });
    return () => {
      setDoc(doc(db, 'users', user.uid), { online: false, status: 'offline', lastSeen: serverTimestamp() }, { merge: true });
    };
  }, [user.uid]);

  // My data
  useEffect(() => {
    return onSnapshot(doc(db, 'users', user.uid), snap => {
      const data = snap.data() || {};
      setFriends(data.friends || []);
      setFriendRequests(data.friendRequests || []);
      setMyStatus(data.status || 'online');
      setMyData(data);
    });
  }, [user.uid]);

  // All users
  useEffect(() => {
    return onSnapshot(collection(db, 'users'), snap => {
      setUsers(snap.docs.map(d => d.data()).filter(u => u.uid !== user.uid));
    });
  }, [user.uid]);

  // Messages
  useEffect(() => {
    let col;
    if (view === 'channel') col = collection(db, 'channels', activeChannel, 'messages');
    else if (activeDM) col = collection(db, 'dms', getDmId(user.uid, activeDM.uid), 'messages');
    else return;
    const q = query(col, orderBy('createdAt'));
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [view, activeChannel, activeDM, user.uid]);

  // Unread
  useEffect(() => {
    const unsubs = CHANNELS.map(ch => {
      const q = query(collection(db, 'channels', ch.id, 'messages'), orderBy('createdAt'));
      return onSnapshot(q, snap => {
        if (view === 'channel' && activeChannel === ch.id) return;
        const msgs = snap.docs.map(d => d.data());
        const lastRead = parseInt(localStorage.getItem(`lastRead_${ch.id}`) || '0');
        const count = msgs.filter(m => m.createdAt?.toMillis?.() > lastRead && m.uid !== user.uid).length;
        setUnread(prev => ({ ...prev, [ch.id]: count }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, [view, activeChannel, user.uid]);

  // DM list
  useEffect(() => {
    const q = query(collection(db, 'dms'), where('members', 'array-contains', user.uid));
    return onSnapshot(q, async snap => {
      const list = await Promise.all(snap.docs.map(async d => {
        const data = d.data();
        const otherId = data.members.find(m => m !== user.uid);
        try {
          const otherDoc = await getDoc(doc(db, 'users', otherId));
          return { dmId: d.id, ...otherDoc.data() };
        } catch { return null; }
      }));
      setDmList(list.filter(Boolean));
    });
  }, [user.uid]);

  // Typing
  useEffect(() => {
    const key = view === 'channel' ? activeChannel : (activeDM ? getDmId(user.uid, activeDM.uid) : null);
    if (!key) return;
    return onSnapshot(doc(db, 'typing', key), snap => {
      const data = snap.data() || {};
      setTypingUsers(Object.entries(data)
        .filter(([uid, val]) => uid !== user.uid && val === true)
        .map(([uid]) => users.find(u => u.uid === uid)?.username)
        .filter(Boolean));
    });
  }, [view, activeChannel, activeDM, user.uid, users]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function markRead(channelId) {
    localStorage.setItem(`lastRead_${channelId}`, Date.now().toString());
    setUnread(prev => ({ ...prev, [channelId]: 0 }));
  }

  function switchTheme(themeKey) {
    setActiveTheme(themeKey);
    localStorage.setItem('aighto_theme', themeKey);
    applyTheme(THEMES[themeKey]);
    setShowThemeMenu(false);
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input.trim();
    setInput(''); setReplyTo(null); clearTyping();
    const msg = {
      text, uid: user.uid,
      username: user.displayName || user.email,
      photoURL: myData.photoURL || null,
      createdAt: serverTimestamp(),
      reactions: {},
      edited: false,
      ...(replyTo ? { replyTo: { id: replyTo.id, text: replyTo.text, username: replyTo.username } } : {}),
    };
    if (view === 'channel') {
      await addDoc(collection(db, 'channels', activeChannel, 'messages'), msg);
    } else if (activeDM) {
      const dmId = getDmId(user.uid, activeDM.uid);
      await setDoc(doc(db, 'dms', dmId), { members: [user.uid, activeDM.uid], updatedAt: serverTimestamp() }, { merge: true });
      await addDoc(collection(db, 'dms', dmId, 'messages'), msg);
    }
  }

  async function saveEdit(msg) {
    if (!editText.trim()) return;
    const ref = view === 'channel'
      ? doc(db, 'channels', activeChannel, 'messages', msg.id)
      : doc(db, 'dms', getDmId(user.uid, activeDM.uid), 'messages', msg.id);
    await updateDoc(ref, { text: editText.trim(), edited: true });
    setEditingMsg(null); setEditText('');
  }

  async function deleteMessage(msg) {
    if (msg.uid !== user.uid) return;
    if (view === 'channel') await deleteDoc(doc(db, 'channels', activeChannel, 'messages', msg.id));
    else if (activeDM) await deleteDoc(doc(db, 'dms', getDmId(user.uid, activeDM.uid), 'messages', msg.id));
  }

  async function addReaction(msg, emoji) {
    setShowReactionPicker(null);
    const ref = view === 'channel'
      ? doc(db, 'channels', activeChannel, 'messages', msg.id)
      : doc(db, 'dms', getDmId(user.uid, activeDM.uid), 'messages', msg.id);
    const current = msg.reactions?.[emoji] || [];
    await updateDoc(ref, {
      [`reactions.${emoji}`]: current.includes(user.uid) ? arrayRemove(user.uid) : arrayUnion(user.uid),
    });
  }

  async function handleTyping() {
    const key = view === 'channel' ? activeChannel : getDmId(user.uid, activeDM?.uid);
    if (!key) return;
    await setDoc(doc(db, 'typing', key), { [user.uid]: true }, { merge: true });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(clearTyping, 2000);
  }

  async function clearTyping() {
    const key = view === 'channel' ? activeChannel : getDmId(user.uid, activeDM?.uid);
    if (!key) return;
    await setDoc(doc(db, 'typing', key), { [user.uid]: false }, { merge: true });
  }

  async function sendFriendRequest(targetUid) {
    await updateDoc(doc(db, 'users', targetUid), { friendRequests: arrayUnion(user.uid) });
  }

  async function acceptFriend(uid) {
    await updateDoc(doc(db, 'users', user.uid), { friends: arrayUnion(uid), friendRequests: arrayRemove(uid) });
    await updateDoc(doc(db, 'users', uid), { friends: arrayUnion(user.uid) });
  }

  async function declineFriend(uid) {
    await updateDoc(doc(db, 'users', user.uid), { friendRequests: arrayRemove(uid) });
  }

  async function removeFriend(uid) {
    await updateDoc(doc(db, 'users', user.uid), { friends: arrayRemove(uid) });
    await updateDoc(doc(db, 'users', uid), { friends: arrayRemove(user.uid) });
  }

  async function changeStatus(status) {
    setMyStatus(status); setShowStatusMenu(false);
    await updateDoc(doc(db, 'users', user.uid), { status, online: status !== 'offline' });
  }



  async function openDM(u) {
    setActiveDM(u); setView('dm');
    setSearchUser(''); setSearchResults([]); setProfileUser(null);
  }

  function handleSearch(val) {
    setSearchUser(val);
    if (!val.trim()) { setSearchResults([]); return; }
    setSearchResults(users.filter(u => u.username?.toLowerCase().includes(val.toLowerCase())));
  }

  const isFriend = uid => friends.includes(uid);
  const hasPendingRequest = uid => users.find(u => u.uid === uid)?.friendRequests?.includes(user.uid);
  const chatTitle = view === 'channel' ? `# ${activeChannel}` : `@ ${activeDM?.username}`;
  const statusInfo = STATUSES.find(s => s.value === myStatus) || STATUSES[0];
  const theme = THEMES[activeTheme];

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: 'var(--font)' }}
      onClick={() => { setShowStatusMenu(false); setShowReactionPicker(null); setShowEmojiPicker(false); setShowThemeMenu(false); }}>

      {/* TITLE BAR */}
      <div style={{ height: '38px', background: 'var(--bg)', WebkitAppRegion: 'drag',
        display: 'flex', alignItems: 'center', paddingLeft: '16px', flexShrink: 0,
        borderBottom: '1px solid var(--border)', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-head)', fontSize: '0.82rem', fontWeight: 700,
          color: theme['--accent'] }}>Aighto</span>
        <div style={{ display: 'flex', WebkitAppRegion: 'no-drag' }}>
          {[{label:'─',action:'minimize',hov:'rgba(255,255,255,0.1)'},{label:'⬜',action:'maximize',hov:'rgba(255,255,255,0.1)'},{label:'✕',action:'close',hov:'#e74c3c'}].map(btn => (
            <button key={btn.action} onClick={() => window.electron?.[btn.action]()}
              onMouseEnter={e => e.currentTarget.style.background = btn.hov}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', width: '46px', height: '38px',
                color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', display: 'flex', alignItems: 'center',
                justifyContent: 'center', transition: 'background 0.15s', fontFamily: 'var(--font)' }}>
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* UPDATE BANNER */}
      {updateStatus === 'downloaded' && (
        <div style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent2))', padding: '8px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: '0.8rem', color: 'white', fontWeight: 500 }}>
            ✨ A new version of Aighto is ready!
          </span>
          <button onClick={() => window.electron?.installUpdate()}
            style={{ background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: '8px', padding: '4px 14px', color: 'white', fontSize: '0.78rem',
              fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
            Restart & Update
          </button>
        </div>
      )}
      {updateStatus === 'available' && (
        <div style={{ background: 'rgba(124,92,252,0.15)', borderBottom: '1px solid rgba(124,92,252,0.25)', padding: '6px 16px', flexShrink: 0 }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--accent2)' }}>⬇️ Downloading update in the background...</span>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* SIDEBAR */}
        <div style={{ width: '220px', flexShrink: 0, background: 'var(--bg2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Channels */}
          <div style={{ padding: '12px 10px 6px' }}>
            <div style={{ fontSize: '0.63rem', fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '5px', paddingLeft: '8px' }}>Channels</div>
            {CHANNELS.map(ch => (
              <button key={ch.id} onClick={() => { setActiveChannel(ch.id); setView('channel'); setActiveDM(null); markRead(ch.id); }}
                style={{ width: '100%', background: view === 'channel' && activeChannel === ch.id ? `${theme['--accent']}22` : 'transparent',
                  border: 'none', borderRadius: '8px', padding: '7px 10px', display: 'flex', alignItems: 'center',
                  gap: '8px', cursor: 'pointer', transition: 'background 0.15s', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.82rem' }}>{ch.icon}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: view === 'channel' && activeChannel === ch.id ? 600 : 400,
                    color: view === 'channel' && activeChannel === ch.id ? 'var(--text)' : 'var(--text2)' }}>{ch.name}</span>
                </div>
                {unread[ch.id] > 0 && (
                  <div style={{ background: 'var(--accent)', borderRadius: '10px', minWidth: '18px', height: '18px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'white', padding: '0 4px' }}>
                    {unread[ch.id]}
                  </div>
                )}
              </button>
            ))}
          </div>

          <div style={{ height: '1px', background: 'var(--border)', margin: '4px 10px' }} />

          {/* Friend requests */}
          {friendRequests.length > 0 && (
            <div style={{ padding: '6px 10px' }}>
              <div style={{ fontSize: '0.63rem', fontWeight: 700, color: '#fbbf24', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '5px', paddingLeft: '8px' }}>
                Requests ({friendRequests.length})
              </div>
              {friendRequests.map(uid => {
                const req = users.find(u => u.uid === uid);
                if (!req) return null;
                return (
                  <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 6px', background: 'rgba(251,191,36,0.08)', borderRadius: '8px', marginBottom: '3px' }}>
                    <Avatar name={req.username} size={22} photoURL={req.photoURL} />
                    <span style={{ fontSize: '0.74rem', color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.username}</span>
                    <button onClick={() => acceptFriend(uid)} style={{ background: '#4ade80', border: 'none', borderRadius: '5px', color: 'white', fontSize: '0.62rem', padding: '2px 5px', cursor: 'pointer', fontWeight: 700 }}>✓</button>
                    <button onClick={() => declineFriend(uid)} style={{ background: 'var(--danger)', border: 'none', borderRadius: '5px', color: 'white', fontSize: '0.62rem', padding: '2px 5px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
                  </div>
                );
              })}
              <div style={{ height: '1px', background: 'var(--border)', margin: '5px 0' }} />
            </div>
          )}

          {/* DMs */}
          <div style={{ padding: '6px 10px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '0.63rem', fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '5px', paddingLeft: '8px' }}>Direct Messages</div>
            <input type="text" placeholder="Find a user..." value={searchUser} onChange={e => handleSearch(e.target.value)}
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '8px',
                padding: '7px 10px', color: 'var(--text)', fontSize: '0.78rem', fontFamily: 'var(--font)', outline: 'none', width: '100%', marginBottom: '6px' }} />

            {searchResults.length > 0 && (
              <div style={{ marginBottom: '6px' }}>
                {searchResults.map(u => (
                  <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 8px', background: 'var(--bg3)', borderRadius: '8px', marginBottom: '3px' }}>
                    <Avatar name={u.username} size={22} status={u.status || (u.online ? 'online' : 'offline')} photoURL={u.photoURL} />
                    <span style={{ fontSize: '0.76rem', color: 'var(--text)', flex: 1 }}>{u.username}</span>
                    <button onClick={() => openDM(u)} style={{ background: 'var(--accent)', border: 'none', borderRadius: '5px', color: 'white', fontSize: '0.62rem', padding: '2px 6px', cursor: 'pointer' }}>DM</button>
                    {!isFriend(u.uid) && !hasPendingRequest(u.uid) && (
                      <button onClick={() => sendFriendRequest(u.uid)} style={{ background: `${theme['--accent']}33`, border: `1px solid ${theme['--accent']}55`, borderRadius: '5px', color: 'var(--accent2)', fontSize: '0.62rem', padding: '2px 5px', cursor: 'pointer' }}>+</button>
                    )}
                    {hasPendingRequest(u.uid) && <span style={{ fontSize: '0.6rem', color: 'var(--text3)' }}>sent</span>}
                    {isFriend(u.uid) && <span style={{ fontSize: '0.6rem', color: '#4ade80' }}>✓</span>}
                  </div>
                ))}
              </div>
            )}

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {friends.length > 0 && (
                <>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text3)', paddingLeft: '6px', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Friends</div>
                  {users.filter(u => friends.includes(u.uid)).map(u => (
                    <button key={u.uid} onClick={() => openDM(u)}
                      style={{ width: '100%', background: view === 'dm' && activeDM?.uid === u.uid ? `${theme['--accent']}22` : 'transparent',
                        border: 'none', borderRadius: '8px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', transition: 'background 0.15s' }}>
                      <Avatar name={u.username} size={24} status={u.status || (u.online ? 'online' : 'offline')} photoURL={u.photoURL} />
                      <span style={{ fontSize: '0.8rem', color: view === 'dm' && activeDM?.uid === u.uid ? 'var(--text)' : 'var(--text2)', fontWeight: view === 'dm' && activeDM?.uid === u.uid ? 600 : 400 }}>{u.username}</span>
                    </button>
                  ))}
                </>
              )}
              {dmList.filter(u => !friends.includes(u.uid)).map(u => (
                <button key={u.uid} onClick={() => openDM(u)}
                  style={{ width: '100%', background: view === 'dm' && activeDM?.uid === u.uid ? `${theme['--accent']}22` : 'transparent',
                    border: 'none', borderRadius: '8px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', transition: 'background 0.15s' }}>
                  <Avatar name={u.username} size={24} status={u.status || (u.online ? 'online' : 'offline')} photoURL={u.photoURL} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>{u.username}</span>
                </button>
              ))}
            </div>
          </div>

          {/* My user bar */}
          <div style={{ padding: '10px', borderTop: '1px solid var(--border)', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <div onClick={e => { e.stopPropagation(); setShowStatusMenu(!showStatusMenu); }} style={{ cursor: 'pointer' }}>
                <Avatar name={user.displayName || user.email} size={32} status={myStatus} photoURL={myData.photoURL} />
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.displayName}</div>
                <div style={{ fontSize: '0.62rem', color: statusInfo.color, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  onClick={e => { e.stopPropagation(); setShowStatusMenu(!showStatusMenu); }}>
                  {myData.customStatus || statusInfo.label}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '2px' }}>
                <button onClick={e => { e.stopPropagation(); setShowThemeMenu(!showThemeMenu); }} title="Themes"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '0.85rem', padding: '4px' }}>🎨</button>
                <button onClick={e => { e.stopPropagation(); setEditBio(myData.bio || ''); setEditCustomStatus(myData.customStatus || ''); setShowSettings(true); }} title="Edit profile"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '0.85rem', padding: '4px' }}>⚙️</button>
                <button onClick={() => signOut(auth)} title="Sign out"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '0.85rem', padding: '4px' }}>⇥</button>
              </div>
            </div>

            {/* Status menu */}
            {showStatusMenu && (
              <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: '100%', left: '10px',
                background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '12px', padding: '6px', width: '160px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.4)', zIndex: 200 }}>
                {STATUSES.map(s => (
                  <button key={s.value} onClick={() => changeStatus(s.value)}
                    style={{ width: '100%', background: myStatus === s.value ? `${theme['--accent']}22` : 'transparent',
                      border: 'none', borderRadius: '8px', padding: '8px 10px', color: s.color,
                      fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)' }}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {/* Theme menu */}
            {showThemeMenu && (
              <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: '100%', left: '10px',
                background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '12px', padding: '6px', width: '170px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.4)', zIndex: 200 }}>
                <div style={{ fontSize: '0.62rem', color: 'var(--text3)', padding: '4px 8px 6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Theme</div>
                {Object.entries(THEMES).map(([key, t]) => (
                  <button key={key} onClick={() => switchTheme(key)}
                    style={{ width: '100%', background: activeTheme === key ? `${t['--accent']}22` : 'transparent',
                      border: 'none', borderRadius: '8px', padding: '8px 10px', color: activeTheme === key ? t['--accent'] : 'var(--text2)',
                      fontSize: '0.82rem', fontWeight: activeTheme === key ? 600 : 400, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)' }}>
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CHAT AREA */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ height: '52px', flexShrink: 0, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '10px' }}>
            {view === 'dm' && activeDM && (
              <div style={{ cursor: 'pointer' }} onClick={() => setProfileUser(users.find(u => u.uid === activeDM.uid) || activeDM)}>
                <Avatar name={activeDM.username} size={30} status={users.find(u => u.uid === activeDM.uid)?.status || 'offline'} photoURL={users.find(u => u.uid === activeDM.uid)?.photoURL} />
              </div>
            )}
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>{chatTitle}</span>
            {view === 'dm' && activeDM && (
              <span style={{ fontSize: '0.7rem', color: STATUSES.find(s => s.value === (users.find(u => u.uid === activeDM.uid)?.status || 'offline'))?.color }}>
                {STATUSES.find(s => s.value === (users.find(u => u.uid === activeDM.uid)?.status || 'offline'))?.label}
              </span>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', margin: 'auto', color: 'var(--text3)', fontSize: '0.85rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>👋</div>
                {view === 'channel' ? `Start the conversation in #${activeChannel}` : `Say hey to ${activeDM?.username}!`}
              </div>
            )}
            {messages.map((msg, i) => {
              const isMe = msg.uid === user.uid;
              const grouped = messages[i-1]?.uid === msg.uid && !msg.replyTo;
              const time = msg.createdAt?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={msg.id}
                  onMouseEnter={() => setHoveredMsg(msg.id)}
                  onMouseLeave={() => setHoveredMsg(null)}
                  style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: '8px', marginTop: grouped ? '2px' : '10px', position: 'relative', animation: 'msg-in 0.2s ease' }}>

                  <div style={{ width: '32px', flexShrink: 0, opacity: grouped ? 0 : 1, cursor: 'pointer' }}
                    onClick={() => !isMe && setProfileUser(users.find(u => u.uid === msg.uid))}>
                    {!grouped && <Avatar name={msg.username} size={32} photoURL={msg.photoURL} />}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '65%' }}>
                    {!grouped && (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '3px', paddingLeft: isMe ? 0 : '4px', paddingRight: isMe ? '4px' : 0 }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text2)', fontWeight: 600 }}>{msg.username}</span>
                        {time && <span style={{ fontSize: '0.62rem', color: 'var(--text3)' }}>{time}</span>}
                      </div>
                    )}

                    {msg.replyTo && (
                      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderLeft: `3px solid var(--accent)`,
                        borderRadius: '8px', padding: '4px 10px', marginBottom: '4px', fontSize: '0.7rem', color: 'var(--text3)', maxWidth: '100%' }}>
                        <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>{msg.replyTo.username}: </span>
                        {msg.replyTo.text.length > 60 ? msg.replyTo.text.slice(0,60)+'…' : msg.replyTo.text}
                      </div>
                    )}

                    {/* Bubble or edit input */}
                    {editingMsg?.id === msg.id ? (
                      <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                        <input value={editText} onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(msg); if (e.key === 'Escape') { setEditingMsg(null); setEditText(''); } }}
                          autoFocus
                          style={{ flex: 1, background: 'var(--bg3)', border: `1px solid var(--accent)`, borderRadius: '10px',
                            padding: '8px 12px', color: 'var(--text)', fontSize: '0.88rem', fontFamily: 'var(--font)', outline: 'none' }} />
                        <button onClick={() => saveEdit(msg)} style={{ background: 'var(--accent)', border: 'none', borderRadius: '8px', padding: '6px 10px', color: 'white', cursor: 'pointer', fontSize: '0.78rem' }}>Save</button>
                        <button onClick={() => { setEditingMsg(null); setEditText(''); }} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '8px', padding: '6px 10px', color: 'var(--text2)', cursor: 'pointer', fontSize: '0.78rem' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ background: isMe ? `linear-gradient(135deg, var(--accent), var(--accent2))` : 'var(--bg3)',
                        borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        padding: '9px 14px', fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.45,
                        border: isMe ? 'none' : '1px solid var(--border)',
                        boxShadow: isMe ? `0 2px 12px ${theme['--accent']}40` : 'none', wordBreak: 'break-word' }}>
                        {msg.text}
                        {msg.edited && <span style={{ fontSize: '0.6rem', opacity: 0.5, marginLeft: '6px' }}>(edited)</span>}
                      </div>
                    )}

                    {/* Reactions */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                        {Object.entries(msg.reactions).filter(([,uids]) => uids.length > 0).map(([emoji, uids]) => (
                          <button key={emoji} onClick={() => addReaction(msg, emoji)}
                            style={{ background: uids.includes(user.uid) ? `${theme['--accent']}33` : 'rgba(255,255,255,0.06)',
                              border: uids.includes(user.uid) ? `1px solid ${theme['--accent']}66` : '1px solid var(--border)',
                              borderRadius: '10px', padding: '2px 7px', cursor: 'pointer', fontSize: '0.78rem',
                              color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            {emoji} <span style={{ fontSize: '0.68rem', color: 'var(--text2)' }}>{uids.length}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Hover actions */}
                  {hoveredMsg === msg.id && editingMsg?.id !== msg.id && (
                    <div style={{ position: 'absolute', top: '-14px', [isMe ? 'left' : 'right']: '42px',
                      display: 'flex', gap: '3px', zIndex: 10, background: 'var(--bg3)',
                      border: '1px solid var(--border)', borderRadius: '10px', padding: '3px 5px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
                      <div style={{ position: 'relative' }}>
                        <button onClick={e => { e.stopPropagation(); setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', padding: '2px 4px', color: 'var(--text2)' }}>😊</button>
                        {showReactionPicker === msg.id && (
                          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0,
                            background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '12px',
                            padding: '6px 8px', display: 'flex', gap: '6px', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                            {REACTIONS.map(emoji => (
                              <button key={emoji} onClick={() => addReaction(msg, emoji)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '2px', borderRadius: '6px', transition: 'transform 0.1s' }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.3)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 6px', color: 'var(--text2)', fontFamily: 'var(--font)' }}>↩</button>
                      {isMe && (
                        <>
                          <button onClick={() => { setEditingMsg(msg); setEditText(msg.text); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 5px', color: 'var(--text2)', fontFamily: 'var(--font)' }}>✏️</button>
                          <button onClick={() => deleteMessage(msg)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 5px', color: '#f87171', fontFamily: 'var(--font)' }}>🗑</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {typingUsers.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', marginTop: '4px' }}>
                <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text3)', animation: `typing-dot 1.2s ${i*0.2}s ease-in-out infinite` }} />)}
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply bar */}
          {replyTo && (
            <div style={{ padding: '7px 16px', background: `${theme['--accent']}14`, borderTop: `1px solid ${theme['--accent']}33`, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--accent2)', fontWeight: 600 }}>Replying to {replyTo.username}: </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>{replyTo.text.slice(0,80)}{replyTo.text.length > 80 ? '…' : ''}</span>
              </div>
              <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '0.9rem' }}>✕</button>
            </div>
          )}

          {/* Input */}
          <form onSubmit={sendMessage} style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' }}>
            {/* Emoji picker */}
            <div style={{ position: 'relative' }}>
              <button type="button" onClick={e => { e.stopPropagation(); setShowEmojiPicker(!showEmojiPicker); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '4px', color: 'var(--text3)', flexShrink: 0 }}>
                😊
              </button>
              {showEmojiPicker && (
                <div onClick={e => e.stopPropagation()} style={{
                  position: 'absolute', bottom: '100%', left: 0,
                  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '14px',
                  padding: '10px', width: '280px', zIndex: 100, boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                  display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '4px',
                }}>
                  {EMOJI_LIST.map(emoji => (
                    <button key={emoji} type="button"
                      onClick={() => { setInput(prev => prev + emoji); setShowEmojiPicker(false); inputRef.current?.focus(); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '3px', borderRadius: '6px', transition: 'transform 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input ref={inputRef} type="text" value={input}
              onChange={e => { setInput(e.target.value); handleTyping(); }}
              onBlur={clearTyping}
              placeholder={`Message ${chatTitle}...`}
              style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '12px',
                padding: '11px 16px', color: 'var(--text)', fontSize: '0.88rem', fontFamily: 'var(--font)', outline: 'none', transition: 'border 0.2s' }}
              onFocus={e => e.target.style.borderColor = `${theme['--accent']}66`}
            />
            <button type="submit" disabled={!input.trim()}
              style={{ background: input.trim() ? `linear-gradient(135deg, var(--accent), var(--accent2))` : 'var(--bg3)',
                border: input.trim() ? 'none' : '1px solid var(--border)', borderRadius: '12px', width: '42px', height: '42px',
                cursor: input.trim() ? 'pointer' : 'default', color: 'white', fontSize: '1rem', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: input.trim() ? `0 4px 14px ${theme['--accent']}55` : 'none' }}>↑</button>
          </form>
        </div>

        {/* ONLINE PANEL */}
        <div style={{ width: '180px', flexShrink: 0, background: 'var(--bg2)', borderLeft: '1px solid var(--border)', padding: '12px 10px', overflowY: 'auto' }}>
          <div style={{ fontSize: '0.63rem', fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', paddingLeft: '6px' }}>
            Online — {users.filter(u => u.online && u.status !== 'offline').length + 1}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '4px 6px', marginBottom: '2px' }}>
            <Avatar name={user.displayName || user.email} size={26} status={myStatus} photoURL={myData.photoURL} />
            <div>
              <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text)' }}>{user.displayName} <span style={{ fontSize: '0.6rem', color: 'var(--text3)' }}>(you)</span></div>
            </div>
          </div>
          {users.filter(u => u.online && u.status !== 'offline').map(u => (
            <button key={u.uid} onClick={() => setProfileUser(u)}
              style={{ width: '100%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '7px', padding: '4px 6px', borderRadius: '8px', cursor: 'pointer', marginBottom: '2px', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = `${theme['--accent']}14`}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <Avatar name={u.username} size={26} status={u.status || 'online'} photoURL={u.photoURL} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.76rem', color: 'var(--text)', fontWeight: 500 }}>{u.username}</div>
                <div style={{ fontSize: '0.6rem', color: STATUSES.find(s => s.value === (u.status||'online'))?.color }}>{u.customStatus || STATUSES.find(s => s.value === (u.status||'online'))?.label}</div>
              </div>
            </button>
          ))}
          {users.filter(u => !u.online || u.status === 'offline').length > 0 && (
            <>
              <div style={{ fontSize: '0.63rem', fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '10px 0 5px', paddingLeft: '6px' }}>Offline</div>
              {users.filter(u => !u.online || u.status === 'offline').map(u => (
                <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '4px 6px', opacity: 0.4, marginBottom: '2px' }}>
                  <Avatar name={u.username} size={26} status="offline" photoURL={u.photoURL} />
                  <div style={{ fontSize: '0.76rem', color: 'var(--text2)' }}>{u.username}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* PROFILE MODAL */}
      {profileUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setProfileUser(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '20px', padding: '28px', width: '280px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)', animation: 'fadein 0.2s ease' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <Avatar name={profileUser.username} size={68} status={profileUser.status || (profileUser.online ? 'online' : 'offline')} photoURL={profileUser.photoURL} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>{profileUser.username}</div>
                <div style={{ fontSize: '0.73rem', color: STATUSES.find(s => s.value === (profileUser.status||'offline'))?.color, marginTop: '2px' }}>
                  {profileUser.customStatus || STATUSES.find(s => s.value === (profileUser.status||'offline'))?.label}
                </div>
                {profileUser.bio && <div style={{ fontSize: '0.78rem', color: 'var(--text2)', marginTop: '8px', lineHeight: 1.4 }}>{profileUser.bio}</div>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={() => { openDM(profileUser); setProfileUser(null); }}
                style={{ background: `linear-gradient(135deg, var(--accent), var(--accent2))`, border: 'none', borderRadius: '10px', padding: '10px', color: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                💬 Send Message
              </button>
              {!isFriend(profileUser.uid) && !hasPendingRequest(profileUser.uid) && (
                <button onClick={() => { sendFriendRequest(profileUser.uid); setProfileUser(null); }}
                  style={{ background: `${theme['--accent']}22`, border: `1px solid ${theme['--accent']}44`, borderRadius: '10px', padding: '10px', color: 'var(--accent2)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  ➕ Add Friend
                </button>
              )}
              {isFriend(profileUser.uid) && (
                <button onClick={() => { removeFriend(profileUser.uid); setProfileUser(null); }}
                  style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: '10px', padding: '10px', color: '#f87171', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  Remove Friend
                </button>
              )}
              {hasPendingRequest(profileUser.uid) && <div style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text3)', padding: '8px' }}>Friend request sent ✓</div>}
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <Settings
          user={user}
          myData={myData}
          activeTheme={activeTheme}
          switchTheme={switchTheme}
          onClose={() => setShowSettings(false)}
        />
      )}
      <style>{`
        @keyframes typing-dot {
          0%,60%,100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
