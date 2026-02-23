import { Umzug, MongoDBStorage } from 'umzug';
import { Pool } from 'pg';
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { buildMongoUrl } from '../mongo-db/utils/build-mongo-url.util.js';
import { buildPostgresUrl } from '../postgres/utils/build-postgres-url.util.js';
import { getPostgresInitialSchema } from '../postgres/migrations/postgres-initial-schema.js';
import { getMongoInitialSchema } from '../mongo-db/migrations/mongo-initial-schema.js';
import { IInitialDbMigrationConfig } from '../../models/initial-database-config.interface.js';

export class MigrationRunner {
  private dbMigrationConfig: IInitialDbMigrationConfig;
  private dbType: string;
  private dbUrl: string;
  private migrationsDir: string;
  private primaryTimezone: string;
  private dbConnection: Pool | MongoClient | undefined;
  constructor(dbMigrationConfig: IInitialDbMigrationConfig) {
    this.dbMigrationConfig = dbMigrationConfig;
    this.dbType = dbMigrationConfig.app.dbType;
    this.dbUrl = this.dbType === 'postgres' ? buildPostgresUrl(dbMigrationConfig) : buildMongoUrl(dbMigrationConfig);
    this.migrationsDir = path.join(process.cwd(), 'database', 'migrations');
    /** * The IANA timezone identifier (e.g., 'America/Chicago', 'UTC') 
      * Used for generating the YYYYMMDDHHMMSS prefix on new files.
      * Note: CI/CD translates from 'eastern', 'central', etc in github vars 'America/New_York', 'America/Chicago', etc
      */
    this.primaryTimezone = dbMigrationConfig.app.primaryTimezone || 'UTC';
  }

  private getTimestamp(): string {
    const now = new Date();

    // Use Intl to format parts in the specific timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.primaryTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Extract parts to reconstruct YYYYMMDDHHMMSS
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

    return `${getPart('year')}${getPart('month')}${getPart('day')}${getPart('hour')}${getPart('minute')}${getPart('second')}`;
  }

  private parseSql(filename: string, content: string) {
    // Regex explanation:
    // 1. Look for "-- up" (case insensitive)
    // 2. Capture everything until "-- down" OR end of string
    const upMatch = content.match(/--\s*up\s+([\s\S]+?)(?=--\s*down|$)/i);
    const downMatch = content.match(/--\s*down\s+([\s\S]+)/i);

    const upSql = upMatch ? upMatch[1].trim() : '';
    const downSql = downMatch ? downMatch[1].trim() : '';

    // SAFETY CHECK: Fail if "up" is empty.
    // This prevents "successful" runs that actually did nothing.
    if (!upSql && this.dbType === 'postgres') {
      throw new Error(`❌ Parsing Error in ${filename}: Could not find '-- up' section or it was empty.`);
    }

    return { up: upSql, down: downSql };
  }

