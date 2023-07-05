/**
 * Mutate an object by setting value at path.
 * Supports dot notation for nested path.
 * Automatically creates missing object paths.
 */
export function set<T extends object>(o: T, path: string, value: any): void {
  const paths = path.split('.') as (keyof T)[];
  const lastPath = paths.pop();

  paths.forEach((key) => {
    if (o[key] === undefined) o[key] = {} as any;
    o = o[key] as T;
  });

  if (lastPath) o[lastPath] = value;
}
