import type { ListTopicsResult, SearchDataResult, DescribeTableResult, ListUniversesResult } from '../types.js';
/**
 * List available data topic categories
 */
export declare function listTopics(): Promise<ListTopicsResult>;
/**
 * List all unique universes in the data
 */
export declare function listUniverses(limit?: number): Promise<ListUniversesResult>;
/**
 * Search table metadata by keyword
 * Searches table_id, title, universe, and labels
 *
 * @param searchQuery - Search term(s). Multiple words are searched with OR logic.
 * @param limit - Maximum results to return
 */
export declare function searchData(searchQuery: string, limit?: number): Promise<SearchDataResult>;
/**
 * Get detailed information about a specific ACS table
 */
export declare function describeTable(tableId: string): Promise<DescribeTableResult | null>;
