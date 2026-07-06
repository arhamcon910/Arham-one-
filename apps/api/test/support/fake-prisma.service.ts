import { randomUUID } from 'crypto';

/**
 * Minimal in-memory stand-in for `PrismaService`, used by both the
 * service-level unit tests and the auth e2e test (AUTH-10).
 *
 * It only implements the handful of query shapes the auth module actually
 * issues (`findUnique`, `findMany`, `create`, `update`, `updateMany`,
 * `deleteMany`, `findUniqueOrThrow`, with equality and `lt`/`gt`/`lte`/
 * `gte` range filters, and the `{ increment }` update operator) - it is
 * not a general-purpose Prisma mock. Each test constructs its own
 * instance, so state never leaks between tests.
 */

type WhereCondition = Record<string, unknown>;

function matchesWhere(record: Record<string, any>, where: WhereCondition = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = record[key];

    if (
      condition !== null &&
      typeof condition === 'object' &&
      !(condition instanceof Date)
    ) {
      const range = condition as Record<string, any>;

      if ('lt' in range && !(value < range.lt)) return false;
      if ('lte' in range && !(value <= range.lte)) return false;
      if ('gt' in range && !(value > range.gt)) return false;
      if ('gte' in range && !(value >= range.gte)) return false;

      return true;
    }

    return value === condition;
  });
}

function applyData<T extends Record<string, any>>(
  row: T,
  data: Record<string, any>,
): T {
  const updated: Record<string, any> = { ...row };

  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === 'object' && 'increment' in value) {
      updated[key] = (updated[key] ?? 0) + value.increment;
    } else if (value !== undefined) {
      updated[key] = value;
    }
  }

  return updated as T;
}

class NotFoundError extends Error {
  code = 'P2025';
}

class FakeTable<T extends { id: string }> {
  private readonly rows = new Map<string, T>();

  constructor(private readonly withDefaults: (data: Record<string, any>) => T) {}

  async findUnique({ where }: { where: WhereCondition }): Promise<T | null> {
    if (typeof where.id === 'string') {
      return this.rows.get(where.id) ?? null;
    }

    for (const row of this.rows.values()) {
      if (matchesWhere(row, where)) {
        return row;
      }
    }

    return null;
  }

  async findUniqueOrThrow(args: { where: WhereCondition }): Promise<T> {
    const row = await this.findUnique(args);

    if (!row) {
      throw new NotFoundError('No record found');
    }

    return row;
  }

  async findMany(
    args: { where?: WhereCondition; orderBy?: Record<string, 'asc' | 'desc'> } = {},
  ): Promise<T[]> {
    let rows = [...this.rows.values()].filter((row) =>
      matchesWhere(row, args.where ?? {}),
    );

    if (args.orderBy) {
      const [field, direction] = Object.entries(args.orderBy)[0];

      rows = rows.sort((a: any, b: any) => {
        const diff =
          new Date(a[field]).getTime() - new Date(b[field]).getTime();

        return direction === 'desc' ? -diff : diff;
      });
    }

    return rows;
  }

  async create({ data }: { data: Record<string, any> }): Promise<T> {
    const row = this.withDefaults(data);
    this.rows.set(row.id, row);
    return row;
  }

  async update({
    where,
    data,
  }: {
    where: WhereCondition;
    data: Record<string, any>;
  }): Promise<T> {
    const row = await this.findUnique({ where });

    if (!row) {
      throw new NotFoundError('Record to update not found');
    }

    const updated = applyData(row, data);
    this.rows.set(updated.id, updated);
    return updated;
  }

  async updateMany({
    where = {},
    data,
  }: {
    where?: WhereCondition;
    data: Record<string, any>;
  }): Promise<{ count: number }> {
    let count = 0;

    for (const row of this.rows.values()) {
      if (matchesWhere(row, where)) {
        const updated = applyData(row, data);
        this.rows.set(updated.id, updated);
        count += 1;
      }
    }

    return { count };
  }

  async deleteMany(
    args: { where?: WhereCondition } = {},
  ): Promise<{ count: number }> {
    let count = 0;

    for (const [id, row] of this.rows.entries()) {
      if (matchesWhere(row, args.where ?? {})) {
        this.rows.delete(id);
        count += 1;
      }
    }

    return { count };
  }

  /** Test helper: seed a row directly, bypassing default-filling. */
  seed(row: T): T {
    this.rows.set(row.id, row);
    return row;
  }
}

export class FakePrismaService {
  readonly organization = new FakeTable<any>((data) => ({
    id: randomUUID(),
    email: null,
    phone: null,
    website: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  }));

  readonly user = new FakeTable<any>((data) => ({
    id: randomUUID(),
    phone: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  }));

  readonly session = new FakeTable<any>((data) => ({
    id: randomUUID(),
    deviceName: null,
    ipAddress: null,
    userAgent: null,
    lastActivity: new Date(),
    lastIpAddress: null,
    lastUserAgent: null,
    rotationCounter: 0,
    revoked: false,
    revokedReason: null,
    revokedAt: null,
    createdAt: new Date(),
    ...data,
  }));

  async $connect(): Promise<void> {}

  async $disconnect(): Promise<void> {}
}
