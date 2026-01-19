import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import express, { Request, Response } from 'express';

import { config } from './config.js';
import { getDatabase, closeDatabase } from './db.js';
import { lookupLocation, searchLocations, listGeographies } from './tools/lookup.js';
import { rankAreasByMetric, listPopulationGroups } from './tools/rankings.js';
import { getAreaSummary, compareAreas } from './tools/summaries.js';
import { listTopics, searchData, describeTable, listUniverses } from './tools/discovery.js';
import { getInterestingFacts } from './tools/exploration.js';

// Tool parameter schemas
const LookupLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  tables: z.array(z.string()).optional(),
});

const SearchLocationsSchema = z.object({
  query: z.string(),
  summary_level: z.string().optional(),
  limit: z.number().default(20),
});

const ListGeographiesSchema = z.object({
  summary_level: z.string(),
  parent_geo_id: z.string().optional(),
  limit: z.number().default(100),
});

const RankAreasByMetricSchema = z.object({
  metric_id: z.union([z.string(), z.array(z.string())]),
  denominator_id: z.union([z.string(), z.array(z.string())]).optional(),
  order: z.enum(['desc', 'asc']).default('desc'),
  percentile_min: z.number().min(0).max(1).default(0),
  percentile_max: z.number().min(0).max(1).default(1),
  summary_level: z.string().optional(),
  state_fips: z.string().optional(),
  population_group: z.string().default('0000'),
  min_population: z.number().default(10000),
  limit: z.number().default(10),
});

const GetAreaSummarySchema = z.object({
  location: z.string(),
  tables: z.array(z.string()).optional(),
});

const CompareAreasSchema = z.object({
  location_a: z.string(),
  location_b: z.string(),
  metric_ids: z.array(z.string()).optional(),
  table_ids: z.array(z.string()).optional(),
});

const SearchDataSchema = z.object({
  query: z.string(),
  limit: z.number().default(20),
});

const ListUniversesSchema = z.object({
  limit: z.number().default(100),
});

const DescribeTableSchema = z.object({
  table_id: z.string(),
});

const GetInterestingFactsSchema = z.object({
  location: z.string(),
  threshold: z.number().min(0).max(0.5).default(0.05),
  limit: z.number().default(20),
  category: z.string().optional(),
});

