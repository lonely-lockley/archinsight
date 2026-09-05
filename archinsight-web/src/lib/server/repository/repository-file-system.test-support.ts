import type { Queryable, QueryResult, TransactionalDatabase } from '$lib/server/database/types';
import type { RepositoryNode } from './types';

export const TEST_OWNER_ID = '5913933c-2268-41e1-a558-622dc11f675a';
export const TEST_REPOSITORY_ID = '1ad2ba2c-10a6-4f5f-997a-029065a700bc';
export const TEST_FILE_ID = '783a79f5-039a-42fe-97e2-15c2359767fa';

type RepositoryRecord = {
  id: string;
  owner_id: string;
  name: string;
  structure: RepositoryNode | null;
  created: string;
  updated: string;
};

type FileRecord = {
  id: string;
  owner_id: string;
  repository_id: string;
  file_name: string;
  content: string;
  level: string | null;
  project_identifier: string | null;
  updated: string;
};

export class FakeRepositoryDatabase implements TransactionalDatabase {
  readonly repositories = new Map<string, RepositoryRecord>();
  readonly files = new Map<string, FileRecord>();
  readonly queries: Array<{ sql: string; params: unknown[] }> = [];
  private revision = 10;

  constructor() {
    this.repositories.set(TEST_REPOSITORY_ID, {
      id: TEST_REPOSITORY_ID,
      owner_id: TEST_OWNER_ID,
      name: 'Project 1',
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-02T00:00:00.000Z',
      structure: {
        id: TEST_REPOSITORY_ID,
        parentId: null,
        name: '/',
        type: 'd',
        childNodes: [{
          id: TEST_FILE_ID,
          parentId: TEST_REPOSITORY_ID,
          name: 'archinsight.ai',
          type: 'f',
          childNodes: []
        }]
      }
    });
    this.files.set(TEST_FILE_ID, {
      id: TEST_FILE_ID,
      owner_id: TEST_OWNER_ID,
      repository_id: TEST_REPOSITORY_ID,
      file_name: 'archinsight.ai',
      content: 'context demo',
      level: null,
      project_identifier: null,
      updated: '2026-01-03T00:00:00.000Z'
    });
  }

