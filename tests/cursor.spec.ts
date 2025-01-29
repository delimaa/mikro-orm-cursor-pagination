import { Entity, ManyToOne, MikroORM, PrimaryKey, Property, QueryOrder, ref, Ref } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { Cursor } from '../src/cursor';

@Entity()
class User {
  @PrimaryKey()
  id: number;

  @Property({ nullable: true })
  age?: number | null;

  // Relationship setup using `Ref` type
  @ManyToOne(() => User, { nullable: true, ref: true })
  parent1: Ref<User> | null;

  // Relationship setup without `Ref` type
  @ManyToOne(() => User, { nullable: true })
  parent2: User | null;

  constructor(props: { id: number; age?: number | null; parent1?: User | null; parent2?: User | null }) {
    this.id = props.id;
    this.age = props.age;
    this.parent1 = props.parent1 ? ref(props.parent1) : null;
    this.parent2 = props.parent2 ?? null;
  }
}

let orm: MikroORM;

beforeAll(async () => {
  orm = await MikroORM.init(
    defineConfig({
      dbName: ':memory:',
      entities: [User],
    }),
  );
});

afterAll(async () => {
  await orm.close();
});

describe('Build from entity', () => {
  test('Order cannot be empty', () => {
    const user = new User({ id: 1, age: 20 });
    expect(() => Cursor.fromEntity(user, [])).toThrow('Cannot create cursor with empty orderBy');
    expect(() => Cursor.fromEntity(user, {})).toThrow('Cannot create cursor with empty orderBy');
  });

  test('Order by single field', () => {
    const user = new User({ id: 1, age: 20 });
    const cursor = Cursor.fromEntity(user, { age: QueryOrder.ASC });
    expect(cursor.toJSON()).toBe(`[["age","${QueryOrder.ASC}",20]]`);
  });

  test('Order by multiple fields', () => {
    const user = new User({ id: 1, age: 20 });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC }, { id: QueryOrder.ASC }]);
    expect(cursor.toJSON()).toBe(`[["age","${QueryOrder.ASC}",20],["id","${QueryOrder.ASC}",1]]`);
  });

  test('Order by nested relation with ref', () => {
    const user = new User({ id: 1, age: 20, parent1: new User({ id: 2, age: 50 }) });
    const cursor = Cursor.fromEntity(user, [{ parent1: { age: QueryOrder.ASC } }]);
    expect(cursor.toJSON()).toBe(`[["parent1.age","${QueryOrder.ASC}",50]]`);
  });

  test('Order by nested relation without ref', () => {
    const user = new User({ id: 1, age: 20, parent2: new User({ id: 2, age: 50 }) });
    const cursor = Cursor.fromEntity(user, [{ parent2: { age: QueryOrder.ASC } }]);
    expect(cursor.toJSON()).toBe(`[["parent2.age","${QueryOrder.ASC}",50]]`);
  });

  test('Complex case with multiple order by and nested relations', () => {
    const user = new User({
      id: 1,
      age: 20,
      parent1: new User({ id: 3, age: 48 }),
      parent2: new User({ id: 2, age: 50 }),
    });
    const cursor = Cursor.fromEntity(user, [
      { parent1: { age: QueryOrder.ASC } },
      { age: QueryOrder.ASC },
      { parent2: { age: QueryOrder.DESC } },
      { id: QueryOrder.DESC },
    ]);
    expect(cursor.toJSON()).toBe(
      `[["parent1.age","${QueryOrder.ASC}",48],["age","${QueryOrder.ASC}",20],["parent2.age","${QueryOrder.DESC}",50],["id","${QueryOrder.DESC}",1]]`,
    );
  });

  test('Order by null value', () => {
    const user = new User({ id: 1, age: null });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC }]);
    expect(cursor.toJSON()).toBe(`[["age","${QueryOrder.ASC}",null]]`);
  });

  test('Order by nullable field represented by undefined as value. undefined is casted to null', () => {
    const user = new User({ id: 1 });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC }]);
    expect(cursor.toJSON()).toBe(`[["age","${QueryOrder.ASC}",null]]`);
  });
});

