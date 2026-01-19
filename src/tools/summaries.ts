import { query } from '../db.js';
import { resolveLocation, getSummaryLevel } from './lookup.js';
import type {
  AreaSummaryResult,
  CompareAreasResult,
  ComparisonMetric,
  TableData,
} from '../types.js';

// Square meters to square miles conversion
const SQ_METERS_TO_SQ_MILES = 2.59e6;

/**
 * Get full census data summary for a geographic area
 */
export async function getAreaSummary(
  location: string,
  tables?: string[]
): Promise<AreaSummaryResult | null> {
  const resolved = await resolveLocation(location);
  if (!resolved) {
    return null;
  }

  const { geo_id, name } = resolved;
  const summaryLevel = getSummaryLevel(geo_id);

  // Get land area
  const areaResult = await query<{ aland: number }>(
    `SELECT aland FROM json_db.tiger_geometries WHERE geo_id = ?`,
    [geo_id]
  );
  const landAreaSqMiles = areaResult.length > 0 
    ? areaResult[0].aland / SQ_METERS_TO_SQ_MILES 
    : 0;

  // Build table filter
  let tableFilter = '';
  const params: unknown[] = [geo_id];

  if (tables && tables.length > 0) {
    const placeholders = tables.map(() => '?').join(', ');
    tableFilter = `AND g.title IN (
      SELECT DISTINCT title FROM pct_db.table_metadata WHERE table_id IN (${placeholders})
    )`;
    params.push(...tables);
  }

  // Get all census data for this location
  const dataResults = await query<{
    title: string;
    universe: string;
    labels_data: string;
  }>(
    `SELECT DISTINCT
       g.title,
       g.universe,
       g.labels_data
     FROM json_db.geo_lookup g
     WHERE g.geo_id = ?
     ${tableFilter}`,
    params
  );

  const tableData: TableData[] = dataResults.map((row) => {
    const tableId = row.title.split(' ')[0] || 'UNKNOWN';
    return {
      table_id: tableId,
      title: row.title,
      universe: row.universe,
      labels_data: typeof row.labels_data === 'string'
        ? JSON.parse(row.labels_data)
        : row.labels_data,
    };
  });

  return {
    geo_id,
    name,
    summary_level: summaryLevel,
    land_area_sq_miles: Math.round(landAreaSqMiles * 100) / 100,
    tables: tableData,
  };
}

/**
 * Compare census metrics between two geographic areas
 */
export async function compareAreas(
  location_a: string,
  location_b: string,
  metric_ids?: string[],
  table_ids?: string[]
): Promise<CompareAreasResult | null> {
  const resolvedA = await resolveLocation(location_a);
  const resolvedB = await resolveLocation(location_b);

  if (!resolvedA || !resolvedB) {
    return null;
  }

  // Build metric filter
  let metricFilter = '';
  const params: unknown[] = [resolvedA.geo_id, resolvedB.geo_id];

  if (metric_ids && metric_ids.length > 0) {
    const placeholders = metric_ids.map(() => '?').join(', ');
    metricFilter = `AND a.uid IN (${placeholders})`;
    params.push(...metric_ids);
  } else if (table_ids && table_ids.length > 0) {
    const placeholders = table_ids.map(() => '?').join(', ');
    metricFilter = `AND a.table_id IN (${placeholders})`;
    params.push(...table_ids);
  }

  // Get comparison data
  const comparisonResults = await query<{
    uid: string;
    label: string;
    value_a: number;
    value_b: number;
    percentile_a: number;
    percentile_b: number;
  }>(
    `SELECT 
       a.uid,
       m.label,
       a.estimate as value_a,
       b.estimate as value_b,
       a.national_percentile as percentile_a,
       b.national_percentile as percentile_b
     FROM pct_db.acs_with_percentiles a
     JOIN pct_db.acs_with_percentiles b 
       ON a.uid = b.uid
     JOIN pct_db.table_metadata m 
       ON a.uid = m.unique_id
     WHERE a.geo_id = ?
       AND b.geo_id = ?
       ${metricFilter}
     LIMIT 100`,
    params
  );

  const comparisons: ComparisonMetric[] = comparisonResults.map((row) => ({
    metric_id: row.uid,
    label: row.label,
    value_a: row.value_a,
    value_b: row.value_b,
    percentile_a: row.percentile_a,
    percentile_b: row.percentile_b,
  }));

  return {
    area_a: { geo_id: resolvedA.geo_id, name: resolvedA.name },
    area_b: { geo_id: resolvedB.geo_id, name: resolvedB.name },
    comparisons,
  };
}


