import React from 'react';
import { Shell, Top, ChatList } from './common';

// Route: /inbox   (same login as /minewp)
// Common to everyone: every unread chat. "New" = nobody has taken it yet,
// otherwise the row shows who is handling it. Open a chat and press "Claim this chat" to take it.
export default function InboxPage() {
  return (
    <Shell page="inbox">
      {({ chats, user, openChat }) => (
        <>
          <Top title={`Inbox · ${user.name}`} />
          <ChatList
            chats={chats.filter((c) => c.unreadCount > 0)}
            onOpen={openChat}
            tags
            empty="No unread messages. 🎉"
          />
        </>
      )}
    </Shell>
  );
}
