/**
 * Mutate an object by setting value at path.
 * Supports dot notation for nested path.
 * Automatically creates missing object paths.
 */
export function set<T extends object>(o: T, path: string, value: any): T {
  const paths = path.split('.') as (keyof T)[];
  const lastPath = paths.pop();

  paths.forEach((key) => {
    if (o[key] === undefined) o[key] = {} as any;
    o = o[key] as T;
  });

  if (lastPath) o[lastPath] = value;

  return o;
}

/**
 * Get value from object at path.
 * Supports dot notation for nested path.
 */
export function get<T extends object>(o: T, path: string): any {
  const paths = path.split('.') as (keyof T)[];

  for (const key of paths) {
    if (o[key] === undefined) return;
    o = o[key] as T;
  }

  return o;
}
