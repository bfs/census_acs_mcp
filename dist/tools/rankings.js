import { query } from '../db.js';
// Known population group codes and their names
// These are derived from ACS table naming conventions
const POPULATION_GROUP_NAMES = {
    '0000': 'Total population',
    '00A0': 'White alone',
    '00B0': 'Black or African American alone',
    '00C0': 'American Indian and Alaska Native alone',
    '00D0': 'Asian alone',
    '00E0': 'Native Hawaiian and Other Pacific Islander alone',
    '00F0': 'Some other race alone',
    '00G0': 'Two or more races',
    '00H0': 'White alone, not Hispanic or Latino',
    '00I0': 'Hispanic or Latino',
    'C201': 'ACS 5-year estimate variant',
    'C243': 'ACS 5-year estimate variant',
};
/**
 * List available population groups from the data
 * Population groups are race/ethnicity iterations encoded in geo_ids
 */
export async function listPopulationGroups() {
    // Query distinct group codes from state-level data
    const results = await query(`SELECT 
       SUBSTRING(geo_id, 4, 4) as group_code,
       COUNT(*) as record_count
     FROM pct_db.acs_with_percentiles
     WHERE geo_id LIKE '040%'
     GROUP BY SUBSTRING(geo_id, 4, 4)
     ORDER BY record_count DESC`);
    const groups = results.map((row) => ({
        code: row.group_code,
        name: POPULATION_GROUP_NAMES[row.group_code] || `Unknown (${row.group_code})`,
        record_count: row.record_count,
    }));
    return { groups };
}
/**
 * Rank areas by a metric or computed rate
 * Supports single metrics or arrays of metrics (which get summed)
 */
