import type { Client, Pool, PoolClient } from 'pg';

/**
 * PostgreSQL driver handle used by {@link PostgresDatabase}.
 * Prefer a {@link Pool} for normal server usage so concurrent queries can use multiple connections.
 * A single {@link Client} is still supported (e.g. pg-mem in tests).
 * A {@link PoolClient} from {@link Pool.connect} works for short-lived migration-style code paths.
 */
export type PostgresConnection = Client | Pool | PoolClient;
