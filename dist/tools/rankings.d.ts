import type { RankAreasResult, ListPopulationGroupsResult } from '../types.js';
/**
 * List available population groups from the data
 * Population groups are race/ethnicity iterations encoded in geo_ids
 */
export declare function listPopulationGroups(): Promise<ListPopulationGroupsResult>;
export interface RankAreasParams {
    metric_id: string | string[];
    denominator_id?: string | string[];
    order?: 'desc' | 'asc';
    percentile_min?: number;
    percentile_max?: number;
    summary_level?: string;
    state_fips?: string;
    population_group?: string;
    min_population?: number;
    limit?: number;
}
/**
 * Rank areas by a metric or computed rate
 * Supports single metrics or arrays of metrics (which get summed)
 */
export declare function rankAreasByMetric(params: RankAreasParams): Promise<RankAreasResult>;
