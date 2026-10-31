import React from 'react';
import { Shell, Top, ChatList, ChatActions } from './common';

// Route: /minewp   (same login as /inbox)
// The chats this person has claimed. Reply here. Each row has quick buttons
// (Completed / Cancelled / Inbox / Transfer) and the ⋮ menu inside a chat has the same options.
export default function MyChatsPage() {
  return (
    <Shell page="mine">
      {({ chats, user, team, openChat }) => {
        const newChat = () => {
          const d = (prompt('Phone number with country code (for example 919876543210)') || '').replace(/\D/g, '');
          if (d.length < 10) return;
          const jid = (d.length === 10 ? '91' + d : d) + '@s.whatsapp.net';
          openChat(chats.find((c) => c.id === jid) || { id: 'new:' + d, isNew: true, number: d, name: '+' + d, isGroup: false });
        };
        return (
          <>
            <Top title={`My chats · ${user.name}`} />
            <ChatList
              chats={chats.filter((c) => c.assignedTo?.id === user.id)}
              onOpen={openChat}
              onNew={newChat}
              rowExtra={(c) => <ChatActions chat={c} team={team} />}
              empty="You are not handling any chats. Claim one from the Inbox, or tap + to message a number."
            />
          </>
        );
      }}
    </Shell>
  );
}