test('Convert to base64', () => {
  const user = new User({ id: 1, age: 20 });
  const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC }, { id: QueryOrder.DESC }]);
  const json = `[["age","${QueryOrder.ASC}",20],["id","${QueryOrder.DESC}",1]]`;
  expect(cursor.toBase64()).toBe(Buffer.from(json).toString('base64'));
});

test('Build from base64', () => {
  const user = new User({ id: 1, age: 20 });
  const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC }, { id: QueryOrder.DESC }]);
  const base64 = cursor.toBase64();
  const newCursor = Cursor.fromBase64(base64);
  expect(newCursor.toJSON()).toBe(cursor.toJSON());
});

describe('Build order by', () => {
  test('Forward', () => {
    // Complex case with multiple order by and nested relations
    const user = new User({
      id: 1,
      age: 20,
      parent1: new User({ id: 3, age: null }),
      parent2: new User({ id: 2, age: 50 }),
    });

    const cursor = Cursor.fromEntity(user, [
      { parent1: { age: QueryOrder.ASC_NULLS_FIRST } },
      { age: QueryOrder.ASC },
      { parent2: { age: QueryOrder.DESC_NULLS_LAST } },
      { id: QueryOrder.DESC },
    ]);

    const orderBy = cursor.orderBy({ direction: 'forward' });

    expect(orderBy).toEqual({
      parent1: {
        age: QueryOrder.ASC_NULLS_FIRST,
      },
      age: QueryOrder.ASC,
      parent2: {
        age: QueryOrder.DESC_NULLS_LAST,
      },
      id: QueryOrder.DESC,
    });
  });

  describe('Backward', () => {
    test('ASC becomes DESC', () => {
      const user = new User({ id: 1, age: 20 });
      const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC }]);
      const orderBy = cursor.orderBy({ direction: 'backward' });
      expect(orderBy).toEqual({ age: QueryOrder.DESC });
    });

    test('DESC becomes ASC', () => {
      const user = new User({ id: 1, age: 20 });
      const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.DESC }]);
      const orderBy = cursor.orderBy({ direction: 'backward' });
      expect(orderBy).toEqual({ age: QueryOrder.ASC });
    });

    test('ASC_NULLS_FIRST becomes DESC_NULLS_LAST', () => {
      const user = new User({ id: 1, age: 20 });
      const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC_NULLS_FIRST }]);
      const orderBy = cursor.orderBy({ direction: 'backward' });
      expect(orderBy).toEqual({ age: QueryOrder.DESC_NULLS_LAST });
    });

    test('DESC_NULLS_LAST becomes ASC_NULLS_FIRST', () => {
      const user = new User({ id: 1, age: 20 });
      const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.DESC_NULLS_LAST }]);
      const orderBy = cursor.orderBy({ direction: 'backward' });
      expect(orderBy).toEqual({ age: QueryOrder.ASC_NULLS_FIRST });
    });
  });
});

