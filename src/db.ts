import { Database } from 'duckdb-async';
import { config } from './config.js';
import path from 'path';

let db: Database | null = null;

export async function getDatabase(): Promise<Database> {
  if (db) {
    return db;
  }

  db = await Database.create(':memory:');

  // Configure DuckDB
  await db.run(`SET memory_limit = '${config.dbMemoryLimit}'`);
  await db.run(`SET threads = ${config.dbThreads}`);

  // Attach databases read-only
  const jsonDbPath = path.join(config.dbPath, 'census_acs.production.json_summaries.db');
  const pctDbPath = path.join(config.dbPath, 'census_acs.production.percentiles.db');

  await db.run(`ATTACH '${jsonDbPath}' AS json_db (READ_ONLY)`);
  await db.run(`ATTACH '${pctDbPath}' AS pct_db (READ_ONLY)`);

  // Load spatial extension
  await db.run('INSTALL spatial; LOAD spatial;');

  // Load FTS extension for full-text search
  await db.run('INSTALL fts; LOAD fts;');

  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}

// Convert BigInt values to Numbers (DuckDB returns BigInt for aggregates)
function convertBigInts<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj === 'bigint') {
    return Number(obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(convertBigInts) as T;
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = convertBigInts(value);
    }
    return result as T;
  }
  return obj;
}

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const database = await getDatabase();
  
  // Create timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Query timeout')), config.queryTimeoutMs);
  });

  // Race between query and timeout
  const result = await Promise.race([
    database.all(sql, ...params),
    timeoutPromise,
  ]) as T[];

  // Convert BigInt values to Numbers for JSON serialization
  return convertBigInts(result);
}

export async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const results = await query<T>(sql, params);
  return results.length > 0 ? results[0] : null;
}


