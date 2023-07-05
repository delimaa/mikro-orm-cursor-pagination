import { MikroORM, QueryOrder, QueryOrderMap, ref } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { Cursor } from '../src/cursor';
import { User } from './user';

describe('cursor', () => {
  let orm: MikroORM;
  let user: User;
  let orderBy: QueryOrderMap<User>[];
  let jsonRepr: string;

  beforeAll(async () => {
    orm = await MikroORM.init(
      defineConfig({
        type: 'sqlite',
        dbName: ':memory:',
        entities: [User],
      }),
    );

    user = new User({
      id: 1,
      name: 'Joe',
      age: 20,
      parent1: ref(
        new User({
          id: 2,
          name: 'Jane',
          age: 48,
          parent2: new User({
            id: 4,
            name: 'Jack',
            age: 70,
          }),
        }),
      ),
      parent2: new User({
        id: 3,
        name: 'John',
        age: 49,
      }),
    });

    orderBy = [
      {
        name: QueryOrder.ASC,
        parent1: {
          age: QueryOrder.DESC,
        },
      },
      {
        parent1: {
          parent2: {
            id: QueryOrder.ASC,
          },
        },
      },
      {
        parent2: {
          name: QueryOrder.DESC,
        },
      },
      {
        id: QueryOrder.ASC,
      },
    ];

    jsonRepr = JSON.stringify([
      ['name', 'ASC', 'Joe'],
      ['parent1.age', 'DESC', 48],
      ['parent1.parent2.id', 'ASC', 4],
      ['parent2.name', 'DESC', 'John'],
      ['id', 'ASC', 1],
    ]);
  });

  afterAll(async () => {
    await orm.close();
  });

  it('should serialize to JSON', () => {
    const cursor = Cursor.fromEntity<User>(user, orderBy);
    expect(cursor.toJSON()).toEqual(jsonRepr);
  });

  it('should encode to base64', () => {
    const cursor = Cursor.fromEntity<User>(user, orderBy);
    expect(cursor.toBase64()).toEqual(Buffer.from(jsonRepr).toString('base64'));
  });

  it('should decode from base64', () => {
    const base64 = Buffer.from(jsonRepr).toString('base64');
    const cursor = Cursor.fromBase64<User>(base64);
    expect(cursor.toJSON()).toEqual(jsonRepr);
  });

  describe('orderBy', () => {
    it('should build order by for after cursor', () => {
      const cursor = Cursor.fromEntity<User>(user, orderBy);
      expect(cursor.buildOrderBy({ direction: 'forward' })).toEqual({
        name: QueryOrder.ASC,
        parent1: {
          age: QueryOrder.DESC,
          parent2: {
            id: QueryOrder.ASC,
          },
        },
        parent2: {
          name: QueryOrder.DESC,
        },
        id: QueryOrder.ASC,
      });
    });

    it('should build reverse order by for after cursor', () => {
      const cursor = Cursor.fromEntity<User>(user, orderBy);
      expect(cursor.buildOrderBy({ direction: 'backward' })).toEqual({
        name: QueryOrder.DESC,
        parent1: {
          age: QueryOrder.ASC,
          parent2: {
            id: QueryOrder.DESC,
          },
        },
        parent2: {
          name: QueryOrder.ASC,
        },
        id: QueryOrder.DESC,
      });
    });
  });

  describe('where filter query', () => {
    it('should build where filter query for after cursor', () => {
      const cursor = Cursor.fromEntity<User>(user, orderBy);
      expect(cursor.buildWhereOr({ direction: 'forward' })).toEqual([
        {
          name: {
            $gt: 'Joe',
          },
        },
        {
          parent1: {
            age: {
              $lt: 48,
            },
          },
          name: 'Joe',
        },
        {
          parent1: {
            parent2: {
              id: {
                $gt: 4,
              },
            },
            age: 48,
          },
          name: 'Joe',
        },
        {
          parent2: {
            name: {
              $lt: 'John',
            },
          },
          name: 'Joe',
          parent1: {
            age: 48,
            parent2: {
              id: 4,
            },
          },
        },
        {
          id: {
            $gt: 1,
          },
          parent2: {
            name: 'John',
          },
          name: 'Joe',
          parent1: {
            age: 48,
            parent2: {
              id: 4,
            },
          },
        },
      ]);
    });

    it('should build where filter query for before cursor', () => {
      const cursor = Cursor.fromEntity<User>(user, orderBy);
      expect(cursor.buildWhereOr({ direction: 'backward' })).toEqual([
        {
          name: {
            $lt: 'Joe',
          },
        },
        {
          parent1: {
            age: {
              $gt: 48,
            },
          },
          name: 'Joe',
        },
        {
          parent1: {
            parent2: {
              id: {
                $lt: 4,
              },
            },
            age: 48,
          },
          name: 'Joe',
        },
        {
          parent2: {
            name: {
              $gt: 'John',
            },
          },
          name: 'Joe',
          parent1: {
            age: 48,
            parent2: {
              id: 4,
            },
          },
        },
        {
          id: {
            $lt: 1,
          },
          parent2: {
            name: 'John',
          },
          name: 'Joe',
          parent1: {
            age: 48,
            parent2: {
              id: 4,
            },
          },
        },
      ]);
    });
  });

  it('should not allow empty orderBy', () => {
    expect(() => Cursor.fromEntity<User>(user, [])).toThrowError(
      'Cannot create cursor with empty orderBy',
    );
    expect(() => Cursor.fromEntity<User>(user, {})).toThrowError(
      'Cannot create cursor with empty orderBy',
    );
  });
});
