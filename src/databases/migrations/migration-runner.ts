import { Umzug, MongoDBStorage } from 'umzug';
import { Pool } from 'pg';
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';

export type DbType = 'postgres' | 'mongo';

export interface MigrationConfig {
  dbType: DbType;
  dbUrl: string;
  migrationsDir: string; // Absolute path to host's migration folder
}

export class MigrationRunner {
  private config: MigrationConfig;

  constructor(config: MigrationConfig) {
    this.config = config;
  }

  // --- Helper: Parse SQL for Up/Down ---
  private parseSql(content: string) {
    const upMatch = content.match(/--\s*up\s([\s\S]+?)(?=--\s*down|$)/i);
    const downMatch = content.match(/--\s*down\s([\s\S]+)/i);
    return {
      up: upMatch ? upMatch[1].trim() : '',
      down: downMatch ? downMatch[1].trim() : ''
    };
  }

  // --- Factory: Create the Umzug Instance ---
  private async getMigrator() {
    const { dbType, dbUrl, migrationsDir } = this.config;

    if (dbType === 'postgres') {
      const pool = new Pool({ connectionString: dbUrl });

      return new Umzug({
        migrations: {
          glob: path.join(migrationsDir, '*.sql'),
          resolve: ({ name, path: filePath, context }) => {
            const content = fs.readFileSync(filePath!, 'utf8');
            const { up, down } = this.parseSql(content);
            return {
              name,
              up: async () => context.query(up),
              down: async () => context.query(down)
            };
          }
        },
        context: pool,
        storage: {
          async executed({ context }) {
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
        logger: console,
      });
    } 
    
    else if (dbType === 'mongo') {
      const client = await MongoClient.connect(dbUrl);
      const db = client.db();

      return new Umzug({
        migrations: { glob: path.join(migrationsDir, '*.ts') },
        context: db,
        storage: new MongoDBStorage({ collection: db.collection('migrations') }),
        logger: console,
      });
    }

    throw new Error(`Unsupported DB_TYPE: ${dbType}`);
  }

  // --- Action: Wipe Database ---
  private async wipeDatabase() {
    const { dbType, dbUrl } = this.config;
    console.log(`⚠️  Wiping ${dbType} database...`);

    if (dbType === 'postgres') {
      const pool = new Pool({ connectionString: dbUrl });
      try {
        await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      } finally {
        await pool.end();
      }
    } else if (dbType === 'mongo') {
      const client = await MongoClient.connect(dbUrl);
      await client.db().dropDatabase();
      await client.close();
    }
    console.log('✅ Database wiped.');
  }

  // --- Main Entry Point ---
  public async run(command: 'up' | 'down' | 'reset') {
    try {
      if (command === 'reset') {
        await this.wipeDatabase();
        console.log('🚀 Restarting migrations...');
        const migrator = await this.getMigrator();
        await migrator.up();
        await this.closeConnection(migrator);
        console.log('✅ Reset complete.');
        return;
      }

      const migrator = await this.getMigrator();

      switch (command) {
        case 'up':
          await migrator.up();
          console.log('✅ Migrations up to date.');
          break;
        case 'down':
          await migrator.down();
          console.log('✅ Reverted last migration.');
          break;
      }

      await this.closeConnection(migrator);

    } catch (err) {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    }
  }

  private async closeConnection(migrator: any) {
    if (this.config.dbType === 'postgres') {
       // Umzug context is the Pool in our PG implementation
       await (migrator.context as Pool).end();
    }
    // Mongo connection generally stays open or closes via process exit in CLI scripts,
    //  but you could store the client reference if you want strict cleanup.
  }
}