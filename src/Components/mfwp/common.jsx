import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

/* ───────────── settings you may want to change ───────────── */

export const API = 'https://firebrick-magpie-682590.hostingersite.com';

// The three routes. Change these if you mount the pages under other paths.
export const ROUTES = { inbox: '/inbox', mine: '/minewp', admin: '/adminwp' };
export const TITLES = { inbox: 'Inbox', mine: 'My chats', admin: 'Admin' };

/* ───────────── styles ───────────── */

export const CSS = `
*{box-sizing:border-box;margin:0}
:root{--teal:#008069;--green:#00a884;--bg:#efeae2;--out:#d9fdd3;--panel:#f0f2f5;--tx:#111b21;--mu:#667781;--blue:#53bdeb;--line:#e9edef}
html,body,#root{height:100%}
#root{height:100dvh}
body{font:15px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;color:var(--tx);background:#d1d7db}
button,input{font:inherit;color:inherit;border:0;background:none;outline:0}
button{cursor:pointer}
.app{height:100%;max-width:560px;margin:0 auto;background:#fff;position:relative;overflow:hidden;display:flex;flex-direction:column}
.top{background:var(--teal);color:#fff;padding:10px 12px;padding-top:max(10px,env(safe-area-inset-top));display:flex;align-items:center;gap:10px;min-height:56px}
.top h1{font-size:21px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ib{color:#fff;font-size:22px;padding:4px 8px}
a.ib{text-decoration:none}
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
.fab{position:absolute;right:18px;bottom:calc(76px + env(safe-area-inset-bottom));width:56px;height:56px;border-radius:16px;background:var(--green);color:#fff;font-size:30px;box-shadow:0 3px 8px rgba(0,0,0,.3)}
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
.bar .btn{margin:0}
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
.trow small{display:block;color:var(--mu);font-size:12.5px;overflow-wrap:anywhere}
.sm{background:var(--panel);border-radius:6px;padding:6px 10px;font-size:13px}
.sm.ok{background:#e7f7f1;color:var(--teal);font-weight:600}
.sm.no{background:#fdecea;color:#c0392b;font-weight:600}
.tag{font-style:normal;font-size:11px;font-weight:500;background:#e7f7f1;color:var(--teal);padding:1px 7px;border-radius:8px;margin-left:6px}
.tag.new{background:#fff3cd;color:#8a6d00}
.by{font-size:11px;color:var(--mu);margin-top:2px}
select.url{margin-bottom:12px}
.nv{display:flex;border-top:1px solid var(--line);background:#fff;padding-bottom:env(safe-area-inset-bottom)}
.nv a{text-decoration:none}
.nv button,.nv a{flex:1;padding:8px 4px 7px;font-size:12px;color:var(--mu);display:flex;flex-direction:column;align-items:center;gap:1px;position:relative}
.nv button.on{color:var(--teal);font-weight:600}
.nv .ic{font-size:20px}
.nv .bd{position:absolute;top:3px;left:calc(50% + 6px)}
.tabs{display:flex;background:var(--teal)}
.tabs button{flex:1;color:#fff;opacity:.7;padding:10px 4px;border-bottom:3px solid transparent;font-weight:500}
.tabs button.on{opacity:1;border-color:#fff}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.card{background:var(--panel);border-radius:10px;padding:12px}
.card b{display:block;font-size:26px;font-weight:600}
.card small{color:var(--mu)}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.sheet{background:#fff;border-bottom:1px solid var(--line);padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px}
.sheet .url{margin:0}
.info{padding:12px;text-align:center;color:var(--mu);background:var(--panel);font-size:14px;padding-bottom:max(12px,env(safe-area-inset-bottom))}
.filt{display:flex;gap:6px;padding:0 12px 8px}
.acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;padding-bottom:2px}
.acts .sm{padding:5px 9px;font-size:12.5px}
.acts select{border:0;background:var(--panel);border-radius:6px;padding:5px 6px;font-size:12.5px;color:var(--tx);max-width:130px}
`;

/* ───────────── session + API helpers ─────────────
   Inbox and My chats share ONE login (wa_token_staff).
   The admin page has its OWN login (wa_token_admin), so both can be open at the same time, even as different people. */

let sessionKey = 'wa_token';
export const setSessionKey = (k) => { sessionKey = k; };
export const getToken = () => localStorage.getItem(sessionKey) || '';
export const logoutLocal = () => { localStorage.removeItem(sessionKey); location.reload(); };