  async transaction<T>(handler: (client: Queryable) => Promise<T>): Promise<T> {
    return handler(this);
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const statement = normalizeSql(sql);
    this.queries.push({ sql: statement, params: [...params] });
    if (statement.startsWith('select r.id, r.name, r.created')) {
      const summaries = [...this.repositories.values()]
        .filter((repo) => repo.owner_id === params[0])
        .map((repo) => {
          const files = [...this.files.values()].filter((file) => file.owner_id === repo.owner_id && file.repository_id === repo.id);
          return { ...repo, updated: [repo.updated, ...files.map((file) => file.updated)].sort().at(-1) ?? repo.updated, file_count: files.length };
        })
        .sort((left, right) => right.updated.localeCompare(left.updated) || left.name.localeCompare(right.name));
      return asResult(rows(summaries));
    }
    if (statement.startsWith('select id from public.repository') && statement.includes('lower(name)')) {
      return asResult(rows([...this.repositories.values()].filter((repo) =>
        repo.owner_id === params[0]
        && repo.name.toLowerCase() === String(params[1]).toLowerCase()
        && (params[2] === undefined || repo.id !== params[2])
      )));
    }
    if (statement.startsWith('select') && statement.includes('from public.repository') && statement.includes('and id = $2')) {
      const repo = this.repositories.get(String(params[1]));
      return asResult(rows(repo && repo.owner_id === params[0] ? [repo] : []));
    }
    if (statement.startsWith('select') && statement.includes('from public.repository') && statement.includes('and name = $2')) {
      return asResult(rows([...this.repositories.values()].filter((repo) => repo.owner_id === params[0] && repo.name === params[1])));
    }
    if (statement.startsWith('insert into public.repository')) {
      const timestamp = this.nextRevision();
      const repository: RepositoryRecord = {
        id: String(params[0]),
        owner_id: String(params[1]),
        name: String(params[2]),
        structure: JSON.parse(String(params[3])) as RepositoryNode,
        created: timestamp,
        updated: timestamp
      };
      this.repositories.set(repository.id, repository);
      return asResult(rows([repository]));
    }
    if (statement.includes('from public.file') && statement.includes('and id = $3')) {
      const file = this.files.get(String(params[2]));
      return asResult(rows(file && file.owner_id === params[0] && file.repository_id === params[1] ? [file] : []));
    }
    if (statement.includes('from public.file') && statement.includes('order by file_name')) {
      return asResult(rows([...this.files.values()]
        .filter((file) => file.owner_id === params[0] && file.repository_id === params[1])
        .sort((left, right) => left.file_name.localeCompare(right.file_name))));
    }
    if (statement.startsWith('insert into public.file')) {
      this.files.set(String(params[0]), {
        id: String(params[0]),
        owner_id: String(params[1]),
        repository_id: String(params[2]),
        file_name: String(params[3]),
        content: String(params[4] ?? ''),
        level: nullable(params[5]),
        project_identifier: nullable(params[6]),
        updated: this.nextRevision()
      });
      return asResult(changed());
    }
    if (statement.startsWith('update public.repository set name')) {
      const repo = this.repositories.get(String(params[1]));
      if (!repo || repo.owner_id !== params[0]) return { rows: [], rowCount: 0 };
      repo.name = String(params[2]);
      repo.updated = this.nextRevision();
      return asResult(rows([repo]));
    }
    if (statement.startsWith('select count(*)::integer as file_count')) {
      return asResult(rows([{ file_count: [...this.files.values()].filter((file) =>
        file.owner_id === params[0] && file.repository_id === params[1]
      ).length }]));
    }
    if (statement.startsWith('update public.file set content')) {
      const file = this.requireFile(String(params[2]));
      file.content = String(params[3] ?? '');
      file.level = nullable(params[4]);
      file.project_identifier = nullable(params[5]);
      file.updated = this.nextRevision();
      return asResult(changed());
    }
    if (statement.startsWith('update public.file set file_name')) {
      const file = this.requireFile(String(params[2]));
      file.file_name = String(params[3]);
      file.updated = this.nextRevision();
      return asResult(changed());
    }
    if (statement.startsWith('delete from public.file') && statement.includes('id = any')) {
      const ids = params[2] as string[];
      let rowCount = 0;
      for (const id of ids) if (this.files.delete(id)) rowCount += 1;
      return { rows: [], rowCount };
    }
    if (statement.startsWith('delete from public.file') && statement.includes('repository_id = $2') && !statement.includes('and id = $3')) {
      let rowCount = 0;
      for (const [id, file] of this.files) {
        if (file.owner_id === params[0] && file.repository_id === params[1] && this.files.delete(id)) rowCount += 1;
      }
      return { rows: [], rowCount };
    }
    if (statement.startsWith('delete from public.file')) {
      return { rows: [], rowCount: this.files.delete(String(params[2])) ? 1 : 0 };
    }
    if (statement.startsWith('update public.repository')) {
      const repo = this.repositories.get(String(params[1]));
      if (!repo || repo.owner_id !== params[0]) return { rows: [], rowCount: 0 };
      repo.structure = JSON.parse(String(params[2])) as RepositoryNode;
      repo.updated = this.nextRevision();
      return asResult(changed());
    }
    if (statement.startsWith('delete from public.repository')) {
      const repo = this.repositories.get(String(params[1]));
      if (!repo || repo.owner_id !== params[0]) return { rows: [], rowCount: 0 };
      this.repositories.delete(repo.id);
      return asResult(changed());
    }
    throw new Error(`Unexpected SQL in fake database: ${statement}`);
  }

  private requireFile(id: string): FileRecord {
    const file = this.files.get(id);
    if (!file) throw new Error(`Fake file not found: ${id}`);
    return file;
  }

  private nextRevision(): string {
    this.revision += 1;
    return `2026-01-04T00:00:${String(this.revision).padStart(2, '0')}.000Z`;
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/gu, ' ').trim().toLowerCase();
}

function rows<T extends Record<string, unknown>>(records: T[]): QueryResult<T> {
  return { rows: records, rowCount: records.length };
}

function changed(): QueryResult<Record<string, unknown>> {
  return { rows: [], rowCount: 1 };
}

function asResult<T extends Record<string, unknown>>(result: QueryResult<Record<string, unknown>>): QueryResult<T> {
  return result as QueryResult<T>;
}

function nullable(value: unknown): string | null {
  return value == null || String(value).trim() === '' ? null : String(value);
}
