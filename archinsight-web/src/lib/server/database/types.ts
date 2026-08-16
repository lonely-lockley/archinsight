export type QueryRow = Record<string, unknown>;

export type QueryResult<T extends QueryRow> = {
  rows: T[];
  rowCount: number | null;
};

export type Queryable = {
  query<T extends QueryRow = QueryRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

export type TransactionalDatabase = Queryable & {
  transaction<T>(handler: (client: Queryable) => Promise<T>): Promise<T>;
};
