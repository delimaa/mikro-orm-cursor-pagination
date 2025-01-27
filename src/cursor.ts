import { FilterQuery, QueryOrder, QueryOrderKeys, QueryOrderMap, wrap } from '@mikro-orm/core';
import { get, set } from './utils';

type CursorState<T extends object> = [string, QueryOrderKeys<T>, any][];

const reverseQueryOrder: Record<QueryOrder, QueryOrder> = {
  [QueryOrder.ASC]: QueryOrder.DESC,
  [QueryOrder.ASC_NULLS_LAST]: QueryOrder.DESC_NULLS_FIRST,
  [QueryOrder.ASC_NULLS_FIRST]: QueryOrder.DESC_NULLS_LAST,
  [QueryOrder.DESC]: QueryOrder.ASC,
  [QueryOrder.DESC_NULLS_LAST]: QueryOrder.ASC_NULLS_FIRST,
  [QueryOrder.DESC_NULLS_FIRST]: QueryOrder.ASC_NULLS_LAST,
  [QueryOrder.asc]: QueryOrder.desc,
  [QueryOrder.asc_nulls_last]: QueryOrder.desc_nulls_first,
  [QueryOrder.asc_nulls_first]: QueryOrder.desc_nulls_last,
  [QueryOrder.desc]: QueryOrder.asc,
  [QueryOrder.desc_nulls_last]: QueryOrder.asc_nulls_first,
  [QueryOrder.desc_nulls_first]: QueryOrder.asc_nulls_last,
};

export class Cursor<T extends object> {
  private constructor(private readonly state: CursorState<T>) {}

  static fromEntity<T extends object>(entity: T, orderBy: QueryOrderMap<T> | QueryOrderMap<T>[]): Cursor<T> {
    if ((Array.isArray(orderBy) && orderBy.length === 0) || Object.keys(orderBy).length === 0) {
      throw new Error('Cannot create cursor with empty orderBy');
    }

    const entityObject = wrap(entity).toObject();
    const state: CursorState<T> = [];

    const walkQueryOrderMap = (order: QueryOrderMap<T>, prevKeys: string[] = []) => {
      Object.entries(order).forEach(([key, value]) => {
        const currKeys = [...prevKeys, key];

        if (typeof value === 'string') {
          const strKey = currKeys.join('.');
          let data = get(entityObject, strKey);
          if (data === undefined) data = null; // Cast undefined to null to handle them both as null
          state.push([strKey, value as QueryOrder, data]);
        }

        if (typeof value === 'object') {
          walkQueryOrderMap(value as QueryOrderMap<T>, currKeys);
        }
      });
    };

    const orderByArr: QueryOrderMap<T>[] = Array.isArray(orderBy) ? orderBy : [orderBy];
    orderByArr.forEach((order) => {
      walkQueryOrderMap(order);
    });

    return new Cursor<T>(state);
  }

