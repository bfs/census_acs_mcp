# Tool Definitions

## Data Query Tools

### lookup_location

Get census data for a geographic point.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| latitude | number | Yes | Latitude coordinate |
| longitude | number | Yes | Longitude coordinate |
| tables | string[] | No | Filter to specific table IDs |

**Returns:**
```typescript
{
  geo_id: string;
  name: string;
  summary_level: string;
  data: Array<{
    table_id: string;
    title: string;
    universe: string;
    labels_data: object;
  }>;
}
```

### search_locations

Search for geographic locations by name. Useful for finding geo_ids when you know the place name.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| query | string | Yes | - | Location name to search for |
| summary_level | string | No | - | Filter by level: 040 (state), 050 (county), 140 (tract), 310 (metro), 860 (ZIP) |
| limit | number | No | 20 | Maximum results |

**Returns:**
```typescript
{
  query: string;
  results: Array<{
    geo_id: string;
    name: string;
    summary_level: string;
    summary_level_name: string;
  }>;
  total_matches: number;
}
```

### list_geographies

List all geographies at a given summary level. Useful for getting all states, all counties in a state, etc.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| summary_level | string | Yes | - | Geographic level: 040, 050, 140, 310, 860 (or names like "state", "county") |
| parent_geo_id | string | No | - | Parent geo_id to filter children (e.g., state geo_id to list its counties) |
| limit | number | No | 100 | Maximum results |

**Returns:**
```typescript
{
  summary_level: string;
  summary_level_name: string;
  parent_geo_id?: string;
  results: Array<{
    geo_id: string;
    name: string;
  }>;
  total_matches: number;
}
```

### rank_areas_by_metric

Rank geographic areas by a metric value or computed rate. Supports compound metrics (arrays of metric IDs that get summed) for calculating totals across categories.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| metric_id | string \| string[] | Yes | - | Metric unique ID or array of IDs to sum (e.g., "B12001_010" or ["B18135_003", "B18135_014"]) |
| denominator_id | string \| string[] | No | - | Denominator metric(s) for rate calculation |
| order | "desc" \| "asc" | No | "desc" | Sort order |
| percentile_min | number | No | 0 | Minimum percentile filter (0-1) |
| percentile_max | number | No | 1 | Maximum percentile filter (0-1) |
| summary_level | string | No | - | Geographic level: 040 (state), 050 (county), 140 (tract), 150 (block group), 860 (ZIP) |
| state_fips | string | No | - | Filter to state by FIPS code |
| population_group | string | No | "0000" | Population group code for race/ethnicity filtering. Use list_population_groups to see options. |
| min_population | number | No | 10000 | Minimum denominator value |
| limit | number | No | 10 | Maximum results |

**Returns:**
```typescript
{
  metric: string;
  results: Array<{
    geo_id: string;
    name: string;
    value: number;
    unit: "count" | "percent";
    national_percentile?: number;
  }>;
  total_matches: number;
}
```

**Example - Compound Metric:**
To calculate total disability rate (all ages), sum the three age-group disability metrics:
```json
{
  "metric_id": ["B18135_003", "B18135_014", "B18135_025"],
  "denominator_id": "B18135_001",
  "summary_level": "040"
}
```

### get_area_summary

Get full census data summary for a geographic area.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| location | string | Yes | geo_id, ZIP code, or place name |
| tables | string[] | No | Filter to specific table IDs |

**Returns:**
```typescript
{
  geo_id: string;
  name: string;
  summary_level: string;
  land_area_sq_miles: number;
  tables: Array<{
    table_id: string;
    title: string;
    universe: string;
    labels_data: object;
  }>;
}
```

### compare_areas

Compare census metrics between two geographic areas.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| location_a | string | Yes | First area (geo_id, ZIP, or name) |
| location_b | string | Yes | Second area (geo_id, ZIP, or name) |
| metric_ids | string[] | No | Specific metrics to compare |
| table_ids | string[] | No | Specific tables to compare |

**Returns:**
```typescript
{
  area_a: { geo_id: string; name: string };
  area_b: { geo_id: string; name: string };
  comparisons: Array<{
    metric_id: string;
    label: string;
    value_a: number;
    value_b: number;
    percentile_a: number;
    percentile_b: number;
  }>;
}
```

## Discovery Tools

### list_topics

List available data categories.

**Parameters:**
None

**Returns:**
```typescript
{
  topics: Array<{
    name: string;
    description: string;
    table_count: number;
    example_tables: string[];
  }>;
}
```

**Topic Categories:**
- Demographics (age, sex, race, ethnicity)
- Income & Poverty
- Employment & Occupation
- Education
- Housing & Rent
- Health & Disability
- Transportation & Commuting
- Language & Immigration
- Internet & Computer Access
- Family & Household Structure

### search_data

Search table metadata by keyword. Multi-word queries use OR logic (finds tables matching any word).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | string | Yes | Search term(s). Multiple words match with OR logic. |
| limit | number | No | Maximum results (default 20) |

**Returns:**
```typescript
{
  query: string;
  results: Array<{
    table_id: string;
    title: string;
    universe: string;
    matching_labels: string[];
  }>;
  total_matches: number;
}
```

### list_universes

List all unique data universes (populations) in the census data. Useful for discovering what populations are covered.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| limit | number | No | 100 | Maximum results |

**Returns:**
```typescript
{
  universes: Array<{
    universe: string;
    table_count: number;
    example_tables: string[];
  }>;
  total: number;
}
```

### list_population_groups

List available population groups (race/ethnicity iterations) from the data. Population groups are encoded in geo_ids and allow filtering metrics by demographic subgroups.

**Parameters:**
None

**Returns:**
```typescript
{
  groups: Array<{
    code: string;       // e.g., "0000", "00A0"
    name: string;       // e.g., "Total population", "White alone"
    record_count: number;
  }>;
}
```

**Known Population Group Codes:**
| Code | Name |
|------|------|
| 0000 | Total population |
| 00A0 | White alone |
| 00B0 | Black or African American alone |
| 00C0 | American Indian and Alaska Native alone |
| 00D0 | Asian alone |
| 00E0 | Native Hawaiian and Other Pacific Islander alone |
| 00F0 | Some other race alone |
| 00G0 | Two or more races |
| 00H0 | White alone, not Hispanic or Latino |
| 00I0 | Hispanic or Latino |

### describe_table

Get detailed information about a specific ACS table.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| table_id | string | Yes | ACS table ID (e.g., B12001) |

**Returns:**
```typescript
{
  table_id: string;
  title: string;
  universe: string;
  labels: Array<{
    unique_id: string;
    line: number;
    label: string;
  }>;
}
```

## Exploration Tools

### get_interesting_facts

Find outlier statistics for a geographic area.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| location | string | Yes | - | geo_id, ZIP code, or place name |
| threshold | number | No | 0.05 | Percentile threshold (top/bottom X%) |
| limit | number | No | 20 | Maximum facts to return |
| category | string | No | - | Filter to topic category |

**Returns:**
```typescript
{
  geo_id: string;
  name: string;
  facts: Array<{
    table_id: string;
    title: string;
    label: string;
    estimate: number;
    national_percentile: number;
    direction: "high" | "low";
    description: string;
  }>;
}
```


