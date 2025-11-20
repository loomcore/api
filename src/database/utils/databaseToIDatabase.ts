import { Db } from "mongodb";
import { Database } from "../models/database.js";
import { MongoDBDatabase } from "../mongoDb/mongoDb.database.js";
import { IDatabase } from "../models/database.interface.js";

export function DatabaseToIDatabase(database: Database, pluralResourceName: string): IDatabase {
  if (database instanceof Db) {
    return new MongoDBDatabase(database, pluralResourceName);
  } else {
    throw Error('Database is not an instance of Db');
  }
}