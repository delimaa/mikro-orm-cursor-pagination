import { FilterQuery, QueryOrder, QueryOrderKeys, QueryOrderMap, wrap } from '@mikro-orm/core';
import { get, set } from './utils';

type CursorState<T extends object> = [string, QueryOrderKeys<T>, any][];

type Operator = '$gt' | '$lt';

const operatorToReverseOperator: Record<Operator, Operator> = {
  $gt: '$lt',
  $lt: '$gt',
};

const queryOrderToOperator: Record<QueryOrder, Operator> = {
  [QueryOrder.ASC]: '$gt',
  [QueryOrder.ASC_NULLS_LAST]: '$gt',
  [QueryOrder.ASC_NULLS_FIRST]: '$gt',
  [QueryOrder.DESC]: '$lt',
  [QueryOrder.DESC_NULLS_LAST]: '$lt',
  [QueryOrder.DESC_NULLS_FIRST]: '$lt',
  [QueryOrder.asc]: '$gt',
  [QueryOrder.asc_nulls_last]: '$gt',
  [QueryOrder.asc_nulls_first]: '$gt',
  [QueryOrder.desc]: '$lt',
  [QueryOrder.desc_nulls_last]: '$lt',
  [QueryOrder.desc_nulls_first]: '$lt',
};

const queryOrderToReverseQueryOrder: Record<QueryOrder, QueryOrder> = {
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
  private constructor(readonly state: CursorState<T>) {}

  static fromEntity<T extends object>(entity: T, orderBy: QueryOrderMap<T> | QueryOrderMap<T>[]): Cursor<T> {
    if ((Array.isArray(orderBy) && orderBy.length === 0) || Object.keys(orderBy).length === 0) {
      throw new Error('Cannot create cursor with empty orderBy');
    }

    const pojo = wrap(entity).toPOJO();
    const state: CursorState<T> = [];

    const walkQueryOrderMap = (order: QueryOrderMap<T>, prevKeys: string[] = []) => {
      Object.entries(order).forEach(([key, value]) => {
        const currKeys = [...prevKeys, key];

        if (typeof value === 'string') {
          const strKey = currKeys.join('.');
          const data = get(pojo, strKey);
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

  buildOrderBy({ direction }: { direction: 'forward' | 'backward' }): QueryOrderMap<T> {
    return this.state.reduce((acc, curr) => {
      const [key, order] = curr;
      set(acc, key.toString(), direction === 'forward' ? order : queryOrderToReverseQueryOrder[order as QueryOrder]);
      return acc;
    }, {} as QueryOrderMap<T>);
  }

  buildWhereOr({ direction }: { direction: 'forward' | 'backward' }): FilterQuery<T>[] {
    return this.state.map(([key, order, value], i) => {
      const filterQuery: FilterQuery<T> = {};

      let operator = queryOrderToOperator[order as QueryOrder];
      if (direction === 'backward') operator = operatorToReverseOperator[operator];

      set(filterQuery, key.toString(), { [operator]: value });

      this.state
        .filter((_, j) => j < i)
        .forEach(([key, _, value]) => {
          set(filterQuery, key.toString(), value);
        });

      return filterQuery;
    });
  }
}
