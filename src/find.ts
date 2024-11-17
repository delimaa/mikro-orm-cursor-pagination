import { EntityManager, EntityName, FilterQuery, FindOptions, Loaded, QueryOrderMap } from '@mikro-orm/core';
import { Cursor } from './cursor';

export type PaginationParams<T extends object> = {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
  /**
   * Order by has been moved here (instead of being in native MikroORM options)
   * because it is required for the pagination to work when doing an initial query without cursor.
   *
   * To keep pagination consistent in case of entities having the same value on a column,
   * a unique key must be included in the order by.
   * Most of the time, using the primary key is a good choice.
   *
   * @example
   * // Ensure at least one unique column is used
   * cursorPaginationFind(em, User, {
   *   first: 10,
   *   orderBy: {
   *     id: 'ASC'
   *   }
   * })
   *
   * // When non uniques order by columns are used, always use another unique column as last order by.
   * cursorPaginationFind(em, User, {
   *   first: 10,
   *   orderBy: {
   *     firstName: 'DESC', // Multiple users can have the same first name
   *     lastName: 'DESC', // Multiple users can have the same last name
   *     id: 'ASC' // id is unique and will be used to keep pagination consistent
   *   }
   * })
   */
  orderBy?: QueryOrderMap<T> | QueryOrderMap<T>[];
};

export type CursorPaginationResult<T extends object, P extends string> = {
  totalCount: number;
  edges: {
    cursor: string;
    node: Loaded<T, P>;
  }[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor?: string;
    endCursor?: string;
  };
};

/**
 * Cursor-based pagination with support for multiple order by columns.
 *
 * @param em - MikroORM EntityManager.
 * @param entityName - Entity name.
 * @param pagination - Cursor pagination parameters.
 * @param where - Native MikroORM `find` filter query.
 * @param options - Native MikroORM `find` options without `limit`, `offset` and `orderBy` properties.
 *
 * @example
 *
 * ```ts
 * \@Entity()
 * class User {
 *   \@PrimaryKey()
 *   id!: number;
 *
 *   \@Property()
 *   name!: string;
 *
 *   \@Property()
 *   age!: number;
 *
 *   \@ManyToMany()
 *   friends = new Collection<User>(this);
 * }
 *
 * const page = await cursorPaginationFind(
 *   em,
 *   User,
 *   {
 *     first: 10,
 *     orderBy: {
 *       name: 'ASC',
 *       age: 'DESC',
 *       id: 'ASC',
 *     },
 *   },
 *   {
 *     age: { $gt: 20 },
 *   },
 *   {
 *     populate: ['friends'],
 *   }
 * );
 *
 * if (page.pageInfo.hasNextPage) {
 *   const nextPage = await cursorPaginationFind(
 *     em,
 *     User,
 *     {
 *       first: 10,
 *       after: page.pageInfo.endCursor,
 *     },
 *     {
 *       age: { $gt: 20 },
 *     },
 *     {
 *       populate: ['friends'],
 *     }
 *   );
 * }
 * ```
 */
