import { useState, useEffect, useRef } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { doc, setDoc, deleteDoc, onSnapshot, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const AGORA_APP_ID = '726ba7824e134af2ac63a716848a658e';

const VOICE_CHANNELS = [
  { id: 'lounge', name: 'Lounge' },
  { id: 'gaming', name: 'Gaming' },
  { id: 'chill',  name: 'Chill'  },
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
  const [activeChannel, setActiveChannel]   = useState(null);
  const [muted, setMuted]                   = useState(false);
  const [deafened, setDeafened]             = useState(false);
  const [connecting, setConnecting]         = useState(false);
  const [speakingUsers, setSpeakingUsers]   = useState({});
  const [channelUsers, setChannelUsers]     = useState({});
  const [volumes, setVolumes]               = useState({});
  const [contextMenu, setContextMenu]       = useState(null);
  const [sharing, setSharing]               = useState(false);
  const [screenSources, setScreenSources]   = useState([]);
  const [showPicker, setShowPicker]         = useState(false);
  const [remoteScreens, setRemoteScreens]   = useState({});
  const [viewingScreen, setViewingScreen]   = useState(null);
  const [screenParticipants, setScreenParticipants] = useState({});

  const clientRef        = useRef(null);
  const screenClientRef  = useRef(null);
  const localTrackRef    = useRef(null);
  const screenTrackRef   = useRef(null);
  const channelRef       = useRef(null);
  const vadInterval      = useRef(null);
  const remoteUsersRef   = useRef({});  // ref so setUserVolume always has fresh data
  const volumesRef       = useRef({});

  // Keep volumesRef in sync
  useEffect(() => { volumesRef.current = volumes; }, [volumes]);

  // Listen to all voice channels
  useEffect(() => {
    const unsubs = VOICE_CHANNELS.map(ch =>
      onSnapshot(collection(db, 'voiceChannels', ch.id, 'participants'), snap => {
        const users = {};
        snap.docs.forEach(d => { users[d.id] = d.data(); });
        setChannelUsers(prev => ({ ...prev, [ch.id]: users }));
      })
    );
    // Listen for screen share participants
    const screenUnsubs = VOICE_CHANNELS.map(ch =>
      onSnapshot(collection(db, 'voiceChannels', ch.id, 'screens'), snap => {
        const screens = {};
        snap.docs.forEach(d => { screens[d.id] = d.data(); });
        setScreenParticipants(prev => ({ ...prev, [ch.id]: screens }));
      })
    );
    return () => { unsubs.forEach(u => u()); screenUnsubs.forEach(u => u()); };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    const cleanup = () => {
      if (channelRef.current) {
        deleteDoc(doc(db, 'voiceChannels', channelRef.current, 'participants', user.uid)).catch(() => {});
        deleteDoc(doc(db, 'voiceChannels', channelRef.current, 'screens', user.uid)).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', cleanup);
    return () => { window.removeEventListener('beforeunload', cleanup); cleanup(); doLeave(); };
  }, []);

  async function doLeave() {
    clearInterval(vadInterval.current);
    try { localTrackRef.current?.stop(); localTrackRef.current?.close(); } catch {}
    try { screenTrackRef.current?.stop(); screenTrackRef.current?.close(); } catch {}
    try { await clientRef.current?.leave(); } catch {}
    try { await screenClientRef.current?.leave(); } catch {}
    if (channelRef.current) {
      await deleteDoc(doc(db, 'voiceChannels', channelRef.current, 'participants', user.uid)).catch(() => {});
      await deleteDoc(doc(db, 'voiceChannels', channelRef.current, 'screens', user.uid)).catch(() => {});
    }
    localTrackRef.current = null;
    screenTrackRef.current = null;
    clientRef.current = null;
    screenClientRef.current = null;
    channelRef.current = null;
    remoteUsersRef.current = {};
  }

  async function joinChannel(channelId) {
    if (activeChannel) { await doLeave(); setActiveChannel(null); }
    setConnecting(true);
    try {
      const client = AgoraRTC.createClient({ mode:'rtc', codec:'vp8' });
      clientRef.current = client;
      channelRef.current = channelId;

      client.on('user-published', async (remoteUser, mediaType) => {
        await client.subscribe(remoteUser, mediaType);
        if (mediaType === 'audio' && remoteUser.audioTrack) {
          remoteUser.audioTrack.play();
          const vol = volumesRef.current[remoteUser.uid] ?? 100;
          remoteUser.audioTrack.setVolume(vol);
          remoteUsersRef.current[remoteUser.uid] = remoteUser;
        }
        if (mediaType === 'video' && remoteUser.videoTrack) {
          setRemoteScreens(prev => ({ ...prev, [remoteUser.uid]: remoteUser.videoTrack }));
        }
      });

      client.on('user-unpublished', (remoteUser, mediaType) => {
        if (mediaType === 'audio') remoteUser.audioTrack?.stop();
        if (mediaType === 'video') {
          setRemoteScreens(prev => { const n = {...prev}; delete n[remoteUser.uid]; return n; });
          setViewingScreen(v => v === remoteUser.uid ? null : v);
        }
      });

      client.on('user-left', async (remoteUser) => {
        delete remoteUsersRef.current[remoteUser.uid];
        setSpeakingUsers(prev => { const n = {...prev}; delete n[remoteUser.uid]; return n; });
        setRemoteScreens(prev => { const n = {...prev}; delete n[remoteUser.uid]; return n; });
        setViewingScreen(v => v === remoteUser.uid ? null : v);
        await deleteDoc(doc(db, 'voiceChannels', channelId, 'participants', String(remoteUser.uid))).catch(() => {});
        await deleteDoc(doc(db, 'voiceChannels', channelId, 'screens', String(remoteUser.uid))).catch(() => {});
      });

      await client.join(AGORA_APP_ID, channelId, null, null);

      const localTrack = await AgoraRTC.createMicrophoneAudioTrack({ AEC:true, ANS:true, AGC:true });
      localTrackRef.current = localTrack;
      await client.publish(localTrack);

      // VAD
      vadInterval.current = setInterval(async () => {
        if (!localTrackRef.current || channelRef.current !== channelId) return;
        const level = localTrackRef.current.getVolumeLevel?.() || 0;
        const isSpeaking = level > 0.05;
        setSpeakingUsers(prev => prev[user.uid] === isSpeaking ? prev : { ...prev, [user.uid]: isSpeaking });
        await setDoc(doc(db, 'voiceChannels', channelId, 'participants', user.uid), { speaking: isSpeaking }, { merge: true }).catch(() => {});
      }, 200);

      await setDoc(doc(db, 'voiceChannels', channelId, 'participants', user.uid), {
        uid: user.uid, username: user.displayName || user.email,
        photoURL: myData.photoURL || null, muted: false, speaking: false, joinedAt: serverTimestamp(),
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
    setActiveChannel(null); setMuted(false); setDeafened(false);
    setSpeakingUsers({}); setRemoteScreens({}); setViewingScreen(null); setSharing(false);
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
      Object.values(remoteUsersRef.current).forEach(u => u.audioTrack?.setVolume(0));
    } else {
      localTrackRef.current?.setEnabled(true);
      setMuted(false);
      setDoc(doc(db, 'voiceChannels', activeChannel, 'participants', user.uid), { muted: false }, { merge: true });
      Object.values(remoteUsersRef.current).forEach(u => {
        const vol = volumesRef.current[u.uid] ?? 100;
        u.audioTrack?.setVolume(vol);
      });
    }
  }

  function setUserVolume(uid, vol) {
    setVolumes(prev => ({ ...prev, [uid]: vol }));
    volumesRef.current[uid] = vol;
    if (!deafened && remoteUsersRef.current[uid]?.audioTrack) {
      remoteUsersRef.current[uid].audioTrack.setVolume(vol);
    }
  }

  async function stopScreenShare() {
    try { screenTrackRef.current?.stop(); screenTrackRef.current?.close(); } catch {}
    try { await screenClientRef.current?.leave(); } catch {}
    screenTrackRef.current = null;
    screenClientRef.current = null;
    setSharing(false);
    await deleteDoc(doc(db, 'voiceChannels', activeChannel, 'screens', user.uid)).catch(() => {});
  }

  async function toggleScreenShare() {
    if (sharing) {
      await stopScreenShare();
      return;
    }
    // In Electron packaged app, use desktopCapturer
    if (window.electron?.getScreenSources) {
      const sources = await window.electron.getScreenSources();
      setScreenSources(sources);
      setShowPicker(true);
    } else {
      // Browser fallback
      await startScreenShare(null);
    }
  }

  async function startScreenShare(sourceId) {
    setShowPicker(false);
    try {
      let screenTrack;
      if (sourceId) {
        // Electron path — use specific source
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              maxWidth: 1920,
              maxHeight: 1080,
              maxFrameRate: 30,
            },
          },
        });
        const videoTrack = stream.getVideoTracks()[0];
        screenTrack = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: videoTrack });
      } else {
        // Browser path
        screenTrack = await AgoraRTC.createScreenVideoTrack({ encoderConfig: '1080p_1' }, 'disable');
      }

      const screenClient = AgoraRTC.createClient({ mode:'rtc', codec:'vp8' });
      screenClientRef.current = screenClient;
      await screenClient.join(AGORA_APP_ID, `${activeChannel}-screen`, null, null);
      await screenClient.publish(screenTrack);
      screenTrackRef.current = screenTrack;

      screenTrack.on?.('track-ended', () => stopScreenShare());

      await setDoc(doc(db, 'voiceChannels', activeChannel, 'screens', user.uid), {
        uid: user.uid, username: user.displayName || user.email,
        photoURL: myData.photoURL || null, startedAt: serverTimestamp(),
      });
      setSharing(true);
    } catch (err) {
      if (err.message?.includes('Permission denied') || err.name === 'NotAllowedError') return;
      alert('Could not share screen: ' + err.message);
    }
  }

  const activeScreenShares = Object.values(screenParticipants[activeChannel] || {});

  return (
    <div>
      <div style={{ fontSize:'0.63rem', fontWeight:700, color:'var(--text3)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'5px', paddingLeft:'8px' }}>
        Voice Channels
      </div>

      {VOICE_CHANNELS.map(ch => {
        const chUsers = channelUsers[ch.id] || {};
        const userList = Object.values(chUsers);
        const isActive = activeChannel === ch.id;
        const chScreens = Object.values(screenParticipants[ch.id] || {});
        return (
          <div key={ch.id}>
            <button onClick={() => isActive ? leaveChannel() : joinChannel(ch.id)}
              disabled={connecting}
              style={{ width:'100%', background: isActive ? `${theme['--accent']}22` : 'transparent',
                border:'none', borderRadius:'8px', padding:'7px 10px', display:'flex', alignItems:'center',
                gap:'8px', cursor: connecting ? 'wait' : 'pointer', transition:'background 0.15s', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <span style={{ fontSize:'0.82rem', color: isActive ? '#4ade80' : 'var(--text3)' }}>🔊</span>
                <span style={{ fontSize:'0.82rem', fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--text)' : 'var(--text2)' }}>{ch.name}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                {userList.length > 0 && <span style={{ fontSize:'0.65rem', color:'var(--text3)' }}>{userList.length}</span>}
                {chScreens.length > 0 && <span style={{ fontSize:'0.65rem' }}>🖥️</span>}
                {isActive && <span style={{ fontSize:'0.65rem', color:'#4ade80', fontWeight:700 }}>●</span>}
              </div>
            </button>

            {userList.length > 0 && (
              <div style={{ paddingLeft:'28px', marginBottom:'2px' }}>
                {userList.map(p => (
                  <div key={p.uid}
                    onContextMenu={e => { if (p.uid === user.uid) return; e.preventDefault(); setContextMenu({ uid: p.uid, name: p.username, x: e.clientX, y: e.clientY }); }}
                    style={{ display:'flex', alignItems:'center', gap:'6px', padding:'3px 6px', borderRadius:'6px', cursor: p.uid !== user.uid ? 'context-menu' : 'default' }}>
                    <Avatar name={p.username} size={18} photoURL={p.photoURL} speaking={speakingUsers[p.uid] || p.speaking} />
                    <span style={{ fontSize:'0.72rem', color: p.muted ? 'var(--text3)' : 'var(--text2)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {p.username}
                    </span>
                    {p.muted && <span style={{ fontSize:'0.6rem' }}>🔇</span>}
                  </div>
                ))}
                {/* Screen share buttons */}
                {chScreens.map(s => (
                  <div key={s.uid} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'3px 6px', borderRadius:'6px', cursor: isActive ? 'pointer' : 'default' }}
                    onClick={() => isActive && setViewingScreen(viewingScreen === s.uid ? null : s.uid)}>
                    <span style={{ fontSize:'0.75rem', color:'#60a5fa' }}>🖥️</span>
                    <span style={{ fontSize:'0.72rem', color:'#60a5fa' }}>{s.username}'s screen</span>
                    {isActive && <span style={{ fontSize:'0.6rem', color:'var(--text3)' }}>{viewingScreen === s.uid ? '▼' : '▶'}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Active voice controls */}
      {activeChannel && (
        <div style={{ margin:'8px 6px 0', padding:'8px 10px', background:`${theme['--accent']}14`, border:`1px solid ${theme['--accent']}33`, borderRadius:'10px' }}>
          <div style={{ fontSize:'0.68rem', color:'#4ade80', fontWeight:600, marginBottom:'8px', display:'flex', alignItems:'center', gap:'5px' }}>
            <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#4ade80', display:'inline-block', animation:'speaking-pulse 1.5s ease-in-out infinite' }} />
            {VOICE_CHANNELS.find(c => c.id === activeChannel)?.name}
          </div>
          <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
            <button onClick={toggleMute}
              style={{ flex:1, minWidth:'60px', padding:'6px 4px', borderRadius:'8px', border:'none', cursor:'pointer',
                background: muted ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)',
                color: muted ? '#f87171' : 'var(--text2)', fontSize:'0.7rem', fontFamily:'var(--font)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:'3px' }}>
              {muted ? '🔇' : '🎙️'} {muted ? 'Unmute' : 'Mute'}
            </button>
            <button onClick={toggleDeafen}
              style={{ flex:1, minWidth:'60px', padding:'6px 4px', borderRadius:'8px', border:'none', cursor:'pointer',
                background: deafened ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)',
                color: deafened ? '#f87171' : 'var(--text2)', fontSize:'0.7rem', fontFamily:'var(--font)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:'3px' }}>
              {deafened ? '🔕' : '🔔'} {deafened ? 'Undeaf' : 'Deafen'}
            </button>
            <button onClick={toggleScreenShare}
              style={{ flex:1, minWidth:'60px', padding:'6px 4px', borderRadius:'8px', border:'none', cursor:'pointer',
                background: sharing ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.08)',
                color: sharing ? '#60a5fa' : 'var(--text2)', fontSize:'0.7rem', fontFamily:'var(--font)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:'3px' }}>
              🖥️ {sharing ? 'Stop' : 'Share'}
            </button>
            <button onClick={leaveChannel}
              style={{ padding:'6px 10px', borderRadius:'8px', border:'none', cursor:'pointer',
                background:'rgba(239,68,68,0.2)', color:'#f87171', fontSize:'0.7rem', fontFamily:'var(--font)', fontWeight:600 }}>
              Leave
            </button>
          </div>
        </div>
      )}

      {/* Screen share viewer — pops up as floating window */}
      {viewingScreen && remoteScreens[viewingScreen] && (
        <div style={{ position:'fixed', bottom:'80px', right:'200px', zIndex:400,
          background:'#000', borderRadius:'12px', overflow:'hidden',
          border:'2px solid #60a5fa', boxShadow:'0 8px 40px rgba(0,0,0,0.7)',
          resize:'both', width:'640px', height:'380px' }}>
          <div style={{ padding:'6px 12px', background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:'0.75rem', color:'#60a5fa', fontWeight:600 }}>
              🖥️ {channelUsers[activeChannel]?.[viewingScreen]?.username}'s screen
            </span>
            <button onClick={() => setViewingScreen(null)}
              style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.5)', fontSize:'0.9rem' }}>✕</button>
          </div>
          <div id={`screen-${viewingScreen}`} style={{ width:'100%', height:'calc(100% - 32px)', background:'#000' }}
            ref={el => { if (el && remoteScreens[viewingScreen]) remoteScreens[viewingScreen].play(el); }} />
        </div>
      )}

      {/* Screen source picker */}
      {showPicker && (
        <div onClick={() => setShowPicker(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'16px', padding:'20px', width:'560px', maxHeight:'460px', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ fontFamily:'var(--font-head)', fontSize:'1rem', fontWeight:700, color:'var(--text)', marginBottom:'4px' }}>Share your screen</div>
            <div style={{ fontSize:'0.75rem', color:'var(--text3)', marginBottom:'16px' }}>Select a screen or window to share</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'10px', overflowY:'auto', flex:1 }}>
              {screenSources.map(s => (
                <button key={s.id} onClick={() => startScreenShare(s.id)}
                  style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'10px', padding:'8px', cursor:'pointer', textAlign:'center', transition:'border 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor='var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}>
                  <img src={s.thumbnail} alt={s.name} style={{ width:'100%', borderRadius:'6px', marginBottom:'6px', display:'block' }} />
                  <div style={{ fontSize:'0.7rem', color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowPicker(false)} style={{ marginTop:'14px', background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', borderRadius:'10px', padding:'8px', color:'var(--text2)', fontSize:'0.82rem', cursor:'pointer', fontFamily:'var(--font)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Right-click volume context menu */}
      {contextMenu && (
        <div onClick={() => setContextMenu(null)} style={{ position:'fixed', inset:0, zIndex:998 }}>
          <div onClick={e => e.stopPropagation()} style={{ position:'fixed', left: contextMenu.x, top: contextMenu.y,
            background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'12px',
            padding:'12px 14px', zIndex:999, boxShadow:'0 8px 30px rgba(0,0,0,0.5)', minWidth:'180px' }}>
            <div style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--text)', marginBottom:'10px' }}>🔊 {contextMenu.name}</div>
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
