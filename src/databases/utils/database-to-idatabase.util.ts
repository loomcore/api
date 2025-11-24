import { Db } from "mongodb";
import { Database } from "../models/database.js";
import { MongoDBDatabase } from "../mongo-db/mongo-db.database.js";
import { IDatabase } from "../models/database.interface.js";
import { PostgresDatabase } from "../postgres/postgres.database.js";
import { Client } from "pg";

  // Check if it's a PostgreSQL client by checking for the 'query' method

export function DatabaseToIDatabase(database: Database, pluralResourceName: string): IDatabase {
  if (database instanceof Db) {
    return new MongoDBDatabase(database, pluralResourceName);
  } else if (database && typeof database === 'object' && 'query' in database && typeof (database as any).query === 'function') {
    return new PostgresDatabase(database as Client, pluralResourceName);
  } else {
    throw Error('Database is not an instance of Db');
  }
}