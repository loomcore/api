import { setIdSchema } from '@loomcore/common/validation';
import { Type } from '@sinclair/typebox';

// Set IdSchema based on TEST_DATABASE environment variable
// This must run before any modules that import @loomcore/common/models are loaded
// because getIdSchema() is called at module import time
// Note: setIdSchema() should automatically initialize the system user ID

// Ensure TEST_DATABASE is set - default to 'postgres' to match TestExpressApp default behavior
if (!process.env.TEST_DATABASE) {
  process.env.TEST_DATABASE = 'postgres';
}

const testDatabase = process.env.TEST_DATABASE;

if (testDatabase === 'postgres') {
  // Configure IdSchema for PostgreSQL (numeric IDs)
  // This should automatically initialize systemUserId to 0
  setIdSchema(Type.Number({ title: 'ID', integer: true, minimum: 1 }));
} else if (testDatabase === 'mongodb') {
  // Configure IdSchema for MongoDB (string ObjectIds)
  // This should automatically initialize systemUserId to 'system'
  setIdSchema(Type.String({ title: 'ID', pattern: '^[0-9a-fA-F]{24}$' }));
} else {
  throw new Error(`Invalid TEST_DATABASE value: ${testDatabase}. Must be 'postgres' or 'mongodb'`);
}

