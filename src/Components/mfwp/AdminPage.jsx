import React, { useState, useEffect } from 'react';
import { Shell, Top, ChatList, api, post, fmt } from './common';

// Route: /adminwp   (admin number only, has its own login)
// Dashboard (who follows how many, how many converted), All chats (monitor), Team (add coworkers, WhatsApp link).

const LABEL = { active: 'Following', cleared: 'Order completed', cancelled: 'Cancelled', transferred: 'Transferred', released: 'Back to inbox' };
const rate = (c, x) => (c + x ? Math.round((100 * c) / (c + x)) + '%' : '–');

function Stats() {
  const [days, setDays] = useState(0);
  const [d, setD] = useState(null);
  useEffect(() => {
    let on = true;
    const load = () => api('/admin/stats?days=' + days).then((r) => on && r.success && setD(r)).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => { on = false; clearInterval(t); };
  }, [days]);
  if (!d) return <p className="empty">Loading…</p>;
  const sum = (k) => d.agents.reduce((a, x) => a + x[k], 0);
  const following = sum('following'), cleared = sum('cleared'), cancelled = sum('cancelled'), moved = sum('transferred');
  return (
    <div className="list pad">
      <div className="chips">
        {[['All time', 0], ['24 hours', 1], ['7 days', 7], ['30 days', 30]].map(([l, v]) => (
          <button key={v} className={'sm' + (days === v ? ' ok' : '')} onClick={() => setDays(v)}>{l}</button>
        ))}
      </div>
      <h3>Overview</h3>
      <div className="cards">
        <div className="card"><b>{d.unclaimed}</b><small>Waiting in inbox</small></div>
        <div className="card"><b>{following}</b><small>Being followed now</small></div>
        <div className="card"><b>{cleared}</b><small>Converted (order completed)</small></div>
        <div className="card"><b>{cancelled}</b><small>Cancelled</small></div>
        <div className="card"><b>{rate(cleared, cancelled)}</b><small>Conversion rate</small></div>
        <div className="card"><b>{moved}</b><small>Handed to someone else</small></div>
      </div>

      <h3>By coworker</h3>
      {!d.agents.length && <p className="empty">No coworkers yet. </p>}
      {d.agents.map((a) => (
        <div className="trow" key={a.id}>
          <div>
            <b>{a.name}{!a.active && ' (disabled)'}</b>
            <small>{a.following} following · {a.cleared} cleared · {a.cancelled} cancelled · {rate(a.cleared, a.cancelled)} converted</small>
          </div>
        </div>
      ))}

      <h3>Recent activity</h3>
      {!d.recent.length && <p className="empty">Nothing yet.</p>}
      {d.recent.map((r) => (
        <div className="trow" key={r.id}>
          <div><b>{r.name}</b><small>{r.user} · {LABEL[r.status] || r.status} · {fmt((r.closedAt || r.startedAt) / 1000)}</small></div>
        </div>
      ))}
    </div>
  );
}

function Team({ team, setTeam, st }) {
  const reload = () => api('/admin/users').then((r) => r.success && setTeam(r.users));
  useEffect(() => { reload(); }, []);
  const agents = team.filter((t) => t.role === 'agent');
  const run = async (promise, after) => {
    const r = await promise;
    if (!r.success) alert(r.message || 'Failed');
    else if (after) after();
    reload();
  };
  return (
    <div className="list pad">
      <h3>Coworkers</h3>
      {!agents.length && <p className="empty">No coworkers yet.</p>}
      {agents.map((t) => (
        <div className="trow" key={t.id}>
          <div><b>{t.name}{!t.active && ' (disabled)'}</b><small>{t.phone ? '+' + t.phone : ''} · {t.chats ?? 0} chats</small></div>
          <button className="sm" onClick={() => run(post('/admin/users/' + t.id, { active: !t.active }, 'PATCH'))}>{t.active ? 'Disable' : 'Enable'}</button>
          <button className="sm" onClick={() => confirm('Remove ' + t.name + '? Their chats go back to the inbox.') && run(api('/admin/users/' + t.id, { method: 'DELETE' }))}>Remove</button>
        </div>
      ))}

      <h3>WhatsApp</h3>
      {st.qr && <div className="qr" style={{ padding: '0 0 16px' }}><p>Scan with WhatsApp → Linked devices</p><img src={st.qr} alt="QR code" /></div>}
      <button className="btn alt" onClick={() => confirm('Disconnect WhatsApp and clear stored chats from the server?') && run(post('/whatsapp/logout', {}))}>Disconnect WhatsApp</button>
    </div>
  );
}

function AllChats({ chats, onOpen }) {
  const [view, setView] = useState('all');
  const shown = chats.filter((c) => view === 'all' || (view === 'free' ? !c.assignedTo : !!c.assignedTo));
  const filter = (
    <div className="filt">
      {[['all', 'All'], ['free', 'Unclaimed'], ['taken', 'Handled']].map(([k, l]) => (
        <button key={k} className={'sm' + (view === k ? ' ok' : '')} onClick={() => setView(k)}>{l}</button>
      ))}
    </div>
  );
  return <ChatList chats={shown} onOpen={onOpen} tags filter={filter} empty="No chats." />;
}

export default function AdminPage() {
  const [tab, setTab] = useState('stats');
  return (
    // needsWhatsApp={false}: the admin can open this page even while WhatsApp is not linked yet
    <Shell page="admin" adminOnly needsWhatsApp={false}>
      {({ chats, user, openChat, team, setTeam, st }) => (
        <>
          <Top title={`Admin · ${user.name}`} />
          <div className="tabs">
            {[['stats', 'Dashboard'], ['all', 'All chats'], ['team', 'Team']].map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {tab === 'stats' && <Stats />}
          {tab === 'all' && <AllChats chats={chats} onOpen={openChat} />}
          {tab === 'team' && <Team team={team} setTeam={setTeam} st={st} />}
        </>
      )}
    </Shell>
  );
}
