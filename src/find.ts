import { EntityManager, EntityName, FilterQuery, FindOptions, Loaded, QueryOrderMap } from '@mikro-orm/core';
import { Cursor } from './cursor';

export type AfterCursorPaginationParams = {
  first: number;
  after: string;
};

export type BeforeCursorPaginationParams = {
  last: number;
  before: string;
};

export type NoCursorPaginationParams<T extends object> = {
  first: number;
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
  orderBy: QueryOrderMap<T> | QueryOrderMap<T>[];
};

export type PaginationParams<T extends object> =
  | AfterCursorPaginationParams
  | BeforeCursorPaginationParams
  | NoCursorPaginationParams<T>;

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
  if ('after' in pagination && pagination.after && 'before' in pagination && pagination.before) {
    throw new Error(`Cannot use both 'after' and 'before' at the same time`);
  }

  if ('first' in pagination && pagination.first && 'last' in pagination && pagination.last) {
    throw new Error(`Cannot use both 'first' and 'last' at the same time`);
  }

  if ('first' in pagination && pagination.first < 0) {
    throw new Error(`'first' must be greater than or equal to 0`);
  }

  if ('last' in pagination && pagination.last < 0) {
    throw new Error(`'last' must be greater than or equal to 0`);
  }

  const noCursorPagination = 'orderBy' in pagination;
  if (noCursorPagination) {
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
        cursor: Cursor.fromEntity(entity, pagination.orderBy).toBase64(),
        node: entity,
      };
    });

    return {
      totalCount,
      edges,
      pageInfo: {
        hasNextPage: totalCount > pagination.first,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor,
        endCursor: edges[edges.length - 1]?.cursor,
      },
    };
  }

  const forwardPagination = 'after' in pagination;
  if (forwardPagination) {
    const cursor = Cursor.fromBase64<T>(pagination.after);

    const paginationWhere = {
      $and: [{ ...where }, { $or: cursor.buildWhereOr({ direction: 'forward' }) }],
    } as FilterQuery<T>;

    const paginationOptions = {
      ...options,
      limit: pagination.first + 1, // Fetch one more to know if there is a next page
      orderBy: cursor.buildOrderBy({ direction: 'forward' }),
    } as FindOptions<T, P>;

    const [totalCount, entities] = await Promise.all([
      em.count(entityName, where),
      em.find(entityName, paginationWhere, paginationOptions),
    ]);

    let hasNextPage = false;
    if (entities.length === pagination.first + 1) {
      hasNextPage = true;
      entities.pop(); // Remove the extra entity used to check if there is a next page
    }

    const edges = entities.map((entity) => {
      return {
        cursor: Cursor.fromEntity(entity, cursor.buildOrderBy({ direction: 'forward' })).toBase64(),
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

  const backwardPagination = 'before' in pagination;
  if (backwardPagination) {
    const cursor = Cursor.fromBase64<T>(pagination.before);

    const paginationWhere = {
      $and: [{ ...where }, { $or: cursor.buildWhereOr({ direction: 'backward' }) }],
    } as FilterQuery<T>;

    const paginationOptions = {
      ...options,
      limit: pagination.last + 1, // Fetch one more to know if there is a previous page
      orderBy: cursor.buildOrderBy({ direction: 'backward' }),
    } as FindOptions<T, P>;

    const [totalCount, entities] = await Promise.all([
      em.count(entityName, where),
      em.find(entityName, paginationWhere, paginationOptions),
    ]);

    let hasPreviousPage = false;
    if (entities.length === pagination.last + 1) {
      hasPreviousPage = true;
      entities.pop(); // Remove the extra entity used to check if there is a previous page
    }

    const edges = entities.reverse().map((entity) => {
      return {
        cursor: Cursor.fromEntity(entity, cursor.buildOrderBy({ direction: 'forward' })).toBase64(),
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

  throw new Error('Invalid pagination parameters');
}
