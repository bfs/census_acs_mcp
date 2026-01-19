# Project Summary

## Purpose

MCP server providing Census American Community Survey (ACS) data access through natural language queries. Supports spatial lookups, percentile-based rankings, and data discovery.

## Architecture

- **Runtime**: TypeScript with Node.js
- **Database**: Embedded DuckDB (read-only)
- **Protocol**: Model Context Protocol (MCP)
- **Transport**: Stdio (local) or SSE (remote HTTP)

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Server                           │
│  ┌─────────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ MCP Handler │──│  Tools   │──│ DuckDB Connection │  │
│  └─────────────┘  └──────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌──────────────────────┐  ┌──────────────────────────────┐
│ json_summaries.db    │  │ percentiles.db               │
│ 68GB                 │  │ 75GB                         │
│ - geo_lookup         │  │ - acs_with_percentiles       │
│ - tiger_geometries   │  │ - table_metadata             │
└──────────────────────┘  └──────────────────────────────┘
```

## Database Sources

### json_summaries.db (68GB)

| Table | Rows | Description |
|-------|------|-------------|
| geo_lookup | 26.6M | Census data with JSON summaries, joined with geometry |
| tiger_geometries | 362K | Geographic boundaries with RTREE spatial index |

### percentiles.db (75GB)

| Table | Rows | Description |
|-------|------|-------------|
| acs_with_percentiles | ~3B | ACS estimates with national/state/county percentiles |
| table_metadata | ~50K | Table definitions, labels, universes |

## Database Schema

### geo_lookup
- `geo_id` (VARCHAR) - Census geographic identifier
- `name` (VARCHAR) - Human-readable name
- `geom` (GEOMETRY) - Geographic boundary
- `aland` (BIGINT) - Land area
- `universe` (VARCHAR) - Population universe
- `title` (VARCHAR) - Table title
- `labels_data` (JSON) - ACS data as JSON

### tiger_geometries
- `geo_id` (VARCHAR) - Census geographic identifier
- `name` (VARCHAR) - Human-readable name
- `geom` (GEOMETRY) - Geographic boundary with RTREE index
- `aland` (BIGINT) - Land area

### acs_with_percentiles
- `uid` (VARCHAR) - Unique metric identifier (e.g., B12001_010)
- `geo_id` (VARCHAR) - Census geographic identifier
- `table_id` (VARCHAR) - ACS table ID
- `estimate` (BIGINT) - Raw estimate value
- `summary_level` (VARCHAR) - Geographic level code
- `state_fips` (VARCHAR) - State FIPS code
- `county_fips` (VARCHAR) - County FIPS code
- `national_percentile` (FLOAT) - Percentile rank nationally
- `state_percentile` (FLOAT) - Percentile rank within state
- `county_percentile` (FLOAT) - Percentile rank within county

### table_metadata
- `table_id` (VARCHAR) - ACS table ID
- `unique_id` (VARCHAR) - Unique metric identifier
- `line` (DOUBLE) - Line number in table
- `label` (VARCHAR) - Human-readable label
- `title` (VARCHAR) - Table title
- `universe` (VARCHAR) - Population universe

## Geographic Summary Levels

| Code | Level | Example geo_id |
|------|-------|----------------|
| 040 | State | 0400000US06 (California) |
| 050 | County | 0500000US06037 (Los Angeles County) |
| 140 | Census Tract | 1400000US06037701000 |
| 150 | Block Group | 1500000US060377010001 |
| 310 | Metro Area (CBSA) | 310M700US31080 |
| 860 | ZIP Code (ZCTA) | 860Z200US90210 |

## Population Groups

The ACS data includes separate estimates for different race/ethnicity demographic subgroups. These are encoded in the geo_id structure.

### geo_id Format

```
SSSGGGGUS[FIPS...]
│  │
│  └── Population group code (4 chars)
└───── Summary level (3 chars)
```

Example: `04000A0US06` = State (040) + White alone (00A0) + California (06)

### Population Group Codes

| Code | Population |
|------|------------|
| 0000 | Total population (all races/ethnicities) |
| 00A0 | White alone |
| 00B0 | Black or African American alone |
| 00C0 | American Indian and Alaska Native alone |
| 00D0 | Asian alone |
| 00E0 | Native Hawaiian and Other Pacific Islander alone |
| 00F0 | Some other race alone |
| 00G0 | Two or more races |
| 00H0 | White alone, not Hispanic or Latino |
| 00I0 | Hispanic or Latino |

### Canonical vs Variant geo_ids

- **Canonical**: `0400000US06` - Total population for California
- **Variant**: `04000A0US06` - White alone population for California

When querying data, use `population_group` parameter to filter by demographic subgroup. Default is "0000" (total population).

