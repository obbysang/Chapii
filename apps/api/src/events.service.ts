import { Injectable } from "@nestjs/common";
import { Subject } from "rxjs";

export interface VaultEvent {
  vaultId: string;
  type: string;
  data: unknown;
}

@Injectable()
export class EventsService {
  private streams = new Map<string, Set<{ id: string; write: (line: string) => void }>>();
  private nextId = 1;

  subscribe(vaultId: string, write: (line: string) => void): () => void {
    const id = String(this.nextId++);
    const set = this.streams.get(vaultId) ?? new Set();
    set.add({ id, write });
    this.streams.set(vaultId, set);
    write(`id: ${id}\nevent: connected\ndata: {"vaultId":"${vaultId}"}\n\n`);
    return () => set.delete({ id, write });
  }

  emit(evt: VaultEvent): void {
    const set = this.streams.get(evt.vaultId);
    if (!set) return;
    const line = `event: ${evt.type}\ndata: ${JSON.stringify(evt.data)}\n\n`;
    for (const s of set) s.write(line);
  }

  readonly bus = new Subject<VaultEvent>();
}
