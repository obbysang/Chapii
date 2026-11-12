import type { FastifyReply } from 'fastify';

interface Client {
  id: number;
  vaultId: string;
  reply: FastifyReply;
  heartbeat: NodeJS.Timeout;
}

let nextId = 1;

/** Minimal, dependency-free server-sent events hub. */
export class SseHub {
  private readonly clients = new Map<number, Client>();

  subscribe(vaultId: string, reply: FastifyReply): number {
    const id = nextId++;
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });
    reply.hijack();
    reply.raw.write(`retry: 3000\n\n`);
    reply.raw.write(
      `event: connected\ndata: ${JSON.stringify({ vaultId, at: new Date().toISOString() })}\n\n`,
    );
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        // The close handler removes the client.
      }
    }, 20_000);
    this.clients.set(id, { id, vaultId, reply, heartbeat });
    reply.raw.on('close', () => this.remove(id));
    return id;
  }

  publish(vaultId: string, event: string, data: Record<string, unknown>): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify({
      ...data,
      _ts: new Date().toISOString(),
    })}\n\n`;
    for (const client of this.clients.values()) {
      if (client.vaultId !== vaultId) continue;
      try {
        client.reply.raw.write(payload);
      } catch {
        this.remove(client.id);
      }
    }
  }

  remove(id: number): void {
    const client = this.clients.get(id);
    if (!client) return;
    clearInterval(client.heartbeat);
    this.clients.delete(id);
    try {
      client.reply.raw.end();
    } catch {
      // Already closed.
    }
  }

  closeAll(): void {
    for (const id of [...this.clients.keys()]) this.remove(id);
  }

  count(vaultId?: string): number {
    if (!vaultId) return this.clients.size;
    return [...this.clients.values()].filter((c) => c.vaultId === vaultId).length;
  }
}
