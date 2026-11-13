import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

/**
 * A tiny in-memory stand-in for the Prisma client, covering exactly the
 * queries the API services issue. It lets route-level tests run with no
 * database, no Docker and no network, which keeps `pnpm test` hermetic.
 *
 * This is a test double, not a Prisma reimplementation: unknown query shapes
 * throw instead of silently returning nothing.
 */
type Row = Record<string, any>;
type Where = Record<string, any> | undefined;

const DEFAULT_ROW: Record<string, () => Row> = {
  vault: () => ({
    cursorSeq: 0n,
    health: 'ok',
    contractVersion: null,
    label: null,
    localState: null,
    lastIndexedAt: null,
  }),
  agent: () => ({ violations: 0, allowanceYocto: null }),
  paymentRequest: () => ({
    agentId: null,
    destAsset: null,
    memo: null,
    reason: null,
    txHash: null,
    depositAddress: null,
    settlementRef: null,
    decidedAt: null,
    lastChangeSeq: 0n,
  }),
  crosschainJob: () => ({
    state: 'QUEUED',
    verification: 'UNVERIFIED',
    attempts: 0,
    quoteJson: null,
    depositAddress: null,
    fundTxHash: null,
    statusJson: null,
    lastError: null,
    nextRunAt: new Date(),
  }),
  harnessRun: () => ({
    status: 'QUEUED',
    total: 0,
    passed: 0,
    startedAt: null,
    finishedAt: null,
    summaryJson: null,
    requesterIp: null,
  }),
  harnessResult: () => ({ txHash: null, notes: null, invariantsOk: true, durationMs: 0 }),
};

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !(value instanceof Date) && !(value instanceof Prisma.Decimal);
}

function compare(a: any, b: any): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'bigint' || typeof b === 'bigint') {
    const left = BigInt(a);
    const right = BigInt(b);
    return left === right ? 0 : left < right ? -1 : 1;
  }
  if (a === b) return 0;
  return (a as any) < (b as any) ? -1 : 1;
}

function matchesValue(value: any, condition: any): boolean {
  if (condition === null) return value === null || value === undefined;
  if (condition instanceof Date) {
    return value instanceof Date && value.getTime() === condition.getTime();
  }
  if (isPlainObject(condition)) {
    if ('in' in condition) return (condition.in as any[]).some((item) => matchesValue(value, item));
    if ('notIn' in condition) return !(condition.notIn as any[]).some((item) => matchesValue(value, item));
    if ('lt' in condition) return compare(value, condition.lt) < 0;
    if ('lte' in condition) return compare(value, condition.lte) <= 0;
    if ('gt' in condition) return compare(value, condition.gt) > 0;
    if ('gte' in condition) return compare(value, condition.gte) >= 0;
    if ('equals' in condition) return matchesValue(value, condition.equals);
    if ('not' in condition) return !matchesValue(value, condition.not);
    if ('contains' in condition) {
      const haystack = String(value ?? '');
      const needle = String(condition.contains);
      return condition.mode === 'insensitive'
        ? haystack.toLowerCase().includes(needle.toLowerCase())
        : haystack.includes(needle);
    }
    throw new Error(`fake-db: unsupported filter ${JSON.stringify(condition)}`);
  }
  if (typeof value === 'bigint' || typeof condition === 'bigint') {
    return BigInt(value) === BigInt(condition);
  }
  return value === condition;
}

/** Flatten Prisma's compound unique keys into plain column filters. */
function normalizeWhere(where: Where): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(where ?? {})) {
    if (key === 'vaultId_publicKey') {
      out.vaultId = value.vaultId;
      out.publicKey = value.publicKey;
    } else if (key === 'vaultId_onchainId') {
      out.vaultId = value.vaultId;
      out.onchainId = value.onchainId;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function matches(row: Row, where: Where): boolean {
  const normalized = normalizeWhere(where);
  return Object.entries(normalized).every(([key, condition]) => {
    if (key === 'AND') return (condition as Where[]).every((entry) => matches(row, entry));
    if (key === 'OR') return (condition as Where[]).some((entry) => matches(row, entry));
    if (key === 'NOT') return !matches(row, condition as Where);
    return matchesValue(row[key], condition);
  });
}

function pick(row: Row, select: Record<string, boolean>): Row {
  const out: Row = {};
  for (const [key, include] of Object.entries(select)) {
    if (include) out[key] = row[key];
  }
  return out;
}

function sortRows(rows: Row[], orderBy: Row | Row[] | undefined): Row[] {
  if (!orderBy) return rows;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const clause of clauses) {
      for (const [field, direction] of Object.entries(clause)) {
        const delta = compare(a[field], b[field]);
        if (delta !== 0) return direction === 'desc' ? -delta : delta;
      }
    }
    return 0;
  });
}

function distinctRows(rows: Row[], distinct: string[] | undefined): Row[] {
  if (!distinct) return rows;
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = distinct.map((field) => String(row[field])).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class FakeDb {
  readonly tables: Record<string, Row[]> = {
    vault: [],
    agent: [],
    paymentRequest: [],
    crosschainJob: [],
    harnessRun: [],
    harnessResult: [],
  };

  readonly vault = new FakeModel(this, 'vault');
  readonly agent = new FakeModel(this, 'agent');
  readonly paymentRequest = new FakeModel(this, 'paymentRequest');
  readonly crosschainJob = new FakeModel(this, 'crosschainJob');
  readonly harnessRun = new FakeModel(this, 'harnessRun');
  readonly harnessResult = new FakeModel(this, 'harnessResult');

  async $queryRaw(): Promise<Row[]> {
    return [{ ok: 1 }];
  }

  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}
}

