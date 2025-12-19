# Database Migrations

This package provides a `MigrationRunner` class that handles database migrations for both PostgreSQL and MongoDB databases.

## Setup in Host API

To use the migration system in your host API, you must create a `migrate.ts` file in a `database` folder at the root of your repository.

### Directory Structure

```
your-repo/
├── database/
│   ├── migrate.ts          ← Create this file
│   └── migrations/         ← Migrations will be created here
│       └── *.sql (or *.ts)
└── ...
```

### migrate.ts File

Create `database/migrate.ts` with the following contents:

```typescript
import { first } from '#server/first';
import { MigrationRunner, DbType } from '@loomcore/api/databases';
import config from '#config/load-config';

// 1. Initialize
first.initialize(); 

const runner = new MigrationRunner(config);

const args = process.argv.slice(2);
const command = args[0] as 'up' | 'down' | 'reset' | 'create';

// Change: Join all remaining arguments with hyphens
// This turns ["add", "user", "table"] into "add-user-table"
const param = args.slice(1).join('-'); 

(async () => {
  if (command === 'create') {
    if (!param) {
      console.error('❌ Error: Please provide a migration name.');
      console.error('   Example: npm run migrate create add users table');
      process.exit(1);
    }
    await runner.create(param);
  } else {
    // If command is undefined (e.g. "npm run migrate"), the Library defaults command to 'up'.
    // If 'param' is undefined... and command is "up" it runs all, if command is "down" it runs the last down migration..
    // If 'param' is a filename, it runs up to/down to that file.
    await runner.run(command, param);
  }
})();
```

### Usage

After creating the `migrate.ts` file, add a single npm script to your `package.json`:

```json
{
  "scripts": {
    "migrate": "tsx database/migrate.ts"
  }
}
```

### Commands

- `npm run migrate` - Run all pending migrations (defaults to 'up')
- `npm run migrate up` - Run all pending migrations
- `npm run migrate up <filename>` - Run migrations up to (and including) the specified file
- `npm run migrate down` - Revert the last migration
- `npm run migrate down <filename>` - Revert migrations down to the specified file
- `npm run migrate reset` - Wipe the database and run all migrations from scratch
- `npm run migrate create <migration name>` - Create a new migration file (e.g., `npm run migrate create add users table`)

### Notes

- The migration runner automatically looks for migrations in `database/migrations/` at the root of your project
- For PostgreSQL, migrations are `.sql` files with `-- up` and `-- down` sections
- For MongoDB, migrations are `.ts` files that export `up` and `down` functions
- Migration files are automatically prefixed with a timestamp (YYYYMMDDHHMMSS) based on your configured timezone

