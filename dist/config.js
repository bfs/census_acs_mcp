export const config = {
    // Transport: 'stdio' for local CLI, 'sse' for remote HTTP server
    transport: (process.env.CENSUS_ACS_TRANSPORT || 'stdio'),
    port: parseInt(process.env.CENSUS_ACS_PORT || '3000', 10),
    // Database configuration
    dbPath: process.env.CENSUS_ACS_DB_PATH || './db',
    dbMemoryLimit: process.env.CENSUS_ACS_DB_MEMORY_LIMIT || '4GB',
    dbThreads: parseInt(process.env.CENSUS_ACS_DB_THREADS || '4', 10),
    queryTimeoutMs: parseInt(process.env.CENSUS_ACS_QUERY_TIMEOUT_MS || '120000', 10),
};