class FakeModel {
  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  private rows(): Row[] {
    return this.db.tables[this.table]!;
  }

  private defaults(data: Row): Row {
    const now = new Date();
    const base: Row = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...(DEFAULT_ROW[this.table]?.() ?? {}),
      ...data,
    };
    return base;
  }

  private hydrate(row: Row, include: Row | undefined): Row {
    const out = { ...row };
    if (!include) return out;
    if (this.table === 'vault') {
      if (include.agents) {
        out.agents = this.db.tables.agent!.filter((agent) => agent.vaultId === row.id).map((a) => ({ ...a }));
      }
      if (include.requests) {
        const spec = include.requests === true ? {} : include.requests;
        let requests = this.db.tables.paymentRequest!.filter(
          (request) => request.vaultId === row.id && matches(request, spec.where),
        );
        requests = sortRows(requests, spec.orderBy);
        out.requests = spec.select ? requests.map((r) => pick(r, spec.select)) : requests.map((r) => ({ ...r }));
      }
    }
    if (this.table === 'harnessRun' && include.results) {
      out.results = this.db.tables.harnessResult!.filter((result) => result.runId === row.id).map((r) => ({ ...r }));
    }
    if (this.table === 'paymentRequest') {
      if (include.agent) {
        out.agent = row.agentId
          ? this.db.tables.agent!.find((agent) => agent.id === row.agentId) ?? null
          : null;
      }
      if (include.job) {
        out.job = this.db.tables.crosschainJob!.find((job) => job.requestId === row.id) ?? null;
      }
    }
    return out;
  }

  async findUnique(args: { where: Where; include?: Row; select?: Row }): Promise<Row | null> {
    const row = this.rows().find((candidate) => matches(candidate, args.where));
    if (!row) return null;
    const hydrated = this.hydrate(row, args.include);
    return args.select ? pick(hydrated, args.select) : hydrated;
  }

  async findFirst(args: { where?: Where; include?: Row; orderBy?: Row | Row[] } = {}): Promise<Row | null> {
    const row = sortRows(
      this.rows().filter((candidate) => matches(candidate, args.where)),
      args.orderBy,
    )[0];
    return row ? this.hydrate(row, args.include) : null;
  }

  async findMany(
    args: {
      where?: Where;
      include?: Row;
      select?: Row;
      orderBy?: Row | Row[];
      take?: number;
      skip?: number;
      distinct?: string[];
    } = {},
  ): Promise<Row[]> {
    let rows = this.rows().filter((candidate) => matches(candidate, args.where));
    rows = distinctRows(rows, args.distinct);
    rows = sortRows(rows, args.orderBy);
    if (args.skip) rows = rows.slice(args.skip);
    if (args.take != null) rows = rows.slice(0, args.take);
    const hydrated = rows.map((row) => this.hydrate(row, args.include));
    return args.select ? hydrated.map((row) => pick(row, args.select)) : hydrated;
  }

  async count(args: { where?: Where } = {}): Promise<number> {
    return this.rows().filter((candidate) => matches(candidate, args.where)).length;
  }

  async aggregate(args: { where?: Where; _sum?: Row; _max?: Row; _count?: Row } = {}): Promise<Row> {
    const rows = this.rows().filter((candidate) => matches(candidate, args.where));
    const result: Row = {};
    if (args._sum) {
      result._sum = {};
      for (const field of Object.keys(args._sum)) {
        const total = rows.reduce((sum, row) => {
          const raw = row[field];
          if (raw == null) return sum;
          const text =
            raw instanceof Prisma.Decimal ? raw.toFixed(0) : typeof raw === 'bigint' ? raw.toString() : String(raw);
          return sum + BigInt(text);
        }, 0n);
        result._sum[field] = rows.length > 0 ? new Prisma.Decimal(total.toString()) : null;
      }
    }
    if (args._max) {
      result._max = {};
      for (const field of Object.keys(args._max)) {
        const values = rows.map((row) => row[field]).filter((value) => value != null);
        result._max[field] = values.length > 0 ? values.reduce((a, b) => (compare(a, b) >= 0 ? a : b)) : null;
      }
    }
    if (args._count) {
      result._count = rows.length;
    }
    return result;
  }

  async create(args: { data: Row; include?: Row; select?: Row }): Promise<Row> {
    const row = this.defaults(args.data);
    this.rows().push(row);
    const hydrated = this.hydrate(row, args.include);
    return args.select ? pick(hydrated, args.select) : hydrated;
  }

  async update(args: { where: Where; data: Row; include?: Row; select?: Row }): Promise<Row> {
    const row = this.rows().find((candidate) => matches(candidate, args.where));
    if (!row) throw new Error(`fake-db: ${this.table} row not found for update`);
    Object.assign(row, args.data, { updatedAt: new Date() });
    const hydrated = this.hydrate(row, args.include);
    return args.select ? pick(hydrated, args.select) : hydrated;
  }

  async upsert(args: { where: Where; create: Row; update: Row; include?: Row; select?: Row }): Promise<Row> {
    const row = this.rows().find((candidate) => matches(candidate, args.where));
    if (row) {
      Object.assign(row, args.update, { updatedAt: new Date() });
      const hydrated = this.hydrate(row, args.include);
      return args.select ? pick(hydrated, args.select) : hydrated;
    }
    const seed = { ...normalizeWhere(args.where), ...args.create };
    return this.create({ data: seed, include: args.include, select: args.select });
  }

  async deleteMany(args: { where?: Where } = {}): Promise<{ count: number }> {
    const before = this.rows().length;
    this.db.tables[this.table] = this.rows().filter((row) => !matches(row, args.where));
    return { count: before - this.db.tables[this.table]!.length };
  }
}