  // --- Factory: Create the Umzug Instance ---
  private async getMigrator() {
    // Verify migrations directory exists before starting
    if (!fs.existsSync(this.migrationsDir)) {
      throw new Error(`❌ Migrations directory not found at: ${this.migrationsDir}`);
    }

    if (this.dbType === 'postgres') {
      const pool = new Pool({
        host: this.dbMigrationConfig.database.host,
        user: this.dbMigrationConfig.database.username,
        password: this.dbMigrationConfig.database.password,
        port: this.dbMigrationConfig.database.port,
        database: this.dbMigrationConfig.database.name
      });
      this.dbConnection = pool;

      return new Umzug({
        migrations: async () => {
          // A. Get initial schema (Strategy Pattern)
          const initialSchema = getPostgresInitialSchema(this.dbMigrationConfig).map(m => ({
            name: m.name,
            up: async () => {
              console.log(`   Running [LIBRARY] ${m.name}...`);
              await m.up({ context: pool });
            },
            down: async () => {
              console.log(`   Running [LIBRARY] Undo ${m.name}...`);
              await m.down({ context: pool });
            }
          }));

          // B. Get file migrations
          // (Note: To mix async generators with globs, we read the files manually)
          const fileMigrations = this.loadFileMigrations(this.migrationsDir, 'sql', pool);

          // C. Sort and merge
          return [...initialSchema, ...fileMigrations].sort((a, b) => a.name.localeCompare(b.name));
        },
        context: pool,
        storage: {
          async executed({ context }) {
            // Explicit logging to verify table creation
            await context.query(`CREATE TABLE IF NOT EXISTS migrations (name text)`);
            const result = await context.query(`SELECT name FROM migrations`);
            return result.rows.map((r: any) => r.name);
          },
          async logMigration({ name, context }) {
            await context.query(`INSERT INTO migrations (name) VALUES ($1)`, [name]);
          },
          async unlogMigration({ name, context }) {
            await context.query(`DELETE FROM migrations WHERE name = $1`, [name]);
          }
        },
        logger: undefined, // Disable internal logger to avoid duplicate noise
      });
    }
    else if (this.dbType === 'mongodb') {
      const client = await MongoClient.connect(this.dbUrl);
      this.dbConnection = client;
      const db = client.db();

      // FIX: Normalize path separators for Windows Globbing
      const globPattern = path.join(this.migrationsDir, '*.ts').replace(/\\/g, '/');
      console.log(`🔎 Looking for migrations in: ${globPattern}`);

      return new Umzug({
        migrations: async () => {
          // A. Get initial schema (Strategy Pattern)
          const initialSchema = getMongoInitialSchema(this.dbMigrationConfig).map(m => ({
            name: m.name,
            up: async () => {
              console.log(`   Running [LIBRARY] ${m.name}...`);
              await m.up({ context: db });
            },
            down: async () => {
              console.log(`   Running [LIBRARY] Undo ${m.name}...`);
              await m.down({ context: db });
            }
          }));

          // B. Get file migrations
          const fileMigrations = this.loadFileMigrations(this.migrationsDir, 'ts', db);

          return [...initialSchema, ...fileMigrations].sort((a, b) => a.name.localeCompare(b.name));
        },
        context: db,
        storage: new MongoDBStorage({ collection: db.collection('migrations') }),
        logger: console,
      });
    }

    throw new Error(`Unsupported DB_TYPE: ${this.dbType}`);
  }

