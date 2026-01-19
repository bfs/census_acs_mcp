# Implementation Details

## DuckDB Connection Management

### Initialization

```typescript
import { Database } from 'duckdb-async';

const db = await Database.create(':memory:');
await db.run(`ATTACH '${dbPath}/census_acs.production.json_summaries.db' AS json_db (READ_ONLY)`);
await db.run(`ATTACH '${dbPath}/census_acs.production.percentiles.db' AS pct_db (READ_ONLY)`);
await db.run('INSTALL spatial; LOAD spatial;');
await db.run('INSTALL fts; LOAD fts;');
```

### Configuration

| Setting | Application |
|---------|-------------|
| `SET memory_limit` | Controls DuckDB memory usage |
| `SET threads` | Parallel query execution |
| `READ_ONLY` | Prevents accidental writes |

## Location Resolution

### ZIP Code
Pattern: 5 digits
```typescript
if (/^\d{5}$/.test(input)) {
  return `860Z200US${input}`;
}
```

### County Name
Search tiger_geometries by name:
```sql
SELECT geo_id, name 
FROM json_db.tiger_geometries 
WHERE name ILIKE '%' || ? || '%'
  AND geo_id LIKE '050%'
LIMIT 10;
```

### Lat/Lng Coordinates
Spatial point-in-polygon query:
```sql
SELECT geo_id, name
FROM json_db.tiger_geometries
WHERE ST_Contains(geom, ST_Point(?, ?))
ORDER BY 
  CASE 
    WHEN geo_id LIKE '150%' THEN 1  -- Block Group
    WHEN geo_id LIKE '140%' THEN 2  -- Tract
    WHEN geo_id LIKE '050%' THEN 3  -- County
    ELSE 4
  END;
```

## SQL Query Patterns

### Spatial Lookup (lookup_location)
```sql
SELECT 
  t.geo_id,
  t.name,
  g.title,
  g.universe,
  g.labels_data
FROM json_db.tiger_geometries t
LEFT JOIN json_db.geo_lookup g ON t.geo_id = g.geo_id
WHERE ST_Contains(t.geom, ST_Point($lng, $lat));
```

### Percentile Ranking (rank_areas_by_metric)

Without rate calculation:
```sql
SELECT 
  p.geo_id,
  t.name,
  p.estimate as value,
  p.national_percentile
FROM pct_db.acs_with_percentiles p
JOIN json_db.tiger_geometries t ON p.geo_id = t.geo_id
WHERE p.uid = $metric_id
  AND p.summary_level = $summary_level
  AND p.national_percentile >= $percentile_min
  AND p.national_percentile <= $percentile_max
ORDER BY p.national_percentile DESC
LIMIT $limit;
```

With rate calculation (single metrics):
```sql
SELECT 
  num.geo_id,
  t.name,
  ROUND(num.estimate * 100.0 / denom.estimate, 2) as value,
  num.national_percentile
FROM pct_db.acs_with_percentiles num
JOIN pct_db.acs_with_percentiles denom 
  ON num.geo_id = denom.geo_id 
  AND denom.uid = $denominator_id
JOIN json_db.tiger_geometries t ON num.geo_id = t.geo_id
WHERE num.uid = $metric_id
  AND num.summary_level = $summary_level
  AND denom.estimate >= $min_population
ORDER BY value DESC
LIMIT $limit;
```

With compound metrics (arrays of metric IDs):
```sql
WITH numerators AS (
  SELECT geo_id, SUM(estimate) as num_total
  FROM pct_db.acs_with_percentiles
  WHERE uid IN ($metric_id_1, $metric_id_2, ...)
  GROUP BY geo_id
),
denominators AS (
  SELECT geo_id, SUM(estimate) as denom_total
  FROM pct_db.acs_with_percentiles
  WHERE uid IN ($denom_id_1, $denom_id_2, ...)
  GROUP BY geo_id
)
SELECT 
  n.geo_id,
  COALESCE(t.name, n.geo_id) as name,
  ROUND(n.num_total * 100.0 / d.denom_total, 2) as value
FROM numerators n
JOIN denominators d ON n.geo_id = d.geo_id
LEFT JOIN json_db.tiger_geometries t ON n.geo_id = t.geo_id
WHERE d.denom_total >= $min_population
  AND SUBSTRING(n.geo_id, 4, 4) = $population_group
  AND n.geo_id LIKE '$summary_level%'
ORDER BY value DESC
LIMIT $limit;
```

