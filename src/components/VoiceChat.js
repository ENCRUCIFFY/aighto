import { useState, useEffect, useRef } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { doc, setDoc, deleteDoc, onSnapshot, collection, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const AGORA_APP_ID = '726ba7824e134af2ac63a716848a658e';

const VOICE_CHANNELS = [
  { id: 'lounge',  name: 'Lounge'  },
  { id: 'gaming',  name: 'Gaming'  },
  { id: 'chill',   name: 'Chill'   },
];

function Avatar({ name, size = 28, photoURL, speaking }) {
  const colors = ['#7c5cfc','#c084fc','#f472b6','#fb923c','#34d399','#60a5fa'];
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length];
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <div style={{
        width:size, height:size, borderRadius:'50%',
        background: photoURL ? `url(${photoURL}) center/cover` : color,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:size*0.4, fontWeight:700, color:'white', fontFamily:'var(--font-head)',
        border: speaking ? '2px solid #4ade80' : '2px solid transparent',
        transition:'border 0.2s', boxSizing:'border-box',
      }}>
        {!photoURL && (name?.[0]?.toUpperCase() || '?')}
      </div>
      {speaking && (
        <div style={{ position:'absolute', inset:'-3px', borderRadius:'50%',
          border:'2px solid #4ade80', animation:'speaking-pulse 1s ease-in-out infinite' }} />
      )}
    </div>
  );
}

