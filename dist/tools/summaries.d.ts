import type { AreaSummaryResult, CompareAreasResult } from '../types.js';
/**
 * Get full census data summary for a geographic area
 */
export declare function getAreaSummary(location: string, tables?: string[]): Promise<AreaSummaryResult | null>;
/**
 * Compare census metrics between two geographic areas
 */
export declare function compareAreas(location_a: string, location_b: string, metric_ids?: string[], table_ids?: string[]): Promise<CompareAreasResult | null>;
