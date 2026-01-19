# Census ACS MCP Server

MCP server for querying Census American Community Survey data.

Supports two transport modes:
- **Stdio** - Local CLI, for use with Claude Desktop
- **SSE** - Remote HTTP server, for hosting and sharing with others

## Prerequisites

- Node.js 24+ (LTS)
- DuckDB production databases from census_acs_duckdb_importer

## Installation

```bash
npm install
npm run build
```

## Database Setup

Create a symlink to the database directory:

```bash
ln -s /path/to/census_acs_duckdb_importer/output db
```

The `db/` directory should contain:
- `census_acs.production.json_summaries.db`
- `census_acs.production.percentiles.db`

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CENSUS_ACS_TRANSPORT` | `stdio` | Transport mode: `stdio` or `sse` |
| `CENSUS_ACS_PORT` | `3000` | HTTP port (SSE mode only) |
| `CENSUS_ACS_DB_PATH` | `./db` | Path to database directory |
| `CENSUS_ACS_DB_MEMORY_LIMIT` | `4GB` | DuckDB memory limit |
| `CENSUS_ACS_DB_THREADS` | `4` | DuckDB parallel threads |
| `CENSUS_ACS_QUERY_TIMEOUT_MS` | `120000` | Query timeout in milliseconds |

## Running the Server

### Local Mode (Stdio)

For use with Claude Desktop or other local MCP clients:

```bash
npm run start
```

### Remote Mode (SSE)

For hosting as an HTTP server:

```bash
CENSUS_ACS_TRANSPORT=sse npm run start
```

Or with a custom port:

```bash
CENSUS_ACS_TRANSPORT=sse CENSUS_ACS_PORT=8080 npm run start
```

The server will be available at `http://localhost:3000/sse`.

## Client Configuration

### Claude Desktop (Local/Stdio)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "census-acs": {
      "command": "node",
      "args": ["/path/to/census_acs_mcp/dist/index.js"]
    }
  }
}
```

### Remote SSE Server

Connect MCP clients to: `http://your-server:3000/sse`

## Deployment (SSE Mode)

For remote hosting:

1. Deploy to a server with the databases
2. Set environment variables:
   ```bash
   export CENSUS_ACS_TRANSPORT=sse
   export CENSUS_ACS_PORT=3000
   ```
3. Run the server: `npm run start`
4. Users connect via the SSE endpoint URL

## Available Tools

### Location & Geography
- `lookup_location` - Get census data for lat/lng coordinates
- `search_locations` - Search for locations by name
- `list_geographies` - List all geographies at a summary level (states, counties, etc.)

### Data Query
- `rank_areas_by_metric` - Rank areas by metric or computed rate (supports compound metrics)
- `get_area_summary` - Get full summary for a geographic area
- `compare_areas` - Compare two geographic areas

### Discovery
- `list_topics` - Browse available data categories
- `search_data` - Search table metadata by keyword
- `describe_table` - Get details about a specific ACS table
- `list_universes` - List all data universes (populations)
- `list_population_groups` - List available population group codes (race/ethnicity)

### Exploration
- `get_interesting_facts` - Find outlier statistics for an area

## Documentation

| Document | Description |
|----------|-------------|
| [docs/PROJECT_SUMMARY.md](docs/PROJECT_SUMMARY.md) | Architecture overview, database schema, geographic levels, and population groups |
| [docs/TOOL_DEFINITIONS.md](docs/TOOL_DEFINITIONS.md) | Detailed specifications for all tools, parameters, and return types |
| [docs/IMPLEMENTATION_DETAILS.md](docs/IMPLEMENTATION_DETAILS.md) | Technical implementation details, SQL patterns, and error handling |