describe('Build where', () => {
  test('Not null ASC forward', () => {
    const user = new User({ id: 1, age: 20 });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC }]);
    const where = cursor.where({ direction: 'forward' });
    expect(where).toEqual([{ age: { $gt: 20 } }]);
  });

  test('Not null ASC NULLS LAST forward', () => {
    const user = new User({ id: 1, age: 20 });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC_NULLS_LAST }]);
    const where = cursor.where({ direction: 'forward' });
    expect(where).toEqual([{ $or: [{ age: { $gt: 20 } }, { age: null }] }]);
  });

  test('Not null ASC backward', () => {
    const user = new User({ id: 1, age: 20 });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC }]);
    const where = cursor.where({ direction: 'backward' });
    expect(where).toEqual([{ age: { $lt: 20 } }]);
  });

  test('Not null ASC NULLS LAST backward', () => {
    const user = new User({ id: 1, age: 20 });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC_NULLS_LAST }]);
    const where = cursor.where({ direction: 'backward' });
    expect(where).toEqual([{ $and: [{ age: { $lt: 20 } }, { age: { $ne: null } }] }]);
  });

  test('Not null DESC forward', () => {
    const user = new User({ id: 1, age: 20 });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.DESC }]);
    const where = cursor.where({ direction: 'forward' });
    expect(where).toEqual([{ age: { $lt: 20 } }]);
  });

  test('Not null DESC NULLS FIRST forward', () => {
    const user = new User({ id: 1, age: 20 });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.DESC_NULLS_FIRST }]);
    const where = cursor.where({ direction: 'forward' });
    expect(where).toEqual([{ $and: [{ age: { $lt: 20 } }, { age: { $ne: null } }] }]);
  });

  test('Not null DESC backward', () => {
    const user = new User({ id: 1, age: 20 });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.DESC }]);
    const where = cursor.where({ direction: 'backward' });
    expect(where).toEqual([{ age: { $gt: 20 } }]);
  });

  test('Not null DESC NULLS FIRST backward', () => {
    const user = new User({ id: 1, age: 20 });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.DESC_NULLS_FIRST }]);
    const where = cursor.where({ direction: 'backward' });
    expect(where).toEqual([{ $or: [{ age: { $gt: 20 } }, { age: null }] }]);
  });

  test('Not null ASC NULLS FIRST forward', () => {
    const user = new User({ id: 1, age: 20 });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC_NULLS_FIRST }]);
    const where = cursor.where({ direction: 'forward' });
    expect(where).toEqual([{ $and: [{ age: { $gt: 20 } }, { age: { $ne: null } }] }]);
  });

  test('Not null ASC NULLS FIRST backward', () => {
    const user = new User({ id: 1, age: 20 });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC_NULLS_FIRST }]);
    const where = cursor.where({ direction: 'backward' });
    expect(where).toEqual([{ $or: [{ age: { $lt: 20 } }, { age: null }] }]);
  });

  test('Not null DESC NULLS LAST forward', () => {
    const user = new User({ id: 1, age: 20 });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.DESC_NULLS_LAST }]);
    const where = cursor.where({ direction: 'forward' });
    expect(where).toEqual([{ $or: [{ age: { $lt: 20 } }, { age: null }] }]);
  });

  test('Not null DESC NULLS LAST backward', () => {
    const user = new User({ id: 1, age: 20 });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.DESC_NULLS_LAST }]);
    const where = cursor.where({ direction: 'backward' });
    expect(where).toEqual([{ $and: [{ age: { $gt: 20 } }, { age: { $ne: null } }] }]);
  });

  test('Null ASC forward', () => {
    const user = new User({ id: 1, age: null });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC }]);
    const where = cursor.where({ direction: 'forward' });
    expect(where).toEqual([{ age: { $gt: null } }]);
  });

  test('Null ASC NULLS LAST forward', () => {
    const user = new User({ id: 1, age: null });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC_NULLS_LAST }]);
    const where = cursor.where({ direction: 'forward' });
    expect(where).toEqual([]);
  });

  test('Null ASC backward', () => {
    const user = new User({ id: 1, age: null });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC }]);
    const where = cursor.where({ direction: 'backward' });
    expect(where).toEqual([{ age: { $lt: null } }]);
  });

  test('Null ASC NULLS LAST backward', () => {
    const user = new User({ id: 1, age: null });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC_NULLS_LAST }]);
    const where = cursor.where({ direction: 'backward' });
    expect(where).toEqual([{ age: { $ne: null } }]);
  });

  test('Null DESC forward', () => {
    const user = new User({ id: 1, age: null });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.DESC }]);
    const where = cursor.where({ direction: 'forward' });
    expect(where).toEqual([{ age: { $lt: null } }]);
  });

  test('Null DESC NULLS FIRST forward', () => {
    const user = new User({ id: 1, age: null });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.DESC_NULLS_FIRST }]);
    const where = cursor.where({ direction: 'forward' });
    expect(where).toEqual([{ age: { $ne: null } }]);
  });

  test('Null DESC backward', () => {
    const user = new User({ id: 1, age: null });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.DESC }]);
    const where = cursor.where({ direction: 'backward' });
    expect(where).toEqual([{ age: { $gt: null } }]);
  });

  test('Null DESC NULLS FIRST backward', () => {
    const user = new User({ id: 1, age: null });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.DESC_NULLS_FIRST }]);
    const where = cursor.where({ direction: 'backward' });
    expect(where).toEqual([]);
  });

  test('Null ASC NULLS FIRST forward', () => {
    const user = new User({ id: 1, age: null });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC_NULLS_FIRST }]);
    const where = cursor.where({ direction: 'forward' });
    expect(where).toEqual([{ age: { $ne: null } }]);
  });

  test('Null ASC NULLS FIRST backward', () => {
    const user = new User({ id: 1, age: null });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC_NULLS_FIRST }]);
    const where = cursor.where({ direction: 'backward' });
    expect(where).toEqual([]);
  });

  test('Null DESC NULLS LAST forward', () => {
    const user = new User({ id: 1, age: null });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.DESC_NULLS_LAST }]);
    const where = cursor.where({ direction: 'forward' });
    expect(where).toEqual([]);
  });

  test('Null DESC NULLS LAST backward', () => {
    const user = new User({ id: 1, age: null });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.DESC_NULLS_LAST }]);
    const where = cursor.where({ direction: 'backward' });
    expect(where).toEqual([{ age: { $ne: null } }]);
  });

  test('Multiple fields', () => {
    const user = new User({ id: 1, age: 20 });
    const cursor = Cursor.fromEntity(user, [{ age: QueryOrder.ASC }, { id: QueryOrder.ASC }]);
    const where = cursor.where({ direction: 'forward' });
    expect(where).toEqual([{ age: { $gt: 20 } }, { id: { $gt: 1 }, age: 20 }]);
  });

  test('Complex case with multiple order by and nested relations in forward direction', () => {
    const user = new User({
      id: 1,
      age: null,
      parent1: new User({ id: 3, age: 48 }),
      parent2: new User({ id: 2, age: 50 }),
    });

    const cursor = Cursor.fromEntity(user, [
      { parent1: { age: QueryOrder.ASC_NULLS_FIRST } },
      { age: QueryOrder.DESC_NULLS_LAST },
      { parent2: { age: QueryOrder.ASC_NULLS_LAST } },
      { id: QueryOrder.DESC_NULLS_FIRST },
    ]);

    const where = cursor.where({ direction: 'forward' });

    expect(where).toEqual([
      {
        parent1: { $and: [{ age: { $gt: 48 } }, { age: { $ne: null } }] },
      },
      {
        parent2: { $or: [{ age: { $gt: 50 } }, { age: null }] },
        parent1: { age: 48 },
        age: null,
      },
      {
        $and: [{ id: { $lt: 1 } }, { id: { $ne: null } }],
        parent1: { age: 48 },
        age: null,
        parent2: { age: 50 },
      },
    ]);
  });

  test('Complex case with multiple order by and nested relations in backward direction', () => {
    const user = new User({
      id: 1,
      age: null,
      parent1: new User({ id: 3, age: 48 }),
      parent2: new User({ id: 2, age: 50 }),
    });

    const cursor = Cursor.fromEntity(user, [
      { parent1: { age: QueryOrder.ASC_NULLS_FIRST } },
      { age: QueryOrder.DESC_NULLS_LAST },
      { parent2: { age: QueryOrder.ASC_NULLS_LAST } },
      { id: QueryOrder.DESC_NULLS_FIRST },
    ]);

    const where = cursor.where({ direction: 'backward' });

    expect(where).toEqual([
      {
        parent1: { $or: [{ age: { $lt: 48 } }, { age: null }] },
      },
      {
        age: { $ne: null },
        parent1: { age: 48 },
      },
      {
        parent2: { $and: [{ age: { $lt: 50 } }, { age: { $ne: null } }] },
        parent1: { age: 48 },
        age: null,
      },
      {
        $or: [{ id: { $gt: 1 } }, { id: null }],
        parent1: { age: 48 },
        age: null,
        parent2: { age: 50 },
      },
    ]);
  });
});
