import { Database } from 'duckdb-async';
export declare function getDatabase(): Promise<Database>;
export declare function closeDatabase(): Promise<void>;
export declare function query<T>(sql: string, params?: unknown[]): Promise<T[]>;
export declare function queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>;