export async function cursorPaginationFind<T extends object, P extends string = never>(
  em: EntityManager,
  entityName: EntityName<T>,
  pagination: PaginationParams<T>,
  where: FilterQuery<T> = {},
  options: Omit<FindOptions<T, P>, 'limit' | 'offset' | 'orderBy'> = {},
): Promise<CursorPaginationResult<T, P>> {
  if (pagination.after !== undefined && pagination.before !== undefined) {
    throw new Error(`Cannot use both 'after' and 'before' at the same time`);
  }

  if (pagination.first !== undefined && pagination.last !== undefined) {
    throw new Error(`Cannot use both 'first' and 'last' at the same time`);
  }

  if (pagination.first !== undefined && pagination.first < 0) {
    throw new Error(`'first' must be greater than or equal to 0`);
  }

  if (pagination.last !== undefined && pagination.last < 0) {
    throw new Error(`'last' must be greater than or equal to 0`);
  }

  if (pagination.orderBy !== undefined) {
    const emptyArray = Array.isArray(pagination.orderBy) && pagination.orderBy.length === 0;
    const emptyObject = !Array.isArray(pagination.orderBy) && Object.keys(pagination.orderBy).length === 0;
    if (emptyArray || emptyObject) {
      throw new Error(`'orderBy' must be a non-empty object or array`);
    }
  }

  const forwardPagination = pagination.after !== undefined && pagination.first !== undefined;
  if (forwardPagination) {
    const after = pagination.after!;
    const first = pagination.first!;

    const cursor = Cursor.fromBase64<T>(after);

    const paginationWhere = {
      $and: [{ ...where }, { $or: cursor.buildWhereOr({ direction: 'forward' }) }],
    } as FilterQuery<T>;

    const paginationOptions = {
      ...options,
      limit: first + 1, // Fetch one more to know if there is a next page
      orderBy: cursor.buildOrderBy({ direction: 'forward' }),
    } as FindOptions<T, P>;

    const [totalCount, entities] = await Promise.all([
      em.count(entityName, where),
      em.find(entityName, paginationWhere, paginationOptions),
    ]);

    let hasNextPage = false;
    if (entities.length === first + 1) {
      hasNextPage = true;
      entities.pop(); // Remove the extra entity used to check if there is a next page
    }

    const orderBy = cursor.buildOrderBy({ direction: 'forward' });
    const edges = entities.map((entity) => {
      return {
        cursor: Cursor.fromEntity(entity, orderBy).toBase64(),
        node: entity,
      };
    });

    return {
      totalCount,
      edges,
      pageInfo: {
        hasNextPage,
        hasPreviousPage: true,
        startCursor: edges[0]?.cursor,
        endCursor: edges[edges.length - 1]?.cursor,
      },
    };
  }

  const backwardPagination = pagination.before !== undefined && pagination.last !== undefined;
  if (backwardPagination) {
    const before = pagination.before!;
    const last = pagination.last!;

    const cursor = Cursor.fromBase64<T>(before);

    const paginationWhere = {
      $and: [{ ...where }, { $or: cursor.buildWhereOr({ direction: 'backward' }) }],
    } as FilterQuery<T>;

    const paginationOptions = {
      ...options,
      limit: last + 1, // Fetch one more to know if there is a previous page
      orderBy: cursor.buildOrderBy({ direction: 'backward' }),
    } as FindOptions<T, P>;

    const [totalCount, entities] = await Promise.all([
      em.count(entityName, where),
      em.find(entityName, paginationWhere, paginationOptions),
    ]);

    let hasPreviousPage = false;
    if (entities.length === last + 1) {
      hasPreviousPage = true;
      entities.pop(); // Remove the extra entity used to check if there is a previous page
    }

    // Yes, we generate orderBy in forward direction here, even if we are doing backward pagination.
    const orderBy = cursor.buildOrderBy({ direction: 'forward' });
    const edges = entities.reverse().map((entity) => {
      return {
        cursor: Cursor.fromEntity(entity, orderBy).toBase64(),
        node: entity,
      };
    });

    return {
      totalCount,
      edges,
      pageInfo: {
        hasNextPage: true,
        hasPreviousPage,
        startCursor: edges[0]?.cursor,
        endCursor: edges[edges.length - 1]?.cursor,
      },
    };
  }

  const noCursorPagination = pagination.orderBy !== undefined && pagination.first !== undefined;
  if (noCursorPagination) {
    const orderBy = pagination.orderBy!;
    const first = pagination.first!;

    const [totalCount, entities] = await Promise.all([
      em.count(entityName, { ...where }),
      em.find(entityName, { ...where }, {
        ...options,
        limit: pagination.first,
        orderBy: pagination.orderBy,
      } as FindOptions<T, P>),
    ]);

    const edges = entities.map((entity) => {
      return {
        cursor: Cursor.fromEntity(entity, orderBy).toBase64(),
        node: entity,
      };
    });

    return {
      totalCount,
      edges,
      pageInfo: {
        hasNextPage: totalCount > first,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor,
        endCursor: edges[edges.length - 1]?.cursor,
      },
    };
  }

  throw new Error('Invalid pagination parameters');
}