  // Helper to keep getMigrator clean
  private loadFileMigrations(dir: string, extension: string, context: any) {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(`.${extension}`))
      .map(f => {
        const fullPath = path.join(dir, f);

        // Dynamic Import for TS, Text Read for SQL
        if (extension === 'sql') {
          const content = fs.readFileSync(fullPath, 'utf8');
          const { up, down } = this.parseSql(f, content);
          return {
            name: f,
            up: async () => {
              console.log(`   Running [FILE] ${f}...`);
              await context.query(up);
            },
            down: async () => {
              console.log(`   Running [FILE] Undo ${f}...`);
              await context.query(down);
            }
          };
        } else {
          // For Mongo/TS, we might need a dynamic import helper or compilation step 
          // If running via tsx, dynamic import works:
          return {
            name: f,
            up: async () => {
              const mod = await import(fullPath);
              await mod.up({ context });
            },
            down: async () => {
              const mod = await import(fullPath);
              await mod.down({ context });
            }
          };
        }
      });
  }

  // --- Action: Wipe Database ---
  private async wipeDatabase() {
    console.log(`⚠️  Wiping ${this.dbType} database...`);

    if (this.dbType === 'postgres') {
      const pool = new Pool({
        host: this.dbMigrationConfig.database.host,
        user: this.dbMigrationConfig.database.username,
        password: this.dbMigrationConfig.database.password,
        port: this.dbMigrationConfig.database.port,
        database: this.dbMigrationConfig.database.name
      });
      try {
        await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      } finally {
        await pool.end();
      }
    }
    else if (this.dbType === 'mongodb') {
      const client = await MongoClient.connect(this.dbUrl);
      await client.db().dropDatabase();
      await client.close();
    }
    console.log('✅ Database wiped.');
  }

  // --- Main Entry Point ---
  public async run(command: 'up' | 'down' | 'reset' | 'create' = 'up', target?: string) {
    try {
      if (command === 'create') {
        if (!target) {
          throw new Error('Migration name is required for create. Example: npm run migrate create add-users-table');
        }
        await this.create(target);
        return;
      }

      if (command === 'reset') {

        if (!this.dbMigrationConfig) {
          throw new Error('Reset configuration not found');
        }
        await this.wipeDatabase();
        console.log('🚀 Restarting migrations...');
        const migrator = await this.getMigrator();
        await migrator.up(target ? { to: target } : undefined); // Support reset to specific point
        await this.closeConnection();
        console.log('✅ Reset complete.');
        return;
      }

      const migrator = await this.getMigrator();

      migrator.on('migrating', ({ name }) => console.log(`🚀 Migrating: ${name}`));
      migrator.on('migrated', ({ name }) => console.log(`✅ Completed: ${name}`));

      const pending = await migrator.pending();
      console.log(`ℹ️  Found ${pending.length} pending migrations.`);

      // Only warn if we are explicitly running 'up' and nothing is found
      if (pending.length === 0 && command === 'up') {
        console.log('⚠️  No pending migrations. (Check the path/glob if this is unexpected)');
      }

      switch (command) {
        case 'up':
          // If target is provided, migrate UP to (and including) that file
          await migrator.up(target ? { to: target } : undefined);
          console.log(target ? `✅ Migrated up to ${target}` : '✅ Migrations up to date.');
          break;
        case 'down':
          // If target is provided, migrate DOWN until that file is the LAST one remaining
          // (i.e., it reverts everything AFTER the target)
          // If no target, it just reverts the very last one (step: 1)
          if (target) {
            await migrator.down({ to: target });
            console.log(`✅ Reverted down to ${target}`);
          } else {
            await migrator.down();
            console.log('✅ Reverted last migration.');
          }
          break;
      }

      await this.closeConnection();

    } catch (err) {
      console.error('❌ Migration failed:', err);
      await this.closeConnection();
      process.exit(1);
    }
  }

  private async closeConnection() {
    if (!this.dbConnection) return;
    try {
      if (this.dbType === 'postgres') {
        await (this.dbConnection as Pool).end();
      }
      else if (this.dbType === 'mongo') {
        await (this.dbConnection as MongoClient).close();
      }
    }
    catch (e) {
      console.warn('Warning: Error closing connection', e);
    }
  }

  public async create(name: string) {
    if (!name) {
      throw new Error('Migration name is required');
    }

    // 1. Standardize the name (my feature -> my-feature)
    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `${this.getTimestamp()}_${safeName}`;

    // 2. determine extension and template based on DB_TYPE
    let extension = '';
    let content = '';

    if (this.dbType === 'postgres') {
      extension = 'sql';
      content = `-- Migration: ${safeName}
-- Created: ${new Date().toISOString()}

-- up
-- Write your CREATE/ALTER statements here...


-- down
-- Write your DROP/UNDO statements here...
`;
    }
    else {
      extension = 'ts';
      content = `import { Db } from 'mongodb';

// Migration: ${safeName}
// Created: ${new Date().toISOString()}

export const up = async ({ context: db }: { context: Db }) => {
  // await db.collection('...')....
};

export const down = async ({ context: db }: { context: Db }) => {
  // await db.collection('...')....
};
`;
    }

    // 3. Write the file
    const fullPath = path.join(this.migrationsDir, `${filename}.${extension}`);

    // Ensure directory exists
    if (!fs.existsSync(this.migrationsDir)) {
      fs.mkdirSync(this.migrationsDir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content);
    console.log(`✅ Created migration:\n   ${fullPath}`);
  }
}