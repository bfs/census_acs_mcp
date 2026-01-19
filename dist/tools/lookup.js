import { query } from '../db.js';
import { SUMMARY_LEVELS, SUMMARY_LEVEL_NAMES } from '../types.js';
/**
 * Search for locations matching a query string
 * Returns a list of matches with their summary levels
 */
export async function searchLocations(searchQuery, summaryLevel, limit = 20) {
    const trimmed = searchQuery.trim();
    const params = [trimmed];
    // Build summary level filter
    let levelFilter = '';
    if (summaryLevel) {
        // Accept either code ("040") or name ("state")
        const levelCode = SUMMARY_LEVEL_NAMES[summaryLevel] || summaryLevel;
        levelFilter = `AND geo_id LIKE ? || '%'`;
        params.push(levelCode);
    }
    params.push(limit);
    const results = await query(`SELECT geo_id, name 
     FROM json_db.tiger_geometries 
     WHERE name ILIKE '%' || ? || '%'
     ${levelFilter}
     ORDER BY 
       CASE 
         WHEN geo_id LIKE '040%' THEN 1  -- States first
         WHEN geo_id LIKE '310%' THEN 2  -- Metros
         WHEN geo_id LIKE '050%' THEN 3  -- Counties
         WHEN geo_id LIKE '860%' THEN 4  -- ZIPs
         WHEN geo_id LIKE '140%' THEN 5  -- Tracts
         WHEN geo_id LIKE '150%' THEN 6  -- Block groups
         ELSE 7
       END,
       LENGTH(name),
       name
     LIMIT ?`, params);
    // Get total count
    const countParams = [trimmed];
    if (summaryLevel) {
        const levelCode = SUMMARY_LEVEL_NAMES[summaryLevel] || summaryLevel;
        countParams.push(levelCode);
    }
    const countResult = await query(`SELECT COUNT(*) as cnt
     FROM json_db.tiger_geometries 
     WHERE name ILIKE '%' || ? || '%'
     ${levelFilter}`, countParams);
    return {
        query: searchQuery,
        results: results.map((row) => {
            const level = getSummaryLevel(row.geo_id);
            return {
                geo_id: row.geo_id,
                name: row.name,
                summary_level: level,
                summary_level_name: SUMMARY_LEVELS[level] || 'unknown',
            };
        }),
        total_matches: countResult[0]?.cnt || 0,
    };
}
/**
 * List geographies by summary level
 * Optionally filter to children of a parent geography
 */
export async function listGeographies(summaryLevel, parentGeoId, limit = 100) {
    // Accept either code ("040") or name ("state")
    const levelCode = SUMMARY_LEVEL_NAMES[summaryLevel] || summaryLevel;
    const levelName = SUMMARY_LEVELS[levelCode] || summaryLevel;
    const params = [levelCode + '%'];
    let parentFilter = '';
    if (parentGeoId) {
        // Extract state FIPS from parent for filtering
        // e.g., "0400000US06" -> filter counties like "0500000US06%"
        const parentStateFips = parentGeoId.slice(-2);
        parentFilter = `AND geo_id LIKE '%US' || ?`;
        params.push(parentStateFips + '%');
    }
    // Only return canonical geo_ids (not race/ethnicity variants)
    const canonicalFilter = `AND geo_id ~ '^[0-9]{3}0+US[0-9]+$'`;
    params.push(limit);
    const results = await query(`SELECT geo_id, name 
     FROM json_db.tiger_geometries 
     WHERE geo_id LIKE ?
     ${parentFilter}
     ${canonicalFilter}
     ORDER BY name
     LIMIT ?`, params);
    // Get total count
    const countParams = [levelCode + '%'];
    if (parentGeoId) {
        const parentStateFips = parentGeoId.slice(-2);
        countParams.push(parentStateFips + '%');
    }
    const countResult = await query(`SELECT COUNT(*) as cnt
     FROM json_db.tiger_geometries 
     WHERE geo_id LIKE ?
     ${parentFilter}
     ${canonicalFilter}`, countParams);
    return {
        summary_level: levelCode,
        summary_level_name: levelName,
        parent_geo_id: parentGeoId,
        results: results.map((row) => ({
            geo_id: row.geo_id,
            name: row.name,
        })),
        total_count: countResult[0]?.cnt || 0,
    };
}
/**
 * Resolve a location string to a geo_id
 * Handles: ZIP codes, county names, geo_ids
 *
 * @param input - Location string (name, ZIP, or geo_id)
 * @param summaryLevel - Optional filter by summary level (e.g., "040" or "state")
 */