export async function rankAreasByMetric(params) {
    const { metric_id, denominator_id, order = 'desc', percentile_min = 0, percentile_max = 1, summary_level, state_fips, population_group = '0000', // Default to total population
    min_population = 10000, limit = 10, } = params;
    // Normalize to arrays
    const metricIds = Array.isArray(metric_id) ? metric_id : [metric_id];
    const denominatorIds = denominator_id
        ? (Array.isArray(denominator_id) ? denominator_id : [denominator_id])
        : null;
    // Check if we're using compound metrics (arrays)
    const isCompound = metricIds.length > 1 || (denominatorIds && denominatorIds.length > 1);
    // Build population group filter
    // geo_id format: summary_level (3) + group_code (4) + "US" + FIPS
    // e.g., "0400000US06" = state (040) + total (0000) + California (06)
    const buildPopulationGroupFilter = (alias) => {
        if (!population_group)
            return '';
        return `AND SUBSTRING(${alias}.geo_id, 4, 4) = '${population_group}'`;
    };
    // Get metric label for response
    const firstMetricId = metricIds[0];
    const metricInfo = await query(`SELECT title, label FROM pct_db.table_metadata WHERE unique_id = ?`, [firstMetricId]);
    let metricLabel = metricInfo.length > 0
        ? `${metricInfo[0].title}: ${metricInfo[0].label}`
        : firstMetricId;
    if (isCompound) {
        metricLabel = `Sum of ${metricIds.length} metrics (${metricIds.slice(0, 3).join(', ')}${metricIds.length > 3 ? '...' : ''})`;
    }
    let results;
    let totalMatches;
    // Helper to build IN clause for metric IDs
    const buildInClause = (ids) => {
        const placeholders = ids.map(() => '?').join(', ');
        return { clause: `(${placeholders})`, params: ids };
    };
    if (denominatorIds) {
        // Rate-based ranking (compound or single)
        const numIn = buildInClause(metricIds);
        const denomIn = buildInClause(denominatorIds);
        const popGroupFilterN = buildPopulationGroupFilter('n'); // Use 'n' alias for CTEs
        const sql = `
      WITH numerators AS (
        SELECT geo_id, SUM(estimate) as num_total
        FROM pct_db.acs_with_percentiles
        WHERE uid IN ${numIn.clause}
        GROUP BY geo_id
      ),
      denominators AS (
        SELECT geo_id, SUM(estimate) as denom_total
        FROM pct_db.acs_with_percentiles
        WHERE uid IN ${denomIn.clause}
        GROUP BY geo_id
      )
      SELECT 
        n.geo_id,
        COALESCE(t.name, n.geo_id) as name,
        ROUND(n.num_total * 100.0 / d.denom_total, 2) as value
      FROM numerators n
      JOIN denominators d ON n.geo_id = d.geo_id
      LEFT JOIN json_db.tiger_geometries t ON n.geo_id = t.geo_id
      WHERE d.denom_total >= ?
        ${popGroupFilterN}
        ${summary_level ? `AND n.geo_id LIKE '${summary_level}%'` : ''}
        ${state_fips ? `AND n.geo_id LIKE '%US${state_fips}%'` : ''}
      ORDER BY value ${order === 'desc' ? 'DESC' : 'ASC'}
      LIMIT ?
    `;
        const queryParams = [
            ...numIn.params,
            ...denomIn.params,
            min_population,
            limit,
        ];
        const rows = await query(sql, queryParams);
        results = rows.map((row) => ({
            geo_id: row.geo_id,
            name: row.name,
            value: row.value,
            unit: 'percent',
        }));
        // Get total count
        const countSql = `
      WITH numerators AS (
        SELECT geo_id, SUM(estimate) as num_total
        FROM pct_db.acs_with_percentiles
        WHERE uid IN ${numIn.clause}
        GROUP BY geo_id
      ),
      denominators AS (
        SELECT geo_id, SUM(estimate) as denom_total
        FROM pct_db.acs_with_percentiles
        WHERE uid IN ${denomIn.clause}
        GROUP BY geo_id
      )
      SELECT COUNT(*) as cnt
      FROM numerators n
      JOIN denominators d ON n.geo_id = d.geo_id
      WHERE d.denom_total >= ?
        ${popGroupFilterN}
        ${summary_level ? `AND n.geo_id LIKE '${summary_level}%'` : ''}
        ${state_fips ? `AND n.geo_id LIKE '%US${state_fips}%'` : ''}
    `;
        const countParams = [
            ...numIn.params,
            ...denomIn.params,
            min_population,
        ];
        const countResult = await query(countSql, countParams);
        totalMatches = countResult[0]?.cnt || 0;
    }
    else if (isCompound) {
        // Compound metric without denominator - sum values
        const metricIn = buildInClause(metricIds);
        const popGroupFilterP = buildPopulationGroupFilter('p');
        const sql = `
      SELECT 
        p.geo_id,
        COALESCE(t.name, p.geo_id) as name,
        SUM(p.estimate) as value
      FROM pct_db.acs_with_percentiles p
      LEFT JOIN json_db.tiger_geometries t ON p.geo_id = t.geo_id
      WHERE p.uid IN ${metricIn.clause}
        ${popGroupFilterP}
        ${summary_level ? `AND p.geo_id LIKE '${summary_level}%'` : ''}
        ${state_fips ? `AND p.geo_id LIKE '%US${state_fips}%'` : ''}
      GROUP BY p.geo_id, t.name
      ORDER BY value ${order === 'desc' ? 'DESC' : 'ASC'}
      LIMIT ?
    `;
        const queryParams = [...metricIn.params, limit];
        const rows = await query(sql, queryParams);
        results = rows.map((row) => ({
            geo_id: row.geo_id,
            name: row.name,
            value: row.value,
            unit: 'count',
        }));
        // Get total count
        const countSql = `
      SELECT COUNT(DISTINCT geo_id) as cnt
      FROM pct_db.acs_with_percentiles p
      WHERE p.uid IN ${metricIn.clause}
        ${popGroupFilterP}
        ${summary_level ? `AND p.geo_id LIKE '${summary_level}%'` : ''}
        ${state_fips ? `AND p.geo_id LIKE '%US${state_fips}%'` : ''}
    `;
        const countResult = await query(countSql, metricIn.params);
        totalMatches = countResult[0]?.cnt || 0;
    }
    else {
        // Single metric, no denominator - use original logic with percentiles
        const popGroupFilterP = buildPopulationGroupFilter('p');
        const sql = `
      SELECT 
        p.geo_id,
        COALESCE(t.name, p.geo_id) as name,
        p.estimate as value,
        p.national_percentile
      FROM pct_db.acs_with_percentiles p
      LEFT JOIN json_db.tiger_geometries t ON p.geo_id = t.geo_id
      WHERE p.uid = ?
        AND p.national_percentile >= ?
        AND p.national_percentile <= ?
        ${popGroupFilterP}
        ${summary_level ? 'AND p.summary_level = ?' : ''}
        ${state_fips ? 'AND p.state_fips = ?' : ''}
      ORDER BY p.national_percentile ${order === 'desc' ? 'DESC' : 'ASC'}
      LIMIT ?
    `;
        const queryParams = [
            metricIds[0],
            percentile_min,
            percentile_max,
        ];
        if (summary_level)
            queryParams.push(summary_level);
        if (state_fips)
            queryParams.push(state_fips);
        queryParams.push(limit);
        const rows = await query(sql, queryParams);
        results = rows.map((row) => ({
            geo_id: row.geo_id,
            name: row.name,
            value: row.value,
            unit: 'count',
            national_percentile: row.national_percentile,
        }));
        // Get total count
        const countSql = `
      SELECT COUNT(*) as cnt
      FROM pct_db.acs_with_percentiles p
      WHERE p.uid = ?
        AND p.national_percentile >= ?
        AND p.national_percentile <= ?
        ${popGroupFilterP}
        ${summary_level ? 'AND p.summary_level = ?' : ''}
        ${state_fips ? 'AND p.state_fips = ?' : ''}
    `;
        const countParams = [
            metricIds[0],
            percentile_min,
            percentile_max,
        ];
        if (summary_level)
            countParams.push(summary_level);
        if (state_fips)
            countParams.push(state_fips);
        const countResult = await query(countSql, countParams);
        totalMatches = countResult[0]?.cnt || 0;
    }
    return {
        metric: metricLabel,
        results,
        total_matches: totalMatches,
    };
}
