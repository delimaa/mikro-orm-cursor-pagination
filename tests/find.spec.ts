import { MikroORM, QueryOrderMap, ref } from '@mikro-orm/core';
import { defineConfig, EntityManager } from '@mikro-orm/sqlite';
import { Cursor } from '../src/cursor';
import { cursorPaginationFind } from '../src/find';
import { User } from './user';

describe('cursorPaginationFind', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let user1: User;
  let user2: User;
  let user3: User;
  let user4: User;
  let user5: User;

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

    await em.raw(`
    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(255) NOT NULL,
      age INTEGER NOT NULL,
      parent1_id INTEGER,
      parent2_id INTEGER,
      FOREIGN KEY (parent1_id) REFERENCES user(id),
      FOREIGN KEY (parent2_id) REFERENCES user(id)
    );
    `);

    user1 = em.create(User, { id: 1, name: 'John', age: 21 });
    user2 = em.create(User, { id: 2, name: 'Joe', age: 20 });
    user3 = em.create(User, { id: 3, name: 'John', age: 20 });
    user4 = em.create(User, { id: 4, name: 'Joe', age: 20 });
    user5 = em.create(User, { id: 5, name: 'Joe', age: 21 });

    user1.parent1 = ref(user2);
    user1.parent2 = user3;

    await em.flush();
  });

  afterAll(async () => {
    await orm.close();
  });

  describe('browse data using pagination', () => {
    let cursor: string;

    describe('browsing in forward direction', () => {
      it('should browse page 1', async () => {
        const page1 = await cursorPaginationFind(em, User, {
          first: 2,
          orderBy: [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }],
        });

        expect(page1.totalCount).toBe(5);
        expect(page1.edges).toHaveLength(2);
        expect(page1.edges[0].cursor).toBe(
          Cursor.fromEntity<User>(user5, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );
        expect(page1.edges[0].node.id).toBe(user5.id);
        expect(page1.edges[1].cursor).toBe(
          Cursor.fromEntity<User>(user2, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );
        expect(page1.edges[1].node.id).toBe(user2.id);
        expect(page1.pageInfo.hasNextPage).toBe(true);
        expect(page1.pageInfo.hasPreviousPage).toBe(false);
        expect(page1.pageInfo.startCursor).toBe(
          Cursor.fromEntity<User>(user5, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );
        expect(page1.pageInfo.endCursor).toBe(
          Cursor.fromEntity<User>(user2, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );

        cursor = page1.pageInfo.endCursor!;
      });

      it('should browse page 2', async () => {
        const page2 = await cursorPaginationFind(em, User, {
          first: 2,
          after: cursor,
        });

        expect(page2.totalCount).toBe(5);
        expect(page2.edges).toHaveLength(2);
        expect(page2.edges[0].cursor).toBe(
          Cursor.fromEntity<User>(user4, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );
        expect(page2.edges[0].node.id).toBe(user4.id);
        expect(page2.edges[1].cursor).toBe(
          Cursor.fromEntity<User>(user1, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );
        expect(page2.edges[1].node.id).toBe(user1.id);
        expect(page2.pageInfo.hasNextPage).toBe(true);
        expect(page2.pageInfo.hasPreviousPage).toBe(true);
        expect(page2.pageInfo.startCursor).toBe(
          Cursor.fromEntity<User>(user4, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );
        expect(page2.pageInfo.endCursor).toBe(
          Cursor.fromEntity<User>(user1, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );

        cursor = page2.pageInfo.endCursor!;
      });

      it('should browse page 3', async () => {
        const page3 = await cursorPaginationFind(em, User, {
          first: 2,
          after: cursor,
        });

        expect(page3.totalCount).toBe(5);
        expect(page3.edges).toHaveLength(1);
        expect(page3.edges[0].cursor).toBe(
          Cursor.fromEntity<User>(user3, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );
        expect(page3.edges[0].node.id).toBe(user3.id);
        expect(page3.pageInfo.hasNextPage).toBe(false);
        expect(page3.pageInfo.hasPreviousPage).toBe(true);
        expect(page3.pageInfo.startCursor).toBe(
          Cursor.fromEntity<User>(user3, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );
        expect(page3.pageInfo.endCursor).toBe(page3.pageInfo.startCursor);

        // Get startCursor to make it evident that we are browsing in backward direction next.
        // However we could also use the endCursor because page3 has only one item.
        cursor = page3.pageInfo.startCursor!;
      });
    });

    describe('browsing in backward direction', () => {
      it('should browse page 2', async () => {
        const page4 = await cursorPaginationFind(em, User, {
          last: 2,
          before: cursor,
        });

        expect(page4.totalCount).toBe(5);
        expect(page4.edges).toHaveLength(2);
        expect(page4.edges[0].cursor).toBe(
          Cursor.fromEntity<User>(user4, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );
        expect(page4.edges[0].node.id).toBe(user4.id);
        expect(page4.edges[1].cursor).toBe(
          Cursor.fromEntity<User>(user1, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );
        expect(page4.edges[1].node.id).toBe(user1.id);
        expect(page4.pageInfo.hasPreviousPage).toBe(true);
        expect(page4.pageInfo.hasNextPage).toBe(true);
        expect(page4.pageInfo.startCursor).toBe(
          Cursor.fromEntity<User>(user4, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );
        expect(page4.pageInfo.endCursor).toBe(
          Cursor.fromEntity<User>(user1, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );

        cursor = page4.pageInfo.startCursor!;
      });

      it('should browse page 1', async () => {
        const page5 = await cursorPaginationFind(em, User, {
          last: 2,
          before: cursor,
        });

        expect(page5.totalCount).toBe(5);
        expect(page5.edges).toHaveLength(2);
        expect(page5.edges[0].cursor).toBe(
          Cursor.fromEntity<User>(user5, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );
        expect(page5.edges[0].node.id).toBe(user5.id);
        expect(page5.edges[1].cursor).toBe(
          Cursor.fromEntity<User>(user2, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );
        expect(page5.edges[1].node.id).toBe(user2.id);
        expect(page5.pageInfo.hasPreviousPage).toBe(false);
        expect(page5.pageInfo.hasNextPage).toBe(true);
        expect(page5.pageInfo.startCursor).toBe(
          Cursor.fromEntity<User>(user5, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );
        expect(page5.pageInfo.endCursor).toBe(
          Cursor.fromEntity<User>(user2, [{ name: 'ASC' }, { age: 'DESC' }, { id: 'ASC' }]).toBase64(),
        );
      });
    });
  });

  it('should return empty page if no data', async () => {
    const page = await cursorPaginationFind(em, User, {
      first: 10,
      after: Cursor.fromEntity<User>(user5, {
        id: 'ASC',
      }).toBase64(),
    });

    expect(page.totalCount).toBe(5);
    expect(page.edges).toHaveLength(0);
    expect(page.pageInfo.hasNextPage).toBe(false);
    expect(page.pageInfo.startCursor).toBeUndefined();
    expect(page.pageInfo.endCursor).toBeUndefined();
  });

  it('should merge where clauses', async () => {
    const page = await cursorPaginationFind(
      em,
      User,
      {
        first: 10,
        orderBy: { id: 'ASC' },
      },
      {
        age: {
          $gt: 20,
        },
      },
    );

    expect(page.totalCount).toBe(2);
    expect(page.edges).toHaveLength(2);
    expect(page.edges[0].cursor).toBe(Cursor.fromEntity<User>(user1, { id: 'ASC' }).toBase64());
    expect(page.edges[0].node.id).toBe(1);
    expect(page.edges[1].cursor).toBe(Cursor.fromEntity<User>(user5, { id: 'ASC' }).toBase64());
    expect(page.edges[1].node.id).toBe(5);
    expect(page.pageInfo.hasNextPage).toBe(false);
    expect(page.pageInfo.startCursor).toBe(Cursor.fromEntity<User>(user1, { id: 'ASC' }).toBase64());
    expect(page.pageInfo.endCursor).toBe(Cursor.fromEntity<User>(user5, { id: 'ASC' }).toBase64());
  });

  it('should merge options', async () => {
    const page = await cursorPaginationFind(
      em,
      User,
      {
        first: 1,
        orderBy: { id: 'ASC' },
      },
      {},
      {
        populate: ['parent1', 'parent2'],
      },
    );

    expect(page.edges[0].node.id).toBe(user1.id);
    expect(page.edges[0].node.parent1!.$.name).toBe(user2.name);
    expect(page.edges[0].node.parent2!.name).toBe(user3.name);
  });

  describe('pagination params validation', () => {
    it('should not allow both after and before', async () => {
      await expect(
        cursorPaginationFind(em, User, {
          orderBy: {
            id: 'ASC',
          },
          first: 1,
          after: 'some_cursor',
          before: 'some_cursor',
        }),
      ).rejects.toThrow();
    });

    it('should not allow both first and last', async () => {
      await expect(
        cursorPaginationFind(em, User, {
          orderBy: {
            id: 'ASC',
          },
          first: 1,
          last: 1,
        }),
      ).rejects.toThrow();
    });

    it('should not allow first < 0', async () => {
      await expect(
        cursorPaginationFind(em, User, {
          orderBy: {
            id: 'ASC',
          },
          first: -1,
        }),
      ).rejects.toThrow();
    });

    it('should not allow last < 0', async () => {
      await expect(
        cursorPaginationFind(em, User, {
          orderBy: {
            id: 'ASC',
          },
          last: -1,
          before: 'some_cursor',
        }),
      ).rejects.toThrow();
    });
  });

  it('supports passing `orderBy` with `after` or `before` cursors. `orderBy` is ignored when their is an `after` or `before` cursor', async () => {
    let first: number | undefined = 1;
    let after: string | undefined;
    let last: number | undefined;
    let before: string | undefined;
    let orderBy: QueryOrderMap<User> = { age: 'ASC', id: 'ASC' };

    let page = await cursorPaginationFind(em, User, {
      first,
      after,
      last,
      before,
      orderBy,
    });

    expect(page.edges[0].node.id).toBe(user2.id);

    after = page.pageInfo.endCursor;

    page = await cursorPaginationFind(em, User, {
      first,
      after,
      last,
      before,
      orderBy,
    });

    expect(page.edges[0].node.id).toBe(user3.id);

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

    expect(page.edges[0].node.id).toBe(user2.id);
  });

  it('requires orderBy to be a non-empty object or array', async () => {
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

  it('handles null values in pagination params the same as undefined', async () => {
    let first: number | null | undefined = 1;
    let after: string | null | undefined = null;
    let last: number | null | undefined = null;
    let before: string | null | undefined = null;
    let orderBy: QueryOrderMap<User> = { age: 'ASC', id: 'ASC' };

    let page = await cursorPaginationFind(em, User, {
      first,
      after,
      last,
      before,
      orderBy,
    });

    expect(page.edges[0].node.id).toBe(user2.id);

    after = page.pageInfo.endCursor;

    page = await cursorPaginationFind(em, User, {
      first,
      after,
      last,
      before,
      orderBy,
    });

    expect(page.edges[0].node.id).toBe(user3.id);

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

    expect(page.edges[0].node.id).toBe(user2.id);
  });
});