export default function VoiceChat({ user, myData, theme }) {
  const [activeChannel, setActiveChannel] = useState(null);
  const [muted, setMuted]                 = useState(false);
  const [deafened, setDeafened]           = useState(false);
  const [connecting, setConnecting]       = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState({});
  const [channelUsers, setChannelUsers]   = useState({});
  const [volumes, setVolumes]             = useState({});
  const [contextMenu, setContextMenu]     = useState(null); // { uid, name, x, y }
  const [remoteUsers, setRemoteUsers]     = useState({});

  const clientRef     = useRef(null);
  const localTrackRef = useRef(null);
  const channelRef    = useRef(null);
  const vadInterval   = useRef(null);

  // Listen to all voice channels for participant display
  useEffect(() => {
    const unsubs = VOICE_CHANNELS.map(ch => {
      return onSnapshot(collection(db, 'voiceChannels', ch.id, 'participants'), snap => {
        const users = {};
        snap.docs.forEach(d => { users[d.id] = d.data(); });
        setChannelUsers(prev => ({ ...prev, [ch.id]: users }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, []);

  // Clean up own entry on unmount / page close
  useEffect(() => {
    const cleanup = () => {
      if (channelRef.current) {
        deleteDoc(doc(db, 'voiceChannels', channelRef.current, 'participants', user.uid)).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', cleanup);
    return () => {
      window.removeEventListener('beforeunload', cleanup);
      cleanup();
      doLeave();
    };
  }, []);

  async function doLeave() {
    clearInterval(vadInterval.current);
    try { localTrackRef.current?.stop(); } catch {}
    try { localTrackRef.current?.close(); } catch {}
    try { await clientRef.current?.leave(); } catch {}
    if (channelRef.current) {
      await deleteDoc(doc(db, 'voiceChannels', channelRef.current, 'participants', user.uid)).catch(() => {});
    }
    localTrackRef.current = null;
    clientRef.current = null;
    channelRef.current = null;
  }

  async function joinChannel(channelId) {
    if (activeChannel) {
      await doLeave();
      setActiveChannel(null);
    }
    setConnecting(true);
    try {
      const client = AgoraRTC.createClient({ mode:'rtc', codec:'vp8' });
      clientRef.current = client;
      channelRef.current = channelId;

      const remoteUsersMap = {};

      client.on('user-published', async (remoteUser, mediaType) => {
        await client.subscribe(remoteUser, mediaType);
        if (mediaType === 'audio' && remoteUser.audioTrack) {
          remoteUser.audioTrack.play();
          // Apply saved volume
          const vol = volumes[remoteUser.uid] ?? 100;
          remoteUser.audioTrack.setVolume(vol);
          remoteUsersMap[remoteUser.uid] = remoteUser;
          setRemoteUsers({ ...remoteUsersMap });
        }
      });

      client.on('user-unpublished', (remoteUser) => {
        remoteUser.audioTrack?.stop();
      });

      client.on('user-left', async (remoteUser) => {
        // Remove from remote users map
        delete remoteUsersMap[remoteUser.uid];
        setRemoteUsers({ ...remoteUsersMap });
        setSpeakingUsers(prev => { const n = {...prev}; delete n[remoteUser.uid]; return n; });
        // Clean up their Firebase entry in case it wasn't removed
        await deleteDoc(doc(db, 'voiceChannels', channelId, 'participants', String(remoteUser.uid))).catch(() => {});
      });

      await client.join(AGORA_APP_ID, channelId, null, null);

      const localTrack = await AgoraRTC.createMicrophoneAudioTrack({ AEC:true, ANS:true, AGC:true });
      localTrackRef.current = localTrack;
      await client.publish(localTrack);

      // VAD — speaking detection
      vadInterval.current = setInterval(async () => {
        if (!localTrackRef.current || channelRef.current !== channelId) return;
        const level = localTrackRef.current.getVolumeLevel?.() || 0;
        const isSpeaking = level > 0.05;
        setSpeakingUsers(prev => {
          if (prev[user.uid] === isSpeaking) return prev;
          return { ...prev, [user.uid]: isSpeaking };
        });
        await setDoc(doc(db, 'voiceChannels', channelId, 'participants', user.uid),
          { speaking: isSpeaking }, { merge: true }).catch(() => {});
      }, 200);

      // Register presence
      await setDoc(doc(db, 'voiceChannels', channelId, 'participants', user.uid), {
        uid: user.uid,
        username: user.displayName || user.email,
        photoURL: myData.photoURL || null,
        muted: false,
        speaking: false,
        joinedAt: serverTimestamp(),
      });

      setActiveChannel(channelId);
      setConnecting(false);
      setMuted(false);
      setDeafened(false);
    } catch (err) {
      console.error('Voice join error:', err);
      setConnecting(false);
      channelRef.current = null;
      alert('Could not join voice: ' + err.message);
    }
  }

  async function leaveChannel() {
    const ch = activeChannel;
    setActiveChannel(null);
    setMuted(false);
    setDeafened(false);
    setSpeakingUsers({});
    setRemoteUsers({});
    await doLeave();
  }

  function toggleMute() {
    if (!localTrackRef.current) return;
    const newMuted = !muted;
    localTrackRef.current.setEnabled(!newMuted);
    setMuted(newMuted);
    setDoc(doc(db, 'voiceChannels', activeChannel, 'participants', user.uid), { muted: newMuted }, { merge: true });
  }

  function toggleDeafen() {
    const newDeafened = !deafened;
    setDeafened(newDeafened);
    if (newDeafened) {
      localTrackRef.current?.setEnabled(false);
      setMuted(true);
      setDoc(doc(db, 'voiceChannels', activeChannel, 'participants', user.uid), { muted: true }, { merge: true });
      Object.values(remoteUsers).forEach(u => u.audioTrack?.setVolume(0));
    } else {
      localTrackRef.current?.setEnabled(true);
      setMuted(false);
      setDoc(doc(db, 'voiceChannels', activeChannel, 'participants', user.uid), { muted: false }, { merge: true });
      Object.values(remoteUsers).forEach(u => {
        const vol = volumes[u.uid] ?? 100;
        u.audioTrack?.setVolume(vol);
      });
    }
  }

  function setUserVolume(uid, vol) {
    setVolumes(prev => ({ ...prev, [uid]: vol }));
    if (!deafened && remoteUsers[uid]?.audioTrack) {
      remoteUsers[uid].audioTrack.setVolume(vol);
    }
  }

  return (
    <div>
      <div style={{ fontSize:'0.63rem', fontWeight:700, color:'var(--text3)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'5px', paddingLeft:'8px' }}>
        Voice Channels
      </div>

      {VOICE_CHANNELS.map(ch => {
        const chUsers = channelUsers[ch.id] || {};
        const userList = Object.values(chUsers);
        const isActive = activeChannel === ch.id;
        return (
          <div key={ch.id}>
            <button onClick={() => isActive ? leaveChannel() : joinChannel(ch.id)}
              disabled={connecting}
              style={{ width:'100%', background: isActive ? `${theme['--accent']}22` : 'transparent',
                border:'none', borderRadius:'8px', padding:'7px 10px', display:'flex', alignItems:'center',
                gap:'8px', cursor: connecting ? 'wait' : 'pointer', transition:'background 0.15s', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <span style={{ fontSize:'0.82rem', color: isActive ? '#4ade80' : 'var(--text3)' }}>🔊</span>
                <span style={{ fontSize:'0.82rem', fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--text)' : 'var(--text2)' }}>{ch.name}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                {userList.length > 0 && <span style={{ fontSize:'0.65rem', color:'var(--text3)' }}>{userList.length}</span>}
                {isActive && <span style={{ fontSize:'0.65rem', color:'#4ade80', fontWeight:700 }}>●</span>}
              </div>
            </button>

            {userList.length > 0 && (
              <div style={{ paddingLeft:'28px', marginBottom:'4px' }}>
                {userList.map(p => (
                  <div key={p.uid}
                    onContextMenu={e => {
                      if (p.uid === user.uid) return;
                      e.preventDefault();
                      setContextMenu({ uid: p.uid, name: p.username, x: e.clientX, y: e.clientY });
                    }}
                    style={{ display:'flex', alignItems:'center', gap:'6px', padding:'3px 6px', borderRadius:'6px',
                      cursor: p.uid !== user.uid ? 'context-menu' : 'default' }}>
                    <Avatar name={p.username} size={18} photoURL={p.photoURL}
                      speaking={speakingUsers[p.uid] || p.speaking} />
                    <span style={{ fontSize:'0.72rem', color: p.muted ? 'var(--text3)' : 'var(--text2)',
                      flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {p.username}
                    </span>
                    {p.muted && <span style={{ fontSize:'0.6rem' }}>🔇</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {activeChannel && (
        <div style={{ margin:'8px 6px 0', padding:'8px 10px',
          background:`${theme['--accent']}14`, border:`1px solid ${theme['--accent']}33`, borderRadius:'10px' }}>
          <div style={{ fontSize:'0.68rem', color:'#4ade80', fontWeight:600, marginBottom:'8px', display:'flex', alignItems:'center', gap:'5px' }}>
            <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#4ade80', display:'inline-block', animation:'speaking-pulse 1.5s ease-in-out infinite' }} />
            {VOICE_CHANNELS.find(c => c.id === activeChannel)?.name}
          </div>
          <div style={{ display:'flex', gap:'6px' }}>
            <button onClick={toggleMute}
              style={{ flex:1, padding:'6px', borderRadius:'8px', border:'none', cursor:'pointer',
                background: muted ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)',
                color: muted ? '#f87171' : 'var(--text2)', fontSize:'0.72rem', fontFamily:'var(--font)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:'4px' }}>
              {muted ? '🔇' : '🎙️'} {muted ? 'Unmute' : 'Mute'}
            </button>
            <button onClick={toggleDeafen}
              style={{ flex:1, padding:'6px', borderRadius:'8px', border:'none', cursor:'pointer',
                background: deafened ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)',
                color: deafened ? '#f87171' : 'var(--text2)', fontSize:'0.72rem', fontFamily:'var(--font)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:'4px' }}>
              {deafened ? '🔕' : '🔔'} {deafened ? 'Undeafen' : 'Deafen'}
            </button>
            <button onClick={leaveChannel}
              style={{ padding:'6px 10px', borderRadius:'8px', border:'none', cursor:'pointer',
                background:'rgba(239,68,68,0.2)', color:'#f87171', fontSize:'0.72rem',
                fontFamily:'var(--font)', fontWeight:600 }}>
              Leave
            </button>
          </div>
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <div onClick={() => setContextMenu(null)}
          style={{ position:'fixed', inset:0, zIndex:998 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position:'fixed', left: contextMenu.x, top: contextMenu.y,
              background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'12px',
              padding:'12px 14px', zIndex:999, boxShadow:'0 8px 30px rgba(0,0,0,0.5)',
              minWidth:'180px' }}>
            <div style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--text)', marginBottom:'10px' }}>
              🔊 {contextMenu.name}
            </div>
            <div style={{ fontSize:'0.68rem', color:'var(--text3)', marginBottom:'6px' }}>Volume</div>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <input type="range" min={0} max={200} value={volumes[contextMenu.uid] ?? 100}
                onChange={e => setUserVolume(contextMenu.uid, parseInt(e.target.value))}
                style={{ flex:1, accentColor:'var(--accent)', cursor:'pointer' }} />
              <span style={{ fontSize:'0.72rem', color:'var(--accent2)', minWidth:'36px', textAlign:'right' }}>
                {volumes[contextMenu.uid] ?? 100}%
              </span>
            </div>
            <button onClick={() => setContextMenu(null)}
              style={{ marginTop:'10px', width:'100%', background:`${theme['--accent']}22`,
                border:`1px solid ${theme['--accent']}44`, borderRadius:'8px', padding:'6px',
                color:'var(--accent2)', fontSize:'0.75rem', cursor:'pointer', fontFamily:'var(--font)' }}>
              Done
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes speaking-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
