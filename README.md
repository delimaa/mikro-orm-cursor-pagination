# MikroORM Cursor Pagination

## Description

Cursor pagination support for MikroORM following [Relay GraphQL Cursor Connections Specification](https://relay.dev/graphql/connections.htm).

## Installation

```bash
npm install @delimaa/mikro-orm-cursor-pagination
```

## Usage

```ts
import { cursorPaginationFind } from '@delimaa/mikro-orm-cursor-pagination';

@Entity()
class User {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @Property({ nullable: true })
  age: number | null;

  @ManyToMany()
  friends = new Collection<User>(this);
}

// Initial cursor pagination when no cursor is provided
let page = await cursorPaginationFind(
  em,
  User,
  // 👇 Initial pagination when no cursor is provided, pass `first` & `orderBy`
  {
    first: 10,
    orderBy: {
      name: QueryOrder.DESC,
      // 👇 Supports NULL ordering by specifying NULLS_FIRST or NULLS_LAST order on nullable column
      age: QueryOrder.ASC_NULLS_FIRST,
      id: QueryOrder.ASC,
    },
  },
  // 👇 Pass any native MikroORM where condition
  {
    age: { $gt: 20 },
  },
  // 👇 Pass any native MikroORM options except `limit`, `offset` and `orderBy` properties which are not allowed
  {
    populate: ['friends'],
  },
);

page.totalCount; // Total count of records
page.pageInfo.hasNextPage; // Whether next page is available
page.pageInfo.hasPreviousPage; // Whether previous page is available
page.pageInfo.startCursor; // Start cursor
page.pageInfo.endCursor; // End cursor
page.edges; // Array of edges containing cursor and node { cursor: string, node: Loaded<User, 'friends'> }

// Forward cursor pagination
page = await cursorPaginationFind(
  em,
  User,
  // 👇 For forward cursor pagination, pass `first` & `after`
  {
    first: 10,
    after: page.pageInfo.endCursor,
  },
  {
    age: { $gt: 20 },
  },
  {
    populate: ['friends'],
  },
);

// Backward cursor pagination
page = await cursorPaginationFind(
  em,
  User,
  // 👇 For backward cursor pagination, pass `last` & `before`
  {
    last: 10,
    before: page.pageInfo.startCursor,
  },
  {
    age: { $gt: 20 },
  },
  {
    populate: ['friends'],
  },
);

```
