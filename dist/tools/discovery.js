import { query } from '../db.js';
// Topic category definitions with keywords for matching
const TOPIC_CATEGORIES = {
    demographics: {
        name: 'Demographics',
        keywords: ['age', 'sex', 'race', 'ethnic', 'population', 'citizen'],
    },
    income_poverty: {
        name: 'Income & Poverty',
        keywords: ['income', 'poverty', 'earnings', 'wage', 'salary'],
    },
    employment: {
        name: 'Employment & Occupation',
        keywords: ['employ', 'occupation', 'labor', 'workforce', 'job', 'unemploy'],
    },
    education: {
        name: 'Education',
        keywords: ['education', 'school', 'degree', 'college', 'enroll'],
    },
    housing: {
        name: 'Housing & Rent',
        keywords: ['housing', 'rent', 'mortgage', 'home', 'tenure', 'owner', 'vacant'],
    },
    health_disability: {
        name: 'Health & Disability',
        keywords: ['health', 'disability', 'insurance', 'disab'],
    },
    transportation: {
        name: 'Transportation & Commuting',
        keywords: ['transport', 'commut', 'travel', 'vehicle', 'car'],
    },
    language_immigration: {
        name: 'Language & Immigration',
        keywords: ['language', 'english', 'foreign', 'native', 'immigr', 'birth'],
    },
    internet: {
        name: 'Internet & Computer Access',
        keywords: ['internet', 'computer', 'broadband', 'device'],
    },
    family: {
        name: 'Family & Household Structure',
        keywords: ['family', 'household', 'marital', 'married', 'child', 'fertil'],
    },
};
/**
 * List available data topic categories
 */
export async function listTopics() {
    const topics = [];
    for (const [key, category] of Object.entries(TOPIC_CATEGORIES)) {
        // Build ILIKE conditions for keywords
        const keywordConditions = category.keywords
            .map(() => 'title ILIKE ?')
            .join(' OR ');
        const keywordParams = category.keywords.map((kw) => `%${kw}%`);
        // Count matching tables
        const countResult = await query(`SELECT 
         COUNT(DISTINCT table_id) as cnt,
         STRING_AGG(DISTINCT table_id, ', ' ORDER BY table_id) as examples
       FROM pct_db.table_metadata
       WHERE ${keywordConditions}`, keywordParams);
        const tableCount = countResult[0]?.cnt || 0;
        const exampleTables = countResult[0]?.examples
            ? countResult[0].examples.split(', ').slice(0, 3)
            : [];
        topics.push({
            name: category.name,
            description: `Tables related to ${category.name.toLowerCase()}`,
            table_count: tableCount,
            example_tables: exampleTables,
        });
    }
    return { topics };
}
/**
 * List all unique universes in the data
 */
export async function listUniverses(limit = 100) {
    const results = await query(`SELECT 
       universe,
       COUNT(DISTINCT table_id) as table_count,
       STRING_AGG(DISTINCT table_id, ', ' ORDER BY table_id) as example_tables
     FROM pct_db.table_metadata
     GROUP BY universe
     ORDER BY table_count DESC
     LIMIT ?`, [limit]);
    return {
        universes: results.map((row) => ({
            universe: row.universe,
            table_count: row.table_count,
            example_tables: row.example_tables
                ? row.example_tables.split(', ').slice(0, 3)
                : [],
        })),
        total_count: results.length,
    };
}
/**
 * Search table metadata by keyword
 * Searches table_id, title, universe, and labels
 *
 * @param searchQuery - Search term(s). Multiple words are searched with OR logic.
 * @param limit - Maximum results to return
 */
export async function searchData(searchQuery, limit = 20) {
    // Split query into words for OR matching
    const words = searchQuery.trim().split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
        return { query: searchQuery, results: [], total_matches: 0 };
    }
    // Build WHERE clause that matches ANY word in ANY field
    const wordConditions = words.map(() => `(
    table_id ILIKE '%' || ? || '%'
    OR title ILIKE '%' || ? || '%'
    OR universe ILIKE '%' || ? || '%'
    OR label ILIKE '%' || ? || '%'
  )`).join(' OR ');
    // Build label matching for each word
    const labelConditions = words.map(() => `label ILIKE '%' || ? || '%'`).join(' OR ');
    // Flatten params: each word needs 4 occurrences for the WHERE clause
    const whereParams = [];
    for (const word of words) {
        whereParams.push(word, word, word, word);
    }
    // Add label params and first word for ordering
    const labelParams = [...words];
    const orderParams = [words[0], words[0]];
    const results = await query(`SELECT 
       table_id,
       MAX(title) as title,
       MAX(universe) as universe,
       STRING_AGG(DISTINCT label, '; ') FILTER (
         WHERE ${labelConditions}
       ) as matching_labels
     FROM pct_db.table_metadata
     WHERE ${wordConditions}
     GROUP BY table_id
     ORDER BY 
       CASE WHEN table_id ILIKE '%' || ? || '%' THEN 0
            WHEN MAX(title) ILIKE '%' || ? || '%' THEN 1
            ELSE 2 END,
       table_id
     LIMIT ?`, [...labelParams, ...whereParams, ...orderParams, limit]);
    const searchResults = results.map((row) => ({
        table_id: row.table_id,
        title: row.title,
        universe: row.universe,
        matching_labels: row.matching_labels
            ? row.matching_labels.split('; ').slice(0, 5)
            : [],
    }));
    // Get total count with same WHERE clause
    const countResult = await query(`SELECT COUNT(DISTINCT table_id) as cnt
     FROM pct_db.table_metadata
     WHERE ${wordConditions}`, whereParams);
    return {
        query: searchQuery,
        results: searchResults,
        total_matches: countResult[0]?.cnt || 0,
    };
}
/**
 * Get detailed information about a specific ACS table
 */
export async function describeTable(tableId) {
    const results = await query(`SELECT 
       table_id,
       unique_id,
       line,
       label,
       title,
       universe
     FROM pct_db.table_metadata
     WHERE table_id = ?
     ORDER BY line`, [tableId]);
    if (results.length === 0) {
        return null;
    }
    const labels = results.map((row) => ({
        unique_id: row.unique_id,
        line: row.line,
        label: row.label,
    }));
    return {
        table_id: results[0].table_id,
        title: results[0].title,
        universe: results[0].universe,
        labels,
    };
}