// Create MCP server
const server = new Server(
  {
    name: 'census-acs-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'lookup_location',
        description: 'Get census data for a geographic point specified by latitude and longitude coordinates',
        inputSchema: {
          type: 'object',
          properties: {
            latitude: { type: 'number', description: 'Latitude coordinate (-90 to 90)' },
            longitude: { type: 'number', description: 'Longitude coordinate (-180 to 180)' },
            tables: { type: 'array', items: { type: 'string' }, description: 'Filter to specific table IDs' },
          },
          required: ['latitude', 'longitude'],
        },
      },
      {
        name: 'search_locations',
        description: 'Search for geographic locations by name. Returns a list of matching areas with their summary levels, allowing you to find the right geo_id.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Location name to search for' },
            summary_level: { type: 'string', description: 'Filter by geographic level: 040 (state), 050 (county), 140 (tract), 310 (metro), 860 (ZIP). Can also use names like "state", "county".' },
            limit: { type: 'number', description: 'Maximum results to return (default 20)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_geographies',
        description: 'List all geographies at a given summary level. Useful for getting all states, all counties in a state, etc.',
        inputSchema: {
          type: 'object',
          properties: {
            summary_level: { type: 'string', description: 'Geographic level: 040 (state), 050 (county), 140 (tract), 310 (metro), 860 (ZIP). Can also use names like "state", "county".' },
            parent_geo_id: { type: 'string', description: 'Optional parent geo_id to filter children (e.g., state geo_id to list its counties)' },
            limit: { type: 'number', description: 'Maximum results to return (default 100)' },
          },
          required: ['summary_level'],
        },
      },
      {
        name: 'list_population_groups',
        description: 'List available population groups (race/ethnicity iterations) from the data. Use this to discover what population_group codes are available for filtering in rank_areas_by_metric.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'rank_areas_by_metric',
        description: 'Rank geographic areas by a metric value or computed rate. Supports compound metrics (arrays of metric_ids that get summed) for calculating totals across categories. Supports filtering by percentile range for queries like "top 10%", "bottom quartile", or "middle of the pack".',
        inputSchema: {
          type: 'object',
          properties: {
            metric_id: { 
              oneOf: [
                { type: 'string', description: 'Single metric unique ID (e.g., B12001_010)' },
                { type: 'array', items: { type: 'string' }, description: 'Array of metric IDs to sum together' }
              ],
              description: 'Metric unique ID or array of IDs to sum (e.g., B12001_010 or ["B18135_003", "B18135_014", "B18135_025"] for total disability)'
            },
            denominator_id: { 
              oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } }
              ],
              description: 'Denominator metric(s) for rate calculation. Can be single ID or array to sum.'
            },
            order: { type: 'string', enum: ['desc', 'asc'], description: 'Sort order (desc for highest, asc for lowest)' },
            percentile_min: { type: 'number', description: 'Minimum percentile filter (0-1)' },
            percentile_max: { type: 'number', description: 'Maximum percentile filter (0-1)' },
            summary_level: { type: 'string', description: 'Geographic level: 040 (state), 050 (county), 140 (tract), 150 (block group), 860 (ZIP)' },
            state_fips: { type: 'string', description: 'Filter to state by FIPS code' },
            population_group: { type: 'string', description: 'Population group code (default "0000" for total). Use list_population_groups to see available options.' },
            min_population: { type: 'number', description: 'Minimum denominator value' },
            limit: { type: 'number', description: 'Maximum results to return' },
          },
          required: ['metric_id'],
        },
      },
      {
        name: 'get_area_summary',
        description: 'Get full census data summary for a geographic area by geo_id, ZIP code, or place name',
        inputSchema: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'geo_id, 5-digit ZIP code, or place name' },
            tables: { type: 'array', items: { type: 'string' }, description: 'Filter to specific table IDs' },
          },
          required: ['location'],
        },
      },
      {
        name: 'compare_areas',
        description: 'Compare census metrics between two geographic areas',
        inputSchema: {
          type: 'object',
          properties: {
            location_a: { type: 'string', description: 'First area (geo_id, ZIP, or name)' },
            location_b: { type: 'string', description: 'Second area (geo_id, ZIP, or name)' },
            metric_ids: { type: 'array', items: { type: 'string' }, description: 'Specific metric IDs to compare' },
            table_ids: { type: 'array', items: { type: 'string' }, description: 'Specific table IDs to compare' },
          },
          required: ['location_a', 'location_b'],
        },
      },
      {
        name: 'list_topics',
        description: 'List available data topic categories with table counts and examples',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'search_data',
        description: 'Search table metadata by keyword to find available census data. Multi-word queries use OR logic (finds tables matching any word).',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term(s). Multiple words are matched with OR logic.' },
            limit: { type: 'number', description: 'Maximum results' },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_universes',
        description: 'List all unique data universes (populations) in the census data. Useful for discovering what populations are covered.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Maximum results (default 100)' },
          },
          required: [],
        },
      },
      {
        name: 'describe_table',
        description: 'Get detailed information about a specific ACS table including all its labels',
        inputSchema: {
          type: 'object',
          properties: {
            table_id: { type: 'string', description: 'ACS table ID (e.g., B12001)' },
          },
          required: ['table_id'],
        },
      },
      {
        name: 'get_interesting_facts',
        description: 'Find outlier statistics for a geographic area - metrics where the area ranks unusually high or low compared to national averages',
        inputSchema: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'geo_id, ZIP code, or place name' },
            threshold: { type: 'number', description: 'Percentile threshold (0-0.5). Default 0.05 finds top/bottom 5%' },
            limit: { type: 'number', description: 'Maximum facts to return' },
            category: { type: 'string', description: 'Filter to topic category (demographics, income, employment, education, housing, health, transportation, language, internet, family)' },
          },
          required: ['location'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Ensure database is initialized
    await getDatabase();

    switch (name) {
      case 'lookup_location': {
        const params = LookupLocationSchema.parse(args);
        const result = await lookupLocation(params.latitude, params.longitude, params.tables);
        if (!result) {
          return { content: [{ type: 'text', text: 'No geographic area found at the specified coordinates' }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'search_locations': {
        const params = SearchLocationsSchema.parse(args);
        const result = await searchLocations(params.query, params.summary_level, params.limit);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list_geographies': {
        const params = ListGeographiesSchema.parse(args);
        const result = await listGeographies(params.summary_level, params.parent_geo_id, params.limit);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list_population_groups': {
        const result = await listPopulationGroups();
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'rank_areas_by_metric': {
        const params = RankAreasByMetricSchema.parse(args);
        const result = await rankAreasByMetric(params);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get_area_summary': {
        const params = GetAreaSummarySchema.parse(args);
        const result = await getAreaSummary(params.location, params.tables);
        if (!result) {
          return { content: [{ type: 'text', text: `Could not resolve location: ${params.location}` }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'compare_areas': {
        const params = CompareAreasSchema.parse(args);
        const result = await compareAreas(
          params.location_a,
          params.location_b,
          params.metric_ids,
          params.table_ids
        );
        if (!result) {
          return { content: [{ type: 'text', text: 'Could not resolve one or both locations' }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list_topics': {
        const result = await listTopics();
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'search_data': {
        const params = SearchDataSchema.parse(args);
        const result = await searchData(params.query, params.limit);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list_universes': {
        const params = ListUniversesSchema.parse(args);
        const result = await listUniverses(params.limit);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'describe_table': {
        const params = DescribeTableSchema.parse(args);
        const result = await describeTable(params.table_id);
        if (!result) {
          return { content: [{ type: 'text', text: `Table not found: ${params.table_id}` }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get_interesting_facts': {
        const params = GetInterestingFactsSchema.parse(args);
        const result = await getInterestingFacts(
          params.location,
          params.threshold,
          params.limit,
          params.category
        );
        if (!result) {
          return { content: [{ type: 'text', text: `Could not resolve location: ${params.location}` }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { content: [{ type: 'text', text: `Error: ${message}` }] };
  }
});

// Start server with stdio transport (for local CLI use)
async function startStdio() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Start server with SSE transport (for remote HTTP hosting)
async function startSSE() {
  const app = express();
  
  // Store transports for cleanup
  const transports = new Map<string, SSEServerTransport>();

  // SSE endpoint for MCP connections
  app.get('/sse', (req: Request, res: Response) => {
    const sessionId = Math.random().toString(36).substring(7);
    console.log(`New SSE connection: ${sessionId}`);
    
    const transport = new SSEServerTransport('/messages', res);
    transports.set(sessionId, transport);
    
    server.connect(transport);
    
    req.on('close', () => {
      console.log(`SSE connection closed: ${sessionId}`);
      transports.delete(sessionId);
    });
  });

  // Messages endpoint for client-to-server communication
  app.post('/messages', express.json(), (req: Request, res: Response) => {
    // Find the transport for this session and handle the message
    // SSEServerTransport handles this internally via the response object
    res.status(202).send('Accepted');
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', transport: 'sse' });
  });

  app.listen(config.port, () => {
    console.log(`Census ACS MCP Server (SSE) listening on port ${config.port}`);
    console.log(`Connect via: http://localhost:${config.port}/sse`);
  });
}

// Main entry point
async function main() {
  // Pre-initialize database connection
  await getDatabase();
  console.log('Database connected');

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await closeDatabase();
    process.exit(0);
  });

  // Start appropriate transport
  if (config.transport === 'sse') {
    await startSSE();
  } else {
    await startStdio();
  }
}

main().catch(console.error);