  static fromBase64<T extends object>(base64: string): Cursor<T> {
    const state: CursorState<T> = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));

    return new Cursor<T>(state);
  }

  toBase64(): string {
    return Buffer.from(this.toJSON()).toString('base64');
  }

  toJSON(): string {
    return JSON.stringify(this.state);
  }

  orderBy({ direction }: { direction: 'forward' | 'backward' }): QueryOrderMap<T> {
    return this.state.reduce((acc, curr) => {
      const [key, order] = curr;
      set(acc, key, direction === 'forward' ? order : reverseQueryOrder[order as QueryOrder]);
      return acc;
    }, {} as QueryOrderMap<T>);
  }

  where({ direction }: { direction: 'forward' | 'backward' }): FilterQuery<T>[] {
    return this.state
      .map<FilterQuery<T> | null>(([key, order, value], i) => {
        const where: FilterQuery<T> = {};

        if (value === null) {
          if (direction === 'forward') {
            switch (order) {
              case QueryOrder.ASC:
              case QueryOrder.asc:
                set(where, key, { $gt: null });
                break;
              case QueryOrder.ASC_NULLS_LAST:
              case QueryOrder.asc_nulls_last:
                return null;
              case QueryOrder.DESC:
              case QueryOrder.desc:
                set(where, key, { $lt: null });
                break;
              case QueryOrder.DESC_NULLS_FIRST:
              case QueryOrder.desc_nulls_first:
                set(where, key, { $ne: null });
                break;
              case QueryOrder.ASC_NULLS_FIRST:
              case QueryOrder.asc_nulls_first:
                set(where, key, { $ne: null });
                break;
              case QueryOrder.DESC_NULLS_LAST:
              case QueryOrder.desc_nulls_last:
                return null;
            }
          } else {
            switch (order) {
              case QueryOrder.ASC:
              case QueryOrder.asc:
                set(where, key, { $lt: null });
                break;
              case QueryOrder.ASC_NULLS_LAST:
              case QueryOrder.asc_nulls_last:
                set(where, key, { $ne: null });
                break;
              case QueryOrder.DESC:
              case QueryOrder.desc:
                set(where, key, { $gt: null });
                break;
              case QueryOrder.DESC_NULLS_FIRST:
              case QueryOrder.desc_nulls_first:
                return null;
              case QueryOrder.ASC_NULLS_FIRST:
              case QueryOrder.asc_nulls_first:
                return null;
              case QueryOrder.DESC_NULLS_LAST:
              case QueryOrder.desc_nulls_last:
                set(where, key, { $ne: null });
                break;
            }
          }
        } else {
          if (direction === 'forward') {
            switch (order) {
              case QueryOrder.ASC:
              case QueryOrder.asc:
                set(where, key, { $gt: value });
                break;
              case QueryOrder.ASC_NULLS_LAST:
              case QueryOrder.asc_nulls_last: {
                const paths = key.split('.');
                const prop = paths.pop()!;
                paths.push('$or');
                set(where, paths.join('.'), [{ [prop]: { $gt: value } }, { [prop]: null }]);
                break;
              }
              case QueryOrder.DESC:
              case QueryOrder.desc:
                set(where, key, { $lt: value });
                break;
              case QueryOrder.DESC_NULLS_FIRST:
              case QueryOrder.desc_nulls_first: {
                const paths = key.split('.');
                const prop = paths.pop()!;
                paths.push('$and');
                set(where, paths.join('.'), [{ [prop]: { $lt: value } }, { [prop]: { $ne: null } }]);
                break;
              }
              case QueryOrder.ASC_NULLS_FIRST:
              case QueryOrder.asc_nulls_first: {
                const paths = key.split('.');
                const prop = paths.pop()!;
                paths.push('$and');
                set(where, paths.join('.'), [{ [prop]: { $gt: value } }, { [prop]: { $ne: null } }]);
                break;
              }
              case QueryOrder.DESC_NULLS_LAST:
              case QueryOrder.desc_nulls_last: {
                const paths = key.split('.');
                const prop = paths.pop()!;
                paths.push('$or');
                set(where, paths.join('.'), [{ [prop]: { $lt: value } }, { [prop]: null }]);
                break;
              }
            }
          } else {
            switch (order) {
              case QueryOrder.ASC:
              case QueryOrder.asc:
                set(where, key, { $lt: value });
                break;
              case QueryOrder.ASC_NULLS_LAST:
              case QueryOrder.asc_nulls_last: {
                const paths = key.split('.');
                const prop = paths.pop()!;
                paths.push('$and');
                set(where, paths.join('.'), [{ [prop]: { $lt: value } }, { [prop]: { $ne: null } }]);
                break;
              }
              case QueryOrder.DESC:
              case QueryOrder.desc:
                set(where, key, { $gt: value });
                break;
              case QueryOrder.DESC_NULLS_FIRST:
              case QueryOrder.desc_nulls_first: {
                const paths = key.split('.');
                const prop = paths.pop()!;
                paths.push('$or');
                set(where, paths.join('.'), [{ [prop]: { $gt: value } }, { [prop]: null }]);
                break;
              }
              case QueryOrder.ASC_NULLS_FIRST:
              case QueryOrder.asc_nulls_first: {
                const paths = key.split('.');
                const prop = paths.pop()!;
                paths.push('$or');
                set(where, paths.join('.'), [{ [prop]: { $lt: value } }, { [prop]: null }]);
                break;
              }
              case QueryOrder.DESC_NULLS_LAST:
              case QueryOrder.desc_nulls_last: {
                const paths = key.split('.');
                const prop = paths.pop()!;
                paths.push('$and');
                set(where, paths.join('.'), [{ [prop]: { $gt: value } }, { [prop]: { $ne: null } }]);
                break;
              }
            }
          }
        }

        this.state
          .filter((_, j) => j < i)
          .forEach(([key, _, value]) => {
            set(where, key, value);
          });

        return where;
      })
      .filter((where) => where !== null);
  }
}
