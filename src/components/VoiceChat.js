import { useState, useEffect, useRef } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { doc, setDoc, deleteDoc, onSnapshot, collection, serverTimestamp } from 'firebase/firestore';
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
  const [participants, setParticipants]   = useState({});
  const [muted, setMuted]                 = useState(false);
  const [deafened, setDeafened]           = useState(false);
  const [connecting, setConnecting]       = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState({});

  const clientRef      = useRef(null);
  const localTrackRef  = useRef(null);
  const channelRef     = useRef(null);

  // Listen to all voice channels for participant counts
  const [channelUsers, setChannelUsers] = useState({});
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

  // Clean up on unmount
  useEffect(() => {
    return () => { if (activeChannel) leaveChannel(); };
  }, []);

  async function joinChannel(channelId) {
    if (activeChannel) await leaveChannel();
    setConnecting(true);
    try {
      const client = AgoraRTC.createClient({ mode:'rtc', codec:'vp8' });
      clientRef.current = client;
      channelRef.current = channelId;

      // Handle remote users
      client.on('user-published', async (remoteUser, mediaType) => {
        await client.subscribe(remoteUser, mediaType);
        if (mediaType === 'audio') {
          remoteUser.audioTrack?.play();
        }
      });

      client.on('user-unpublished', (remoteUser) => {
        remoteUser.audioTrack?.stop();
      });

      client.on('user-left', (remoteUser) => {
        setSpeakingUsers(prev => { const n = {...prev}; delete n[remoteUser.uid]; return n; });
      });

      // Join channel
      const uid = await client.join(AGORA_APP_ID, channelId, null, null);

      // Create and publish local audio track
      const localTrack = await AgoraRTC.createMicrophoneAudioTrack({
        AEC: true, ANS: true, AGC: true,
      });
      localTrackRef.current = localTrack;
      await client.publish(localTrack);

      // Voice activity detection
      const analyser = localTrack._mediaStreamTrack ? setupVAD(localTrack, channelId) : null;

      // Register in Firebase
      await setDoc(doc(db, 'voiceChannels', channelId, 'participants', user.uid), {
        uid: user.uid,
        username: user.displayName || user.email,
        photoURL: myData.photoURL || null,
        muted: false,
        joinedAt: serverTimestamp(),
      });

      setActiveChannel(channelId);
      setConnecting(false);
    } catch (err) {
      console.error('Voice join error:', err);
      setConnecting(false);
      alert('Could not join voice channel: ' + err.message);
    }
  }

  function setupVAD(track, channelId) {
    // Simple speaking detection using audio level
    let speaking = false;
    const interval = setInterval(async () => {
      if (!clientRef.current || channelRef.current !== channelId) {
        clearInterval(interval);
        return;
      }
      const level = track.getVolumeLevel?.() || 0;
      const isSpeaking = level > 0.05;
      if (isSpeaking !== speaking) {
        speaking = isSpeaking;
        setSpeakingUsers(prev => ({ ...prev, [user.uid]: isSpeaking }));
        // Update firebase so others can see
        await setDoc(doc(db, 'voiceChannels', channelId, 'participants', user.uid), {
          speaking: isSpeaking,
        }, { merge: true }).catch(() => {});
      }
    }, 200);
    return interval;
  }

  async function leaveChannel() {
    if (!activeChannel) return;
    try {
      localTrackRef.current?.stop();
      localTrackRef.current?.close();
      await clientRef.current?.leave();
      await deleteDoc(doc(db, 'voiceChannels', activeChannel, 'participants', user.uid));
    } catch {}
    localTrackRef.current = null;
    clientRef.current = null;
    channelRef.current = null;
    setActiveChannel(null);
    setMuted(false);
    setDeafened(false);
    setSpeakingUsers({});
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
    if (newDeafened && !muted) {
      localTrackRef.current?.setEnabled(false);
      setMuted(true);
      setDoc(doc(db, 'voiceChannels', activeChannel, 'participants', user.uid), { muted: true }, { merge: true });
    } else if (!newDeafened) {
      localTrackRef.current?.setEnabled(true);
      setMuted(false);
      setDoc(doc(db, 'voiceChannels', activeChannel, 'participants', user.uid), { muted: false }, { merge: true });
    }
    // Mute all remote audio
    clientRef.current?.remoteUsers.forEach(u => {
      u.audioTrack?.[newDeafened ? 'stop' : 'play']?.();
    });
  }

  return (
    <div>
      {/* Voice channel list */}
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
                {userList.length > 0 && (
                  <span style={{ fontSize:'0.65rem', color:'var(--text3)' }}>{userList.length}</span>
                )}
                {isActive && (
                  <span style={{ fontSize:'0.65rem', color:'#4ade80', fontWeight:700 }}>●</span>
                )}
              </div>
            </button>

            {/* Show participants in this channel */}
            {userList.length > 0 && (
              <div style={{ paddingLeft:'28px', marginBottom:'4px' }}>
                {userList.map(p => (
                  <div key={p.uid} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'3px 6px', borderRadius:'6px' }}>
                    <Avatar name={p.username} size={18} photoURL={p.photoURL}
                      speaking={speakingUsers[p.uid] || p.speaking} />
                    <span style={{ fontSize:'0.72rem', color: p.muted ? 'var(--text3)' : 'var(--text2)',
                      textDecoration: p.muted ? 'none' : 'none', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
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

      {/* Active voice controls bar */}
      {activeChannel && (
        <div style={{ margin:'8px 6px 0', padding:'8px 10px',
          background:`${theme['--accent']}14`, border:`1px solid ${theme['--accent']}33`,
          borderRadius:'10px' }}>
          <div style={{ fontSize:'0.68rem', color:'#4ade80', fontWeight:600, marginBottom:'8px', display:'flex', alignItems:'center', gap:'5px' }}>
            <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#4ade80', display:'inline-block', animation:'speaking-pulse 1.5s ease-in-out infinite' }} />
            Connected — {VOICE_CHANNELS.find(c => c.id === activeChannel)?.name}
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

      <style>{`
        @keyframes speaking-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