export const enc = encodeURIComponent;
export const api = (p, o = {}) =>
  fetch(API + p, { ...o, headers: { ...(o.headers || {}), Authorization: 'Bearer ' + getToken() } }).then((r) => {
    if (r.status === 401 && getToken()) logoutLocal();
    return r.json();
  });
export const post = (p, b, method = 'POST') => api(p, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
export const mediaSrc = (url) => API + url + (url.includes('?') ? '&' : '?') + 'token=' + getToken();
export const logout = async () => { await post('/auth/logout', {}).catch(() => {}); logoutLocal(); };

// Close / transfer / release a chat. Asks first, returns true when it worked.
export const chatAction = async (chatId, path, body, ask) => {
  if (ask && !confirm(ask)) return false;
  const r = await post(path, { chatId, ...body });
  if (!r.success) { alert(r.message || 'Failed'); return false; }
  return true;
};
const ASK = {
  done: 'Mark as order completed and remove from your list? New messages from this number will still come to you.',
  cancel: 'Mark as cancelled and remove from your list? New messages from this number will still come to you.',
  release: 'Send this chat back to the common inbox? New messages from this number will no longer come to you.'
};

export const hm = (t) => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const fmt = (t) => (new Date(t * 1000).toDateString() === new Date().toDateString() ? hm(t) : new Date(t * 1000).toLocaleDateString([], { day: '2-digit', month: 'short' }));
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

/* ───────────── small shared components ───────────── */

export const Ticks = ({ s }) => !s ? null : s === 1
  ? <span className="tk">🕓</span>
  : <span className="tk" style={{ color: s >= 4 ? 'var(--blue)' : 'var(--mu)' }}>{s === 2 ? '✓' : '✓✓'}</span>;

const pics = {};
export function Avatar({ id, name, size = 49 }) {
  const [u, setU] = useState(pics[id]);
  useEffect(() => {
    if (id in pics) return setU(pics[id]);
    if (!id.includes('@')) return;
    api('/profile-picture/' + enc(id)).then((r) => { if (!r.success) return; pics[id] = r.url || null; setU(pics[id]); }).catch(() => {});
  }, [id]);
  const st = { width: size, height: size };
  return u ? <img className="av" style={st} src={u} /> : <div className="av" style={st}>{(name || '?').replace(/^\+/, '#')[0].toUpperCase()}</div>;
}

export function NotReady({ err, children }) {
  return (
    <div className="qr">
      <h2>{err ? 'Server not reachable' : 'WhatsApp is not connected'}</h2>
      <p>{err ? 'Check that your server is running.' : 'Ask the admin to link WhatsApp. This page updates by itself once it is connected.'}</p>
      {children}
    </div>
  );
}

export function Top({ title }) {
  return <div className="top"><h1>{title}</h1><button className="ib" title="Log out" onClick={logout}>⎋</button></div>;
}

function Login({ page }) {
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
    if (!r.success) return setMsg(r.message || 'Invalid code');
    if (page === 'admin' && r.user?.role !== 'admin') {
      // Not the admin: throw the session away straight away
      fetch(API + '/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + r.token } }).catch(() => {});
      setStep(0); setCode('');
      return setMsg('This page is for the admin only.');
    }
    localStorage.setItem(sessionKey, r.token);
    location.reload();
  };
  return (
    <div className="app"><div className="qr">
      <h2>Sign in to {TITLES[page]}</h2>
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

// Quick buttons on each row of "My chats" (same options as the ⋮ menu inside a chat)
export function ChatActions({ chat, team }) {
  const agents = team.filter((t) => t.role === 'agent' && t.active && t.id !== chat.assignedTo?.id);
  return (
    <div className="acts" onClick={(e) => e.stopPropagation()}>
      <button className="sm ok" onClick={() => chatAction(chat.id, '/chats/close', { outcome: 'cleared' }, ASK.done)}>✔ Completed</button>
      <button className="sm no" onClick={() => chatAction(chat.id, '/chats/close', { outcome: 'cancelled' }, ASK.cancel)}>✖ Cancelled</button>
      <button className="sm" onClick={() => chatAction(chat.id, '/chats/release', {}, ASK.release)}>↩ Inbox</button>
      <select value="" onChange={(e) => {
        const sel = e.target;
        const uid = Number(sel.value);
        const name = sel.options[sel.selectedIndex].text;
        if (uid) chatAction(chat.id, '/chats/transfer', { userId: uid }, 'Transfer this chat to ' + name + '?');
      }}>
        <option value="">⇄ Transfer…</option>
        {agents.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
  );
}

// A searchable list of chats. `tags` shows "New" / "handled by <name>" on each row.
export function ChatList({ chats, onOpen, tags, empty, onNew, filter, rowExtra }) {
  const [q, setQ] = useState('');
  const f = chats.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="sb"><input placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {filter}
      <div className="list">
        {f.map((c) => (
          <div className="row" key={c.id} onClick={() => onOpen(c)}>
            <Avatar id={c.id} name={c.name} />
            <div className="mid">
              <div className="r1">
                <b>{c.name}{tags && <em className={'tag' + (c.assignedTo ? '' : ' new')}>{c.assignedTo ? c.assignedTo.name : 'New'}</em>}</b>
                <span className={c.unreadCount ? 'tm g' : 'tm'}>{c.lastMessage && fmt(c.lastMessage.timestamp)}</span>
              </div>
              <div className="r2">
                <span className="pv"><Ticks s={c.lastMessage?.fromMe ? c.lastMessage.status : null} /> {c.lastMessage?.text}</span>
                {c.unreadCount > 0 && <span className="bd">{c.unreadCount}</span>}
              </div>
              {rowExtra && rowExtra(c)}
            </div>
          </div>
        ))}
        {!f.length && <p className="empty">{empty}</p>}
      </div>
      {onNew && <button className="fab" title="New chat" onClick={onNew}>+</button>}
    </>
  );
}

// Inbox and My chats share one login, so they open in the SAME tab.
// (The admin page is separate, has its own login and shows no bottom bar.)
function Nav({ page, user, chats }) {
  const badge = page === 'inbox'
    ? chats.filter((c) => c.unreadCount > 0 && !c.assignedTo).length
    : chats.filter((c) => c.assignedTo?.id === user.id && c.unreadCount > 0).length;
  const items = [['inbox', '📥'], ['mine', '💬']];
  return (
    <nav className="nv">
      {items.map(([k, ic]) => {
        const inner = <><span className="ic">{ic}</span>{TITLES[k]}{k === page && badge > 0 && <span className="bd">{badge}</span>}</>;
        return k === page
          ? <button key={k} className="on">{inner}</button>
          : <a key={k} href={ROUTES[k]}>{inner}</a>;
      })}
    </nav>
  );
}

/* ───────────── chat view ───────────── */

function Body({ m }) {
  if (m.deleted) return <i className="del">🚫 This message was deleted</i>;
  const u = m.mediaUrl ? mediaSrc(m.mediaUrl) : '';
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

// free chat (nobody handling)  -> read it, "Claim this chat" replaces the message box
// handled by someone else      -> read only (admin can still reply and manage it)
// handled by me                -> message box + ⋮ menu (order completed / cancelled / transfer / back to inbox)
function Chat({ chat, list, setMsgs, typing, user, team, onBack, onSent }) {
  const id = chat.id;
  const owner = chat.assignedTo;
  const mine = owner?.id === user.id;
  const isAdmin = user.role === 'admin';
  const free = !chat.isNew && !owner;
  const canType = chat.isNew || mine || (isAdmin && !!owner);
  const canManage = !chat.isNew && !!owner && (mine || isAdmin);

  const [text, setText] = useState('');
  const [more, setMore] = useState(false);
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  const [menu, setMenu] = useState(false);
  const box = useRef(), stick = useRef(true), lastTyping = useRef(0), fileRef = useRef(), mr = useRef(), loading = useRef(false);
  const target = chat.isNew ? { phoneNumber: chat.number } : { chatId: id };

  useEffect(() => {
    if (chat.isNew) return;
    api(`/messages/${enc(id)}?limit=40`).then((r) => { if (r.success) { setMsgs((p) => ({ ...p, [id]: r.messages })); setMore(r.hasMore); } });
    post('/presence/subscribe', { chatId: id });
  }, [id]);

  // Only the person handling the chat marks it as read (looking at it from the inbox does not)
  useEffect(() => { if (mine && chat.unreadCount > 0) post('/read', { chatId: id }); }, [mine, chat.unreadCount]);

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

  const claim = async () => {
    const r = await post('/chats/claim', { chatId: id });
    if (!r.success) alert(r.message || 'Could not claim this chat');
  };
  const act = async (path, body, ask) => {
    if (ask && !confirm(ask)) return;
    const r = await post(path, { chatId: id, ...body });
    if (!r.success) return alert(r.message || 'Failed');
    setMenu(false);
    onBack();
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
  const uploadFile = async (file, extra = {}) => {
    const f = new FormData();
    f.append('file', file);
    Object.entries({ ...target, ...extra }).forEach(([k, v]) => f.append(k, v));
    done(await api('/send/media', { method: 'POST', body: f }));
  };
  const pick = (e) => {
    const f = e.target.files[0];
    if (f) uploadFile(f, { caption: text.trim() });
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
      if (send) uploadFile(new File([new Blob(ch, { type: r.mimeType })], 'voice.webm', { type: r.mimeType }), { ptt: 'true' });
    };
    r.stop();
    setRec(false);
  };

  // wa.me opens a chat with this number in the staff member's OWN WhatsApp; the call is then started there
  const phone = chat.isNew ? chat.number : id.endsWith('@s.whatsapp.net') ? id.split('@')[0].split(':')[0] : null;
  const waLink = phone ? 'https://wa.me/' + (phone.length === 10 ? '91' + phone : phone) : null;

  const live = typing === 'composing' ? 'typing…' : typing === 'recording' ? 'recording audio…' : typing === 'available' ? 'online' : '';
  const status = live || (owner ? (mine ? 'Handled by you' : 'Handled by ' + owner.name) : free ? 'Not claimed yet' : '');
  const agents = team.filter((t) => t.role === 'agent' && t.active && t.id !== owner?.id);

  return (
    <>
      <div className="top">
        <button className="ib" onClick={onBack}>←</button>
        <div className="hd"><Avatar id={id} name={chat.name} size={40} /><div style={{ minWidth: 0 }}><b>{chat.name}</b><small>{status}</small></div></div>
        {waLink && <a className="ib" href={waLink} target="_blank" rel="noopener noreferrer" title="Voice call (opens WhatsApp)">📞</a>}
        {waLink && <a className="ib" href={waLink} target="_blank" rel="noopener noreferrer" title="Video call (opens WhatsApp)">🎥</a>}
        {canManage && <button className="ib" title="Chat actions" onClick={() => setMenu(!menu)}>⋮</button>}
      </div>

      {menu && canManage && (
        <div className="sheet">
          <button className="sm ok" onClick={() => act('/chats/close', { outcome: 'cleared' }, 'Mark as order completed and remove from your list? New messages from this number will still come to you.')}>✔ Order completed</button>
          <button className="sm no" onClick={() => act('/chats/close', { outcome: 'cancelled' }, 'Mark as cancelled and remove from your list? New messages from this number will still come to you.')}>✖ Cancelled</button>
          <button className="sm" onClick={() => act('/chats/release', {}, 'Send this chat back to the common inbox? New messages from this number will no longer come to you.')}>↩ Back to inbox</button>
          <select className="url" value="" onChange={(e) => {
            const sel = e.target;
            const uid = Number(sel.value);
            const name = sel.options[sel.selectedIndex].text;
            if (uid) act('/chats/transfer', { userId: uid }, 'Transfer this chat to ' + name + '?');
          }}>
            <option value="">Transfer to…</option>
            {agents.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      <div className="msgs" ref={box} onScroll={onScroll}>
        {list.map((m, i) => {
          const nd = i === 0 || new Date(m.timestamp * 1000).toDateString() !== new Date(list[i - 1].timestamp * 1000).toDateString();
          const rx = [...new Set(Object.values(m.reactions || {}))].join('');
          return (
            <React.Fragment key={m.id}>
              {nd && <div className="day">{dl(m.timestamp)}</div>}
              <div className={'b' + (m.fromMe ? ' me' : '') + (m.type === 'sticker' ? ' nb' : '')}>
                {chat.isGroup && !m.fromMe && <div className="sn">{m.pushName || '+' + String(m.sender).split('@')[0]}</div>}
                <Body m={m} />{m.fromMe && m.sentBy && <div className="by">sent by {m.sentBy}</div>}
                <span className="meta">{hm(m.timestamp)}{m.fromMe && <Ticks s={m.status} />}</span>
                {rx && <div><span className="rx">{rx}</span></div>}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {free && <div className="bar"><button className="btn" onClick={claim}>Claim this chat</button></div>}
      {!free && !canType && <div className="info">👤 {owner?.name} is handling this chat. You can read it but not reply.</div>}
      {canType && (
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
      )}
    </>
  );
}

/* ───────────── Shell: login, live data, chat view, bottom links ─────────────
   Each page file wraps its content like this:

     <Shell page="inbox">{({ chats, user, openChat }) => ...your page...}</Shell>

   The function receives { chats, user, team, setTeam, st, openChat }. */

function Session({ page, adminOnly, needsWhatsApp, children }) {
  const [st, setSt] = useState({ ready: false, qr: null });
  const [chats, setChats] = useState([]);
  const [msgs, setMsgs] = useState({});
  const [typing, setTyping] = useState({});
  const [active, setActive] = useState(null);
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState([]);

  useEffect(() => {
    api('/auth/me').then((r) => {
      if (!r.success) return;
      setUser(r.user);
      setSt((p) => ({ ...p, ready: r.ready }));
      api('/team').then((x) => x.success && setTeam(x.users));
    }).catch(() => setSt({ ready: false, qr: null, err: true }));
    const s = io(API, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      auth: { token: getToken() },
      reconnectionDelayMax: 10000 // back off instead of hammering the server when it is down
    });
    s.on('connect_error', (e) => (e.message === 'unauthorized' ? logoutLocal() : setSt((p) => (p.ready ? p : { ...p, err: true }))));
    s.on('connect', () => api('/chats').then((r) => r.success && setChats(r.chats)).catch(() => {}));
    s.on('status', setSt);
    s.on('qr', (qr) => setSt({ ready: false, qr }));
    s.on('ready', (r) => setSt((p) => ({ ...p, ready: r, qr: null })));
    s.on('chat-update', (c) => setChats((p) => [c, ...p.filter((x) => x.id !== c.id)].sort(byTime)));
    s.on('chat-deleted', (id) => { setChats((p) => p.filter((x) => x.id !== id)); setActive((a) => (a && a.id === id ? null : a)); });
    s.on('message', (m) => setMsgs((p) => ({ ...p, [m.chatId]: upsert(p[m.chatId] || [], m) })));
    s.on('message-update', (m) => setMsgs((p) => (p[m.chatId] ? { ...p, [m.chatId]: p[m.chatId].map((x) => (x.id === m.id ? { ...x, ...m } : x)) } : p)));
    s.on('message-removed', ({ chatId, id }) => setMsgs((p) => ({ ...p, [chatId]: (p[chatId] || []).filter((x) => x.id !== id) })));
    s.on('presence', ({ chatId, presences }) => setTyping((p) => ({ ...p, [chatId]: Object.values(presences || {})[0]?.lastKnownPresence })));
    return () => s.close();
  }, []);

  useEffect(() => { if (st.ready) api('/chats').then((r) => r.success && setChats(r.chats)); }, [st.ready]);

  if (!user) {
    return (
      <div className="app"><div className="qr">
        {st.err ? <NotReady err><button className="btn alt" onClick={logout}>Log out</button></NotReady> : <p>Loading…</p>}
      </div></div>
    );
  }

  if (adminOnly && user.role !== 'admin') {
    return (
      <div className="app"><div className="qr">
        <h2>Admin only</h2>
        <p>You are signed in as {user.name}. Log out and sign in with the admin number to use this page.</p>
        <button className="btn alt" onClick={logout}>Log out</button>
      </div></div>
    );
  }

  const live = active && (chats.find((c) => c.id === active.id) || active);
  if (live) {
    return (
      <div className="app">
        <Chat key={live.id} chat={live} list={msgs[live.id] || []} setMsgs={setMsgs} typing={typing[live.id]} user={user} team={team} onBack={() => setActive(null)}
          onSent={(jid) => setActive(chats.find((c) => c.id === jid) || { id: jid, name: live.name, isGroup: false })} />
      </div>
    );
  }

  const body = needsWhatsApp && !st.ready
    ? <NotReady err={st.err}><button className="btn alt" onClick={logout}>Log out</button></NotReady>
    : children({ chats, user, team, setTeam, st, openChat: setActive });

  return (
    <div className="app">
      {body}
      {page !== 'admin' && <Nav page={page} user={user} chats={chats} />}
    </div>
  );
}

export function Shell({ page, adminOnly = false, needsWhatsApp = true, children }) {
  setSessionKey(page === 'admin' ? 'wa_token_admin' : 'wa_token_staff'); // Inbox + My chats: one login, Admin: its own
  return (
    <>
      <style>{CSS}</style>
      {getToken() ? <Session page={page} adminOnly={adminOnly} needsWhatsApp={needsWhatsApp}>{children}</Session> : <Login page={page} />}
    </>
  );
}