### Percentile Range Query
```sql
SELECT 
  p.geo_id,
  t.name,
  p.estimate,
  p.national_percentile
FROM pct_db.acs_with_percentiles p
JOIN json_db.tiger_geometries t ON p.geo_id = t.geo_id
WHERE p.uid = $metric_id
  AND p.national_percentile BETWEEN $percentile_min AND $percentile_max
ORDER BY p.national_percentile
LIMIT $limit;
```

### Full-Text Search (search_data)

Multi-word queries use OR logic (matches any word):
```sql
-- For query "disability income", searches for tables matching either word
SELECT DISTINCT 
  table_id,
  title,
  universe,
  ARRAY_AGG(DISTINCT label) FILTER (WHERE label ILIKE '%disability%' OR label ILIKE '%income%') as matching_labels
FROM pct_db.table_metadata
WHERE (table_id ILIKE '%disability%' OR title ILIKE '%disability%' OR universe ILIKE '%disability%' OR label ILIKE '%disability%')
   OR (table_id ILIKE '%income%' OR title ILIKE '%income%' OR universe ILIKE '%income%' OR label ILIKE '%income%')
GROUP BY table_id, title, universe
LIMIT $limit;
```

### Population Group Filter

Filter by race/ethnicity demographic subgroup using geo_id structure:
```typescript
// geo_id format: SSSGGGGUS[FIPS...]
// Position 4-7 contains the 4-character population group code
const buildPopulationGroupFilter = (alias: string, groupCode: string): string => {
  return `AND SUBSTRING(${alias}.geo_id, 4, 4) = '${groupCode}'`;
};

// Example: Filter to total population (0000)
// WHERE ... AND SUBSTRING(p.geo_id, 4, 4) = '0000'
```

### Table Description (describe_table)
```sql
SELECT 
  table_id,
  unique_id,
  line,
  label,
  title,
  universe
FROM pct_db.table_metadata
WHERE table_id = $table_id
ORDER BY line;
```

### Interesting Facts (get_interesting_facts)
```sql
SELECT 
  m.table_id,
  m.title,
  m.label,
  p.estimate,
  p.national_percentile
FROM pct_db.acs_with_percentiles p
JOIN pct_db.table_metadata m ON p.uid = m.unique_id
WHERE p.geo_id = $geo_id
  AND (p.national_percentile > (1 - $threshold) 
       OR p.national_percentile < $threshold)
ORDER BY ABS(p.national_percentile - 0.5) DESC
LIMIT $limit;
```

## Topic Category Definitions

```typescript
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
```

## Error Handling

### Query Timeout

Queries timeout after 120 seconds (configurable via `CENSUS_ACS_QUERY_TIMEOUT_MS`).

```typescript
// Race between query and timeout
const timeoutPromise = new Promise<never>((_, reject) => {
  setTimeout(() => reject(new Error('Query timeout')), config.queryTimeoutMs);
});

const result = await Promise.race([
  database.all(sql, ...params),
  timeoutPromise,
]);
```

### Location Not Found
Return structured error when location resolution fails:
```typescript
{
  error: 'location_not_found',
  message: `Could not resolve location: ${input}`,
  suggestions: [] // Possible matches if partial
}
```

### Invalid Metric ID
Validate metric_id exists before querying:
```sql
SELECT EXISTS(
  SELECT 1 FROM pct_db.table_metadata 
  WHERE unique_id = $metric_id
) as valid;
```


