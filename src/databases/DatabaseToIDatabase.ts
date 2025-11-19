import { Db } from "mongodb";
import { IDatabase } from "./database.interface.js";
import { Database } from "./database.js";
import { MongoDBDatabase } from "./mongoDb/database.mongo.js";

export function DatabaseToIDatabase(database: Database, pluralResourceName: string): IDatabase {
  if (database instanceof Db) {
    return new MongoDBDatabase(database, pluralResourceName);
  } else {
    throw Error('Database is not an instance of Db');
  }
}