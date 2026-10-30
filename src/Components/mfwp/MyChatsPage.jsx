import React from 'react';
import { Shell, Top, ChatList } from './common';

// Route: /mine
// The chats this person has claimed. Reply here; use the ⋮ menu inside a chat for
// "Order cleared", "Cancelled", "Transfer to…" or "Back to inbox".
export default function MyChatsPage() {
  return (
    <Shell page="mine">
      {({ chats, user, openChat }) => {
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
              empty="You are not handling any chats. Claim one from the Inbox, or tap + to message a number."
            />
          </>
        );
      }}
    </Shell>
  );
}
