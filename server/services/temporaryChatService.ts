export interface TempMessage {
  id: string;
  connectionId: string;
  senderId: string;
  recipientId: string;
  text: string;
  createdAt: string;
  read: boolean;
}

// In-memory store: connectionId -> messages
const messageStore: Record<string, TempMessage[]> = {};

// Clean up messages older than 24 hours
const EXPIRY_MS = 24 * 60 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  for (const connId in messageStore) {
    messageStore[connId] = messageStore[connId].filter(
      (m) => now - new Date(m.createdAt).getTime() < EXPIRY_MS
    );
    if (messageStore[connId].length === 0) {
      delete messageStore[connId];
    }
  }
}

// Run cleanup every hour
setInterval(cleanup, 60 * 60 * 1000);

export class TemporaryChatService {
  static sendMessage(params: {
    connectionId: string;
    senderId: string;
    recipientId: string;
    text: string;
  }): TempMessage {
    if (!messageStore[params.connectionId]) {
      messageStore[params.connectionId] = [];
    }

    const message: TempMessage = {
      id: `msg_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      connectionId: params.connectionId,
      senderId: params.senderId,
      recipientId: params.recipientId,
      text: params.text,
      createdAt: new Date().toISOString(),
      read: false,
    };

    messageStore[params.connectionId].push(message);
    return message;
  }

  static getMessages(connectionId: string): TempMessage[] {
    return messageStore[connectionId] || [];
  }

  static markRead(connectionId: string, userId: string) {
    if (!messageStore[connectionId]) return;
    for (const msg of messageStore[connectionId]) {
      if (msg.recipientId === userId) {
        msg.read = true;
      }
    }
  }
}
