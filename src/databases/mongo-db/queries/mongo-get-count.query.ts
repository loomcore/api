import { Db } from "mongodb";
import NoSqlPipeline from "../models/no-sql-pipeline.js";

export async function getCount(db: Db, pluralResourceName: string): Promise<number> {
    const collection = db.collection(pluralResourceName);
    
    const result = await collection.countDocuments();
    return result;
}

