declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): {
      get(...values: unknown[]): Record<string, unknown> | undefined;
      run(...values: unknown[]): { changes: number };
    };
    close(): void;
  }
}