export async function resolveLocation(input, summaryLevel) {
    const trimmed = input.trim();
    // Check if it's already a geo_id (starts with digit and contains 'US')
    if (/^\d/.test(trimmed) && trimmed.includes('US')) {
        const result = await query(`SELECT geo_id, name FROM json_db.tiger_geometries WHERE geo_id = ?`, [trimmed]);
        if (result.length > 0) {
            return { geo_id: result[0].geo_id, name: result[0].name };
        }
    }
    // Check if it's a 5-digit ZIP code
    if (/^\d{5}$/.test(trimmed)) {
        const geoId = `860Z200US${trimmed}`;
        const result = await query(`SELECT geo_id, name FROM json_db.tiger_geometries WHERE geo_id = ?`, [geoId]);
        if (result.length > 0) {
            return { geo_id: geoId, name: trimmed }; // Use ZIP as name since tiger has "Unknown"
        }
    }
    // Build summary level filter
    let levelFilter = '';
    const params = [trimmed];
    if (summaryLevel) {
        const levelCode = SUMMARY_LEVEL_NAMES[summaryLevel] || summaryLevel;
        levelFilter = `AND geo_id LIKE ? || '%'`;
        params.push(levelCode);
    }
    // Search by name - prefer states over counties for ambiguous names
    const nameResults = await query(`SELECT geo_id, name 
     FROM json_db.tiger_geometries 
     WHERE name ILIKE '%' || ? || '%'
     ${levelFilter}
     ORDER BY 
       CASE 
         WHEN geo_id LIKE '040%' THEN 1  -- States first (changed from counties)
         WHEN geo_id LIKE '310%' THEN 2  -- Metros
         WHEN geo_id LIKE '050%' THEN 3  -- Counties
         ELSE 4
       END,
       LENGTH(name)
     LIMIT 1`, params);
    if (nameResults.length > 0) {
        return { geo_id: nameResults[0].geo_id, name: nameResults[0].name };
    }
    return null;
}
/**
 * Get the summary level code from a geo_id
 */
export function getSummaryLevel(geoId) {
    return geoId.substring(0, 3);
}
/**
 * Lookup census data by lat/lng coordinates
 */
export async function lookupLocation(latitude, longitude, tables) {
    // Find all geographic areas containing this point
    const geoResults = await query(`SELECT geo_id, name
     FROM json_db.tiger_geometries
     WHERE ST_Contains(geom, ST_Point(?, ?))
     ORDER BY 
       CASE 
         WHEN geo_id LIKE '150%' THEN 1  -- Block Group (most specific)
         WHEN geo_id LIKE '140%' THEN 2  -- Tract
         WHEN geo_id LIKE '860%' THEN 3  -- ZIP
         WHEN geo_id LIKE '050%' THEN 4  -- County
         WHEN geo_id LIKE '310%' THEN 5  -- Metro
         WHEN geo_id LIKE '040%' THEN 6  -- State
         ELSE 7
       END`, [longitude, latitude]);
    if (geoResults.length === 0) {
        return null;
    }
    // Use the most specific geography found
    const geo = geoResults[0];
    const summaryLevel = getSummaryLevel(geo.geo_id);
    // Build the query for table data
    let tableFilter = '';
    const params = [geo.geo_id];
    if (tables && tables.length > 0) {
        const placeholders = tables.map(() => '?').join(', ');
        tableFilter = `AND g.title IN (
      SELECT DISTINCT title FROM pct_db.table_metadata WHERE table_id IN (${placeholders})
    )`;
        params.push(...tables);
    }
    // Get census data for this location
    const dataResults = await query(`SELECT DISTINCT
       g.title,
       g.universe,
       g.labels_data
     FROM json_db.geo_lookup g
     WHERE g.geo_id = ?
     ${tableFilter}
     LIMIT 100`, params);
    const data = dataResults.map((row) => {
        // Extract table_id from title or use a placeholder
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
        geo_id: geo.geo_id,
        name: geo.name,
        summary_level: summaryLevel,
        data,
    };
}
