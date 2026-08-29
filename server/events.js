// Server-Sent Events (SSE) Client Hub
const clients = new Set();

export function addClient(res) {
  clients.add(res);
  res.on('close', () => {
    clients.delete(res);
  });
}

export function broadcastEvent(eventType, data = {}) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify({ timestamp: Math.floor(Date.now() / 1000), ...data })}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch (err) {
      clients.delete(client);
    }
  }
}
