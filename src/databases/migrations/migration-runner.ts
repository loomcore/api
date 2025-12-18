import { Umzug, MongoDBStorage } from 'umzug';
import { Pool } from 'pg';
import { MongoClient } from 'mongodb';
import { DbType } from '../db-type.type.js';
import { IBaseApiConfig } from '../../models/base-api-config.interface.js';
import fs from 'fs';
import path from 'path';
import { buildMongoUrl } from '../mongo-db/utils/build-mongo-url.util.js';
import { buildPostgresUrl } from '../postgres/utils/build-postgres-url.util.js';

// Add this helper at the top or in a utils file
const getTimestamp = () => {
  const now = new Date();
  return now.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
};

export class MigrationRunner {
  private dbType: string;
  private dbUrl: string;
  private migrationsDir: string;
  private mongoClient: MongoClient | null = null;

  constructor(config: IBaseApiConfig) {
    this.dbType = config.app.dbType || 'mongodb';
    console.log('config', config); // todo: delete me
    this.dbUrl = this.dbType === 'postgres' ? buildPostgresUrl(config) : buildMongoUrl(config);
    this.migrationsDir = path.join(process.cwd(), 'database', 'migrations');
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
    if (this.dbType === 'postgres') {
      const pool = new Pool({ connectionString: this.dbUrl });

      return new Umzug({
        migrations: {
          glob: path.join(this.migrationsDir, '*.sql'),
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
    
    else if (this.dbType === 'mongodb') {
      const client = await MongoClient.connect(this.dbUrl);
      this.mongoClient = client; // Store client reference for cleanup
      const db = client.db();

      return new Umzug({
        migrations: { glob: path.join(this.migrationsDir, '*.ts') },
        context: db,
        storage: new MongoDBStorage({ collection: db.collection('migrations') }),
        logger: console,
      });
    }

    throw new Error(`Unsupported DB_TYPE: ${this.dbType}`);
  }

  // --- Action: Wipe Database ---
  private async wipeDatabase() {
    console.log(`⚠️  Wiping ${this.dbType} database...`);

    if (this.dbType === 'postgres') {
      const pool = new Pool({ connectionString: this.dbUrl });
      try {
        await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      } finally {
        await pool.end();
      }
    } else if (this.dbType === 'mongodb') {
      const client = await MongoClient.connect(this.dbUrl);
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
    if (this.dbType === 'postgres') {
       // Umzug context is the Pool in our PG implementation
       await (migrator.context as Pool).end();
    } else if (this.dbType === 'mongodb' && this.mongoClient) {
      await this.mongoClient.close();
      this.mongoClient = null;
    }
  }

  public async create(name: string) {
    if (!name) {
      throw new Error('Migration name is required');
    }

    // 1. Sanitize the name (my feature -> my_feature)
    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const filename = `${getTimestamp()}_${safeName}`;
    
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
    } else {
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