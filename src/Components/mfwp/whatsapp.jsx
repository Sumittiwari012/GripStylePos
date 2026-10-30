import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const CSS = `
*{box-sizing:border-box;margin:0}
:root{--teal:#008069;--green:#00a884;--bg:#efeae2;--out:#d9fdd3;--panel:#f0f2f5;--tx:#111b21;--mu:#667781;--blue:#53bdeb;--line:#e9edef}
html,body,#root{height:100%}
#root{height:100dvh}
body{font:15px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;color:var(--tx);background:#d1d7db}
button,input{font:inherit;color:inherit;border:0;background:none;outline:0}
button{cursor:pointer}
.app{height:100%;max-width:560px;margin:0 auto;background:#fff;position:relative;overflow:hidden;display:flex;flex-direction:column}
.top{background:var(--teal);color:#fff;padding:10px 12px;padding-top:max(10px,env(safe-area-inset-top));display:flex;align-items:center;gap:10px;min-height:56px}
.top h1{font-size:21px;font-weight:600;flex:1}
.ib{color:#fff;font-size:22px;padding:4px 8px}
.sb{padding:8px 12px;background:#fff}
.sb input{width:100%;background:var(--panel);border-radius:8px;padding:8px 14px}
.list{flex:1;overflow-y:auto}
.row{display:flex;gap:12px;padding:0 14px;cursor:pointer}
.row:active{background:var(--panel)}
.mid{flex:1;min-width:0;padding:11px 0;border-bottom:1px solid var(--line)}
.r1,.r2{display:flex;justify-content:space-between;align-items:center;gap:8px}
.r1 b{font-weight:500;font-size:16.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm{font-size:12px;color:var(--mu)}.tm.g{color:var(--green)}
.pv{color:var(--mu);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bd{background:var(--green);color:#fff;border-radius:11px;min-width:21px;height:21px;padding:0 6px;font-size:12px;font-weight:600;display:grid;place-items:center}
.av{border-radius:50%;background:#dfe5e7;color:#54656f;display:grid;place-items:center;font-weight:600;font-size:18px;flex:none;object-fit:cover;align-self:center}
.empty{padding:40px 24px;text-align:center;color:var(--mu)}
.fab{position:absolute;right:18px;bottom:calc(18px + env(safe-area-inset-bottom));width:56px;height:56px;border-radius:16px;background:var(--green);color:#fff;font-size:30px;box-shadow:0 3px 8px rgba(0,0,0,.3)}
.hd{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
.hd small{display:block;font-size:12.5px;opacity:.85;height:16px}
.hd b{display:block;font-weight:500;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.msgs{flex:1;overflow-y:auto;padding:10px 8px;background:var(--bg);display:flex;flex-direction:column}
.day{align-self:center;background:#fff;color:var(--mu);font-size:12.5px;padding:4px 12px;border-radius:8px;margin:8px 0;box-shadow:0 1px .5px rgba(11,20,26,.13)}
.b{max-width:82%;padding:6px 8px 5px;border-radius:8px;margin:2px 0;box-shadow:0 1px .5px rgba(11,20,26,.13);background:#fff;align-self:flex-start;overflow-wrap:anywhere}
.b.me{background:var(--out);align-self:flex-end}
.b.nb{background:none;box-shadow:none}
.txt{white-space:pre-wrap}
.sn{font-size:12.5px;font-weight:600;color:#06cf9c;margin-bottom:2px}
.q{background:rgba(0,0,0,.06);border-left:4px solid var(--green);border-radius:6px;padding:4px 8px;margin-bottom:4px;font-size:13.5px;color:var(--mu)}
.meta{float:right;margin:7px 0 -3px 10px;font-size:11px;color:var(--mu);white-space:nowrap}
.tk{font-size:12px;letter-spacing:-3px;margin-left:3px}
.media{max-width:100%;max-height:340px;border-radius:6px;display:block;margin-bottom:3px}
.stk{width:150px;display:block}
.aud audio{height:38px;max-width:240px}
.doc{display:flex;gap:8px;align-items:center;background:rgba(0,0,0,.05);padding:10px;border-radius:6px;color:inherit;text-decoration:none;word-break:break-all}
.del{color:var(--mu)}
.rx{display:inline-block;background:#fff;border-radius:10px;padding:0 6px;font-size:13px;box-shadow:0 1px 2px rgba(0,0,0,.2);margin-top:3px}
.bar{display:flex;gap:6px;align-items:center;padding:6px 8px;padding-bottom:max(6px,env(safe-area-inset-bottom));background:var(--panel)}
.pill{flex:1;display:flex;align-items:center;background:#fff;border-radius:24px;padding:0 6px 0 16px;min-height:44px}
.pill input{flex:1;min-width:0;padding:10px 0}
.pill button{font-size:20px;padding:6px 8px;color:var(--mu)}
.go{width:46px;height:46px;border-radius:50%;background:var(--green);color:#fff;font-size:19px;flex:none}
.rec{flex:1;display:flex;align-items:center;gap:10px;background:#fff;border-radius:24px;padding:0 8px 0 16px;min-height:44px}
.rec i{width:10px;height:10px;border-radius:50%;background:#ea0038;animation:bl 1s infinite}
@keyframes bl{50%{opacity:.2}}
@media(prefers-reduced-motion:reduce){.rec i{animation:none}}
.qr{padding:40px 24px;text-align:center;margin:auto}
.qr h2{font-weight:500;font-size:24px;margin-bottom:10px}
.qr p{color:var(--mu);margin-bottom:20px}
.qr img{width:min(280px,80%)}
.url{width:100%;border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin-bottom:12px;background:var(--panel)}
.btn{display:block;width:100%;background:var(--green);color:#fff;border-radius:24px;padding:12px;font-weight:600;margin-bottom:10px}
.btn.alt{background:var(--panel);color:var(--tx)}
.er{color:#c0392b;margin:12px 0 0!important;font-size:14px}
.pad{padding:4px 16px 24px}
.pad h3{font-size:15px;color:var(--teal);margin:20px 0 8px}
.trow{display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)}
.trow>div{flex:1;min-width:0}
.trow .url{width:auto;margin:0;max-width:150px}
.trow small{display:block;color:var(--mu);font-size:12.5px;overflow-wrap:anywhere}
.sm{background:var(--panel);border-radius:6px;padding:6px 10px;font-size:13px}
.asg{max-width:120px;background:rgba(255,255,255,.18);color:#fff;border-radius:6px;padding:5px;font-size:13px}
.asg option{color:#000}
.tag{font-style:normal;font-size:11px;font-weight:500;background:#e7f7f1;color:var(--teal);padding:1px 7px;border-radius:8px;margin-left:6px}
.by{font-size:11px;color:var(--mu);margin-top:2px}
select.url{margin-bottom:12px}
`;

// REST calls go through the Netlify proxy (/api/* -> Hostinger, see public/_redirects).
// The socket connects directly, because Netlify cannot proxy WebSockets.
const SERVER = 'https://firebrick-magpie-682590.hostingersite.com';
const API = '/api';
const enc = encodeURIComponent;
let TOKEN = localStorage.getItem('wa_token') || '';
const logoutLocal = () => { localStorage.removeItem('wa_token'); location.reload(); };
const api = (p, o = {}) =>
  fetch(API + p, { ...o, headers: { ...(o.headers || {}), Authorization: 'Bearer ' + TOKEN } }).then((r) => {
    if (r.status === 401 && TOKEN) logoutLocal();
    return r.json();
  });
const post = (p, b, method = 'POST') => api(p, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const mediaSrc = (url) => API + url + (url.includes('?') ? '&' : '?') + 'token=' + TOKEN;
const logout = async () => { await post('/auth/logout', {}).catch(() => {}); logoutLocal(); };
const hm = (t) => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmt = (t) => (new Date(t * 1000).toDateString() === new Date().toDateString() ? hm(t) : new Date(t * 1000).toLocaleDateString([], { day: '2-digit', month: 'short' }));
const dl = (t) => {
  const d = new Date(t * 1000).toDateString();
  return d === new Date().toDateString() ? 'Today' : d === new Date(Date.now() - 864e5).toDateString() ? 'Yesterday' : new Date(t * 1000).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
};
const byTime = (a, b) => b.pinned - a.pinned || b.lastMessageTime - a.lastMessageTime;
const upsert = (l, m) => {
  const i = l.findIndex((x) => x.id === m.id);
  if (i < 0) return [...l, m].sort((a, b) => a.timestamp - b.timestamp);
  const c = [...l]; c[i] = { ...c[i], ...m }; return c;
};

const Ticks = ({ s }) => !s ? null : s === 1
  ? <span className="tk">🕓</span>
  : <span className="tk" style={{ color: s >= 4 ? 'var(--blue)' : 'var(--mu)' }}>{s === 2 ? '✓' : '✓✓'}</span>;

const pics = {};
function Avatar({ id, name, size = 49 }) {
  const [u, setU] = useState(pics[id]);
  useEffect(() => {
    if (id in pics) return setU(pics[id]);
    if (!id.includes('@')) return;
    api('/profile-picture/' + enc(id)).then((r) => { if (!r.success) return; pics[id] = r.url || null; setU(pics[id]); }).catch(() => {});
  }, [id]);
  const st = { width: size, height: size };
  return u ? <img className="av" style={st} src={u} /> : <div className="av" style={st}>{(name || '?').replace(/^\+/, '#')[0].toUpperCase()}</div>;
}

function LinkScreen({ onReady, children }) {
  const [st, setSt] = useState({ ready: false, qr: null });
  const [err, setErr] = useState(false);
  useEffect(() => {
    let stop = false;
    const tick = () => fetch(API + '/link/status').then((r) => r.json()).then((r) => {
      if (stop) return;
      setErr(false);
      setSt(r);
      if (r.ready) onReady();
    }).catch(() => !stop && setErr(true));
    tick();
    const t = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  return (
    <div className="qr">
      <h2>{err ? 'Server not reachable' : 'Link WhatsApp'}</h2>
      {err
        ? <p>Check that your server is running. Retrying…</p>
        : st.qr
          ? <><p>On the phone with WhatsApp, open Linked devices, tap Link a device and scan this code.</p><img src={st.qr} /></>
          : <p>Preparing the QR code…</p>}
      {children}
    </div>
  );
}

// Before login: if WhatsApp is not linked anyone can scan the QR; once linked, show the login
function Gate() {
  const [linked, setLinked] = useState(false);
  return linked ? <Login /> : <div className="app"><LinkScreen onReady={() => setLinked(true)} /></div>;
}

function Login() {
  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const call = async (path, body) => {
    setBusy(true); setMsg('');
    const r = await post(path, body).catch(() => ({ success: false, message: 'Cannot reach the server' }));
    setBusy(false);
    return r;
  };
  const send = async () => {
    const r = await call('/auth/request-otp', { phone });
    if (r.success) { setStep(1); setMsg(r.message); } else setMsg(r.message || 'Something went wrong');
  };
  const verify = async () => {
    const r = await call('/auth/verify-otp', { phone, code });
    if (r.success) { localStorage.setItem('wa_token', r.token); location.reload(); } else setMsg(r.message || 'Invalid code');
  };
  return (
    <div className="app"><div className="qr">
      <h2>Sign in</h2>
      <p>{step ? 'Enter the 6-digit code we sent to your WhatsApp.' : 'Enter your WhatsApp number to get a login code on WhatsApp.'}</p>
      {step
        ? <input className="url" inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && verify()} />
        : <input className="url" inputMode="tel" placeholder="Number with country code, e.g. 919876543210" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />}
      <button className="btn" disabled={busy} onClick={step ? verify : send}>{step ? 'Verify' : 'Send code'}</button>
      {step ? <button className="btn alt" onClick={() => { setStep(0); setCode(''); setMsg(''); }}>Use a different number</button> : null}
      {msg && <p className="er" style={{ color: 'var(--mu)' }}>{msg}</p>}
    </div></div>
  );
}

function Team({ team, setTeam, onBack }) {
  const [f, setF] = useState({ name: '', phone: '' });
  const [asg, setAsg] = useState([]);
  const [ap, setAp] = useState({ phone: '', userId: '' });
  const reload = () => {
    api('/admin/users').then((r) => r.success && setTeam(r.users));
    api('/admin/assignments').then((r) => r.success && setAsg(r.assignments));
  };
  useEffect(reload, []);
  const agents = team.filter((t) => t.role === 'agent');
  const run = async (promise, after) => {
    const r = await promise;
    if (!r.success) alert(r.message || 'Failed');
    else if (after) after();
    reload();
  };
  const pick = (value, onChange) => (
    <select className="url" value={value} onChange={onChange}>
      <option value="">Unassigned</option>
      {agents.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );
  return (
    <>
      <div className="top"><button className="ib" onClick={onBack}>←</button><h1>Team</h1></div>
      <div className="list pad">
        <h3>Add coworker</h3>
        <input className="url" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="url" placeholder="WhatsApp number (with country code)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <button className="btn" onClick={() => run(post('/admin/users', f), () => setF({ name: '', phone: '' }))}>Add coworker</button>

        <h3>Coworkers</h3>
        {!agents.length && <p className="empty">No coworkers yet.</p>}
        {agents.map((t) => (
          <div className="trow" key={t.id}>
            <div><b>{t.name}{!t.active && ' (disabled)'}</b><small>{t.phone ? '+' + t.phone : ''} · {t.chats} chats</small></div>
            <button className="sm" onClick={() => run(post('/admin/users/' + t.id, { active: !t.active }, 'PATCH'))}>{t.active ? 'Disable' : 'Enable'}</button>
            <button className="sm" onClick={() => confirm('Remove ' + t.name + '? Their assigned chats become unassigned.') && run(api('/admin/users/' + t.id, { method: 'DELETE' }))}>Remove</button>
          </div>
        ))}

        <h3>Assign a phone number</h3>
        <input className="url" placeholder="Customer phone (with country code)" value={ap.phone} onChange={(e) => setAp({ ...ap, phone: e.target.value })} />
        {pick(ap.userId, (e) => setAp({ ...ap, userId: e.target.value }))}
        <button className="btn" onClick={() => run(post('/admin/assign', { phoneNumber: ap.phone, userId: ap.userId }), () => setAp({ phone: '', userId: '' }))}>Assign</button>

        <h3>Assigned chats</h3>
        {!asg.length && <p className="empty">Nothing assigned yet.</p>}
        {asg.map((a) => (
          <div className="trow" key={a.chatId}>
            <div><b>{a.name}</b></div>
            {pick(a.userId, (e) => run(post('/admin/assign', { chatId: a.chatId, userId: e.target.value })))}
          </div>
        ))}

        <h3>WhatsApp</h3>
        <button className="btn alt" onClick={() => confirm('Disconnect WhatsApp and clear stored chats from the server?') && run(post('/whatsapp/logout', {}))}>Disconnect WhatsApp</button>
      </div>
    </>
  );
}

function Body({ m }) {
  if (m.deleted) return <i className="del">🚫 This message was deleted</i>;
  const u = mediaSrc(m.mediaUrl);
  return (
    <>
      {m.quotedId && <div className="q">{m.quotedText}</div>}
      {m.type === 'image' && <a href={u} target="_blank"><img className="media" src={u} loading="lazy" /></a>}
      {m.type === 'sticker' && <img className="stk" src={u} />}
      {m.type === 'video' && <video className="media" src={u} controls preload="metadata" />}
      {m.type === 'audio' && <div className="aud">{m.ptt && '🎤 '}<audio src={u} controls preload="none" /></div>}
      {m.type === 'document' && <a className="doc" href={u + '&download=1'}>📄 <span>{m.fileName}</span></a>}
      {m.type === 'location' && <a href={`https://maps.google.com/?q=${m.lat},${m.lng}`} target="_blank">📍 {m.text || 'Location'}</a>}
      {m.type === 'contact' && <span>👤 {m.text}</span>}
      {m.text && m.type !== 'location' && m.type !== 'contact' && <div className="txt">{m.text}</div>}
    </>
  );
}

function List({ chats, onOpen, onNew, user, onTeam }) {
  const [q, setQ] = useState('');
  const f = chats.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="top">
        <h1>WhatsApp</h1>
        {user.role === 'admin' && <button className="ib" title="Team" onClick={onTeam}>👥</button>}
        <button className="ib" title="Log out" onClick={logout}>⎋</button>
      </div>
      <div className="sb"><input placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="list">
        {f.map((c) => (
          <div className="row" key={c.id} onClick={() => onOpen(c)}>
            <Avatar id={c.id} name={c.name} />
            <div className="mid">
              <div className="r1"><b>{c.name}{user.role === 'admin' && <em className="tag">{c.assignedTo ? c.assignedTo.name : 'Unassigned'}</em>}</b><span className={c.unreadCount ? 'tm g' : 'tm'}>{c.lastMessage && fmt(c.lastMessage.timestamp)}</span></div>
              <div className="r2">
                <span className="pv"><Ticks s={c.lastMessage?.fromMe ? c.lastMessage.status : null} /> {c.lastMessage?.text}</span>
                {c.unreadCount > 0 && <span className="bd">{c.unreadCount}</span>}
              </div>
            </div>
          </div>
        ))}
        {!f.length && <p className="empty">No chats yet. Tap + to message a number.</p>}
      </div>
      <button className="fab" title="New chat" onClick={onNew}>+</button>
    </>
  );
}

function Chat({ chat, list, setMsgs, typing, user, team, onBack, onSent }) {
  const id = chat.id;
  const [text, setText] = useState('');
  const [more, setMore] = useState(false);
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  const box = useRef(), stick = useRef(true), lastTyping = useRef(0), fileRef = useRef(), mr = useRef(), loading = useRef(false);
  const target = chat.isNew ? { phoneNumber: chat.number } : { chatId: id };
  const [asg, setAsg] = useState(chat.assignedTo?.id || '');
  const assign = async (e) => {
    const v = e.target.value;
    setAsg(v);
    const r = await post('/admin/assign', { chatId: id, userId: v ? Number(v) : null });
    if (!r.success) alert(r.message || 'Could not assign');
  };

  useEffect(() => {
    if (chat.isNew) return;
    api(`/messages/${enc(id)}?limit=40`).then((r) => { if (r.success) { setMsgs((p) => ({ ...p, [id]: r.messages })); setMore(r.hasMore); } });
    post('/read', { chatId: id });
    post('/presence/subscribe', { chatId: id });
  }, [id]);

  useEffect(() => { const b = box.current; if (b && stick.current) b.scrollTop = b.scrollHeight; }, [list.length]);
  useEffect(() => {
    if (!rec) return;
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [rec]);

  const onScroll = async () => {
    const b = box.current;
    stick.current = b.scrollHeight - b.scrollTop - b.clientHeight < 80;
    if (b.scrollTop < 40 && more && !loading.current && list.length) {
      loading.current = true;
      const h = b.scrollHeight;
      const r = await api(`/messages/${enc(id)}?limit=40&before=${list[0].timestamp}`);
      if (r.success) {
        setMsgs((p) => ({ ...p, [id]: [...r.messages, ...(p[id] || [])] }));
        setMore(r.hasMore);
        requestAnimationFrame(() => { b.scrollTop = b.scrollHeight - h; });
      }
      loading.current = false;
    }
  };

  const done = (r) => {
    if (!r.success) return alert(r.message || 'Could not send');
    stick.current = true;
    if (chat.isNew && r.message) onSent(r.message.chatId);
  };
  const sendText = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    if (!chat.isNew) post('/presence', { chatId: id, state: 'paused' });
    done(await post('/send/text', { ...target, text: t }));
  };
  const upload = async (file, extra = {}) => {
    const f = new FormData();
    f.append('file', file);
    Object.entries({ ...target, ...extra }).forEach(([k, v]) => f.append(k, v));
    done(await api('/send/media', { method: 'POST', body: f }));
  };
  const pick = (e) => {
    const f = e.target.files[0];
    if (f) upload(f, { caption: text.trim() });
    setText('');
    e.target.value = '';
  };
  const typed = (e) => {
    setText(e.target.value);
    if (!chat.isNew && Date.now() - lastTyping.current > 4000) { lastTyping.current = Date.now(); post('/presence', { chatId: id, state: 'composing' }); }
  };
  const startRec = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(s), ch = [];
      r.ondataavailable = (e) => ch.push(e.data);
      r.start();
      mr.current = { r, s, ch };
      setRec(true);
    } catch (e) { alert('Microphone is blocked. Allow microphone access (the page must use HTTPS or localhost).'); }
  };
  const stopRec = (send) => {
    const { r, s, ch } = mr.current;
    r.onstop = () => {
      s.getTracks().forEach((t) => t.stop());
      if (send) upload(new File([new Blob(ch, { type: r.mimeType })], 'voice.webm', { type: r.mimeType }), { ptt: 'true' });
    };
    r.stop();
    setRec(false);
  };

  const status = typing === 'composing' ? 'typing…' : typing === 'recording' ? 'recording audio…' : typing === 'available' ? 'online' : '';
  return (
    <>
      <div className="top">
        <button className="ib" onClick={onBack}>←</button>
        <div className="hd"><Avatar id={id} name={chat.name} size={40} /><div style={{ minWidth: 0 }}><b>{chat.name}</b><small>{status}</small></div></div>
        {user.role === 'admin' && !chat.isNew && (
          <select className="asg" value={asg} onChange={assign}>
            <option value="">Unassigned</option>
            {team.filter((t) => t.role === 'agent' && t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>
      <div className="msgs" ref={box} onScroll={onScroll}>
        {list.map((m, i) => {
          const nd = i === 0 || new Date(m.timestamp * 1000).toDateString() !== new Date(list[i - 1].timestamp * 1000).toDateString();
          const rx = [...new Set(Object.values(m.reactions || {}))].join('');
          return (
            <React.Fragment key={m.id}>
              {nd && <div className="day">{dl(m.timestamp)}</div>}
              <div className={'b' + (m.fromMe ? ' me' : '') + (m.type === 'sticker' ? ' nb' : '')}>
                {chat.isGroup && !m.fromMe && <div className="sn">{m.pushName || '+' + String(m.sender).split('@')[0]}</div>}
                <Body m={m} />{user.role === 'admin' && m.fromMe && m.sentBy && <div className="by">sent by {m.sentBy}</div>}
                <span className="meta">{hm(m.timestamp)}{m.fromMe && <Ticks s={m.status} />}</span>
                {rx && <div><span className="rx">{rx}</span></div>}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div className="bar">
        {rec ? (
          <>
            <div className="rec"><button onClick={() => stopRec(false)} title="Cancel">🗑</button><i /><span>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span></div>
            <button className="go" onClick={() => stopRec(true)} title="Send voice message">➤</button>
          </>
        ) : (
          <>
            <div className="pill">
              <input placeholder="Message" value={text} onChange={typed} onKeyDown={(e) => e.key === 'Enter' && sendText()} />
              <button onClick={() => fileRef.current.click()} title="Attach">📎</button>
              <input ref={fileRef} type="file" hidden onChange={pick} />
            </div>
            {text.trim() ? <button className="go" onClick={sendText} title="Send">➤</button> : <button className="go" onClick={startRec} title="Record voice message">🎤</button>}
          </>
        )}
      </div>
    </>
  );
}

function App() {
  const [st, setSt] = useState({ ready: false, qr: null });
  const [chats, setChats] = useState([]);
  const [msgs, setMsgs] = useState({});
  const [typing, setTyping] = useState({});
  const [active, setActive] = useState(null);
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState([]);
  const [panel, setPanel] = useState(false);
  const activeRef = useRef(null);
  activeRef.current = active;

  useEffect(() => {
    api('/auth/me').then((r) => {
      if (!r.success) return;
      setUser(r.user);
      setSt((p) => ({ ...p, ready: r.ready }));
      if (r.user.role === 'admin') api('/admin/users').then((x) => x.success && setTeam(x.users));
    }).catch(() => setSt({ ready: false, qr: null, err: true }));
    const s = io(SERVER, { auth: { token: TOKEN } });
    s.on('connect_error', (e) => (e.message === 'unauthorized' ? logoutLocal() : setSt((p) => (p.ready ? p : { ...p, err: true }))));
    s.on('connect', () => api('/chats').then((r) => r.success && setChats(r.chats)).catch(() => {}));
    s.on('status', setSt);
    s.on('qr', (qr) => setSt({ ready: false, qr }));
    s.on('ready', (r) => setSt((p) => ({ ...p, ready: r, qr: null })));
    s.on('chat-update', (c) => setChats((p) => [c, ...p.filter((x) => x.id !== c.id)].sort(byTime)));
    s.on('chat-deleted', (id) => { setChats((p) => p.filter((x) => x.id !== id)); setActive((a) => (a && a.id === id ? null : a)); });
    s.on('message', (m) => {
      setMsgs((p) => ({ ...p, [m.chatId]: upsert(p[m.chatId] || [], m) }));
      if (!m.fromMe && activeRef.current?.id === m.chatId) post('/read', { chatId: m.chatId });
    });
    s.on('message-update', (m) => setMsgs((p) => (p[m.chatId] ? { ...p, [m.chatId]: p[m.chatId].map((x) => (x.id === m.id ? { ...x, ...m } : x)) } : p)));
    s.on('message-removed', ({ chatId, id }) => setMsgs((p) => ({ ...p, [chatId]: (p[chatId] || []).filter((x) => x.id !== id) })));
    s.on('presence', ({ chatId, presences }) => setTyping((p) => ({ ...p, [chatId]: Object.values(presences || {})[0]?.lastKnownPresence })));
    return () => s.close();
  }, []);

  useEffect(() => { if (st.ready) api('/chats').then((r) => r.success && setChats(r.chats)); }, [st.ready]);

  const newChat = () => {
    const d = (prompt('Phone number with country code (for example 919876543210)') || '').replace(/\D/g, '');
    if (d.length < 10) return;
    const jid = (d.length === 10 ? '91' + d : d) + '@s.whatsapp.net';
    setActive(chats.find((c) => c.id === jid) || { id: 'new:' + d, isNew: true, number: d, name: '+' + d, isGroup: false });
  };

  if (!user && !st.err) return <div className="app"><div className="qr"><p>Loading…</p></div></div>;
  if (panel) return <div className="app"><Team team={team} setTeam={setTeam} onBack={() => setPanel(false)} /></div>;
  if (!st.ready) return (
    <div className="app">
      <LinkScreen onReady={() => setSt((p) => ({ ...p, ready: true }))}>
        {user?.role === 'admin' && <button className="btn alt" onClick={() => setPanel(true)}>Manage team</button>}
        <button className="btn alt" onClick={logout}>Log out</button>
      </LinkScreen>
    </div>
  );
  return (
    <div className="app">
      {active
        ? <Chat key={active.id} chat={active} list={msgs[active.id] || []} setMsgs={setMsgs} typing={typing[active.id]} user={user} team={team} onBack={() => setActive(null)}
            onSent={(jid) => setActive(chats.find((c) => c.id === jid) || { id: jid, name: active.name, isGroup: false })} />
        : <List chats={chats} onOpen={setActive} onNew={newChat} user={user} onTeam={() => setPanel(true)} />}
    </div>
  );
}

export default function WhatsAppUI() {
  return (
    <>
      <style>{CSS}</style>
      {TOKEN ? <App /> : <Gate />}
    </>
  );
}