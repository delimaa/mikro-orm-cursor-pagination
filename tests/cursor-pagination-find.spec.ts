import {
  Entity,
  IntegerType,
  ManyToOne,
  MikroORM,
  PrimaryKey,
  Property,
  QueryOrder,
  QueryOrderMap,
  Ref,
  ref,
} from '@mikro-orm/core';
import { defineConfig, EntityManager } from '@mikro-orm/sqlite';
import { Cursor } from '../src/cursor';
import { cursorPaginationFind } from '../src';

@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @Property({ type: IntegerType, nullable: true })
  age!: number | null;

  // Relationship setup using `Ref` type
  @ManyToOne(() => User, { nullable: true, ref: true })
  parent1: Ref<User> | null;

  // Relationship setup without `Ref` type
  @ManyToOne(() => User, { nullable: true })
  parent2: User | null;

  constructor(props: { id: number; name: string; age?: number | null; parent1?: User | null; parent2?: User | null }) {
    this.id = props.id;
    this.name = props.name;
    this.age = props.age ?? null;
    this.parent1 = props.parent1 ? ref(props.parent1) : null;
    this.parent2 = props.parent2 ?? null;
  }
}

let orm: MikroORM;
let em: EntityManager;
let u1: User;
let u2: User;
let u3: User;
let u4: User;
let u5: User;

beforeAll(async () => {
  orm = await MikroORM.init(
    defineConfig({
      type: 'sqlite',
      dbName: ':memory:',
      entities: [User],
      allowGlobalContext: true,
    }),
  );
  em = orm.em as EntityManager;

  await orm.schema.createSchema();

  u1 = em.create(User, { id: 1, name: 'John', age: 20 });
  u2 = em.create(User, { id: 2, name: 'Joe', age: null });
  u3 = em.create(User, { id: 3, name: 'John', age: 20 });
  u4 = em.create(User, { id: 4, name: 'John', age: null });
  u5 = em.create(User, { id: 5, name: 'Joe', age: 20 });

  u1.parent1 = ref(u2);
  u1.parent2 = u4;

  await em.flush();
});

afterAll(async () => {
  await orm.close();
});

afterEach(() => {
  em.clear();
});

describe('browse data using pagination', () => {
  /*
  Joe, null, 2
  Joe, 20, 5
  John, null, 4
  John, 20, 1
  John, 20, 3
  */
  const orderBy = [{ name: QueryOrder.ASC }, { age: QueryOrder.DESC_NULLS_FIRST }, { id: QueryOrder.ASC }];

  let cursor: string;

  test('Browse page 1', async () => {
    const page1 = await cursorPaginationFind(em, User, {
      first: 2,
      orderBy,
    });

    expect(page1.totalCount).toBe(5);
    expect(page1.edges).toHaveLength(2);
    expect(page1.edges[0].node.id).toBe(u2.id);
    expect(page1.edges[0].cursor).toBe(Cursor.fromEntity<User>(u2, orderBy).toBase64());
    expect(page1.edges[1].node.id).toBe(u5.id);
    expect(page1.edges[1].cursor).toBe(Cursor.fromEntity<User>(u5, orderBy).toBase64());
    expect(page1.pageInfo.hasNextPage).toBe(true);
    expect(page1.pageInfo.hasPreviousPage).toBe(false);
    expect(page1.pageInfo.startCursor).toBe(Cursor.fromEntity<User>(u2, orderBy).toBase64());
    expect(page1.pageInfo.endCursor).toBe(Cursor.fromEntity<User>(u5, orderBy).toBase64());

    cursor = page1.pageInfo.endCursor!;
  });

  it('Browse forward to page 2', async () => {
    const page2 = await cursorPaginationFind(em, User, {
      first: 2,
      after: cursor,
    });

    expect(page2.totalCount).toBe(5);
    expect(page2.edges).toHaveLength(2);
    expect(page2.edges[0].node.id).toBe(u4.id);
    expect(page2.edges[0].cursor).toBe(Cursor.fromEntity<User>(u4, orderBy).toBase64());
    expect(page2.edges[1].node.id).toBe(u1.id);
    expect(page2.edges[1].cursor).toBe(Cursor.fromEntity<User>(u1, orderBy).toBase64());
    expect(page2.pageInfo.hasNextPage).toBe(true);
    expect(page2.pageInfo.hasPreviousPage).toBe(true);
    expect(page2.pageInfo.startCursor).toBe(Cursor.fromEntity<User>(u4, orderBy).toBase64());
    expect(page2.pageInfo.endCursor).toBe(Cursor.fromEntity<User>(u1, orderBy).toBase64());

    cursor = page2.pageInfo.endCursor!;
  });

  test('Browse forward to page 3', async () => {
    const page3 = await cursorPaginationFind(em, User, {
      first: 2,
      after: cursor,
    });

    expect(page3.totalCount).toBe(5);
    expect(page3.edges).toHaveLength(1);
    expect(page3.edges[0].cursor).toBe(Cursor.fromEntity<User>(u3, orderBy).toBase64());
    expect(page3.edges[0].node.id).toBe(u3.id);
    expect(page3.pageInfo.hasNextPage).toBe(false);
    expect(page3.pageInfo.hasPreviousPage).toBe(true);
    expect(page3.pageInfo.startCursor).toBe(Cursor.fromEntity<User>(u3, orderBy).toBase64());
    expect(page3.pageInfo.endCursor).toBe(page3.pageInfo.startCursor);

    // Get startCursor to make it evident that we are browsing in backward direction next.
    // However we could also use the endCursor because page3 has only one item.
    cursor = page3.pageInfo.startCursor!;
  });

  test('Browse back to page 2', async () => {
    const page4 = await cursorPaginationFind(em, User, {
      last: 2,
      before: cursor,
    });

    expect(page4.totalCount).toBe(5);
    expect(page4.edges).toHaveLength(2);
    expect(page4.edges[0].node.id).toBe(u4.id);
    expect(page4.edges[0].cursor).toBe(Cursor.fromEntity<User>(u4, orderBy).toBase64());
    expect(page4.edges[1].node.id).toBe(u1.id);
    expect(page4.edges[1].cursor).toBe(Cursor.fromEntity<User>(u1, orderBy).toBase64());
    expect(page4.pageInfo.hasPreviousPage).toBe(true);
    expect(page4.pageInfo.hasNextPage).toBe(true);
    expect(page4.pageInfo.startCursor).toBe(Cursor.fromEntity<User>(u4, orderBy).toBase64());
    expect(page4.pageInfo.endCursor).toBe(Cursor.fromEntity<User>(u1, orderBy).toBase64());

    cursor = page4.pageInfo.startCursor!;
  });

  test('Browse back to page 1', async () => {
    const page5 = await cursorPaginationFind(em, User, {
      last: 2,
      before: cursor,
    });

    expect(page5.totalCount).toBe(5);
    expect(page5.edges).toHaveLength(2);
    expect(page5.edges[0].node.id).toBe(u2.id);
    expect(page5.edges[0].cursor).toBe(Cursor.fromEntity<User>(u2, orderBy).toBase64());
    expect(page5.edges[1].node.id).toBe(u5.id);
    expect(page5.edges[1].cursor).toBe(Cursor.fromEntity<User>(u5, orderBy).toBase64());
    expect(page5.pageInfo.hasPreviousPage).toBe(false);
    expect(page5.pageInfo.hasNextPage).toBe(true);
    expect(page5.pageInfo.startCursor).toBe(Cursor.fromEntity<User>(u2, orderBy).toBase64());
    expect(page5.pageInfo.endCursor).toBe(Cursor.fromEntity<User>(u5, orderBy).toBase64());
  });
});

test('Empty page if no data', async () => {
  const page = await cursorPaginationFind(em, User, {
    first: 10,
    after: Cursor.fromEntity<User>(u5, {
      id: QueryOrder.ASC,
    }).toBase64(),
  });

  expect(page.totalCount).toBe(5);
  expect(page.edges).toHaveLength(0);
  expect(page.pageInfo.hasNextPage).toBe(false);
  expect(page.pageInfo.startCursor).toBeUndefined();
  expect(page.pageInfo.endCursor).toBeUndefined();
});

test('Merge where clauses', async () => {
  const page = await cursorPaginationFind(
    em,
    User,
    {
      first: 10,
      orderBy: { id: QueryOrder.ASC },
    },
    {
      age: null,
    },
  );

  expect(page.totalCount).toBe(2);
  expect(page.edges).toHaveLength(2);
  expect(page.edges[0].node.id).toBe(2);
  expect(page.edges[0].cursor).toBe(Cursor.fromEntity<User>(u2, { id: QueryOrder.ASC }).toBase64());
  expect(page.edges[1].node.id).toBe(4);
  expect(page.edges[1].cursor).toBe(Cursor.fromEntity<User>(u4, { id: QueryOrder.ASC }).toBase64());
  expect(page.pageInfo.hasNextPage).toBe(false);
  expect(page.pageInfo.startCursor).toBe(Cursor.fromEntity<User>(u2, { id: QueryOrder.ASC }).toBase64());
  expect(page.pageInfo.endCursor).toBe(Cursor.fromEntity<User>(u4, { id: QueryOrder.ASC }).toBase64());
});

test('Merge options', async () => {
  const page = await cursorPaginationFind(
    em,
    User,
    {
      first: 1,
      orderBy: { id: QueryOrder.ASC },
    },
    {},
    {
      populate: ['parent1', 'parent2'],
    },
  );

  expect(page.edges[0].node.id).toBe(u1.id);
  expect(page.edges[0].node.parent1!.$.name).toBe(u2.name);
  expect(page.edges[0].node.parent2!.name).toBe(u4.name);
});

describe('pagination params validation', () => {
  test('Not allow both after and before', async () => {
    await expect(
      cursorPaginationFind(em, User, {
        orderBy: {
          id: QueryOrder.ASC,
        },
        first: 1,
        after: 'some_cursor',
        before: 'some_cursor',
      }),
    ).rejects.toThrow();
  });

  test('Not allow both first and last', async () => {
    await expect(
      cursorPaginationFind(em, User, {
        orderBy: {
          id: QueryOrder.ASC,
        },
        first: 1,
        last: 1,
      }),
    ).rejects.toThrow();
  });

  test('Not allow first < 0', async () => {
    await expect(
      cursorPaginationFind(em, User, {
        orderBy: {
          id: QueryOrder.ASC,
        },
        first: -1,
      }),
    ).rejects.toThrow();
  });

  test('Not allow last < 0', async () => {
    await expect(
      cursorPaginationFind(em, User, {
        orderBy: {
          id: QueryOrder.ASC,
        },
        last: -1,
        before: 'some_cursor',
      }),
    ).rejects.toThrow();
  });
});

test('supports passing `orderBy` with `after` or `before` cursors. `orderBy` is ignored when their is an `after` or `before` cursor', async () => {
  let first: number | undefined = 1;
  let after: string | undefined;
  let last: number | undefined;
  let before: string | undefined;
  let orderBy: QueryOrderMap<User> = { age: QueryOrder.ASC_NULLS_FIRST, id: QueryOrder.ASC };

  let page = await cursorPaginationFind(em, User, {
    first,
    after,
    last,
    before,
    orderBy,
  });

  expect(page.edges[0].node.id).toBe(u2.id);

  after = page.pageInfo.endCursor;

  page = await cursorPaginationFind(em, User, {
    first,
    after,
    last,
    before,
    orderBy,
  });

  expect(page.edges[0].node.id).toBe(u4.id);

  first = undefined;
  after = undefined;
  last = 1;
  before = page.pageInfo.startCursor;

  page = await cursorPaginationFind(em, User, {
    first,
    after,
    last,
    before,
    orderBy,
  });

  expect(page.edges[0].node.id).toBe(u2.id);
});

test('orderBy must be a non-empty object or array', async () => {
  await expect(
    cursorPaginationFind(em, User, {
      first: 1,
      orderBy: {},
    }),
  ).rejects.toThrow(new Error(`'orderBy' must be a non-empty object or array`));

  await expect(
    cursorPaginationFind(em, User, {
      first: 1,
      orderBy: [],
    }),
  ).rejects.toThrow(new Error(`'orderBy' must be a non-empty object or array`));
});

test('pagination params supports null or undefined the same way', async () => {
  let first: number | null | undefined = 1;
  let after: string | null | undefined = null;
  let last: number | null | undefined = null;
  let before: string | null | undefined = null;
  let orderBy: QueryOrderMap<User> = { age: QueryOrder.ASC_NULLS_FIRST, id: QueryOrder.ASC };

  let page = await cursorPaginationFind(em, User, {
    first,
    after,
    last,
    before,
    orderBy,
  });

  expect(page.edges[0].node.id).toBe(u2.id);

  after = page.pageInfo.endCursor;

  page = await cursorPaginationFind(em, User, {
    first,
    after,
    last,
    before,
    orderBy,
  });

  expect(page.edges[0].node.id).toBe(u4.id);

  first = null;
  after = null;
  last = 1;
  before = page.pageInfo.startCursor;

  page = await cursorPaginationFind(em, User, {
    first,
    after,
    last,
    before,
    orderBy,
  });

  expect(page.edges[0].node.id).toBe(u2.id);
});
