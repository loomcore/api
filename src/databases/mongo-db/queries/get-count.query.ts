import { Collection, Db } from "mongodb";
import { Operation } from "../../operations/operation.js";
import NoSqlPipeline from "../models/no-sql-pipeline.js";


export async function getCount(db: Db, operations: Operation[], pluralResourceName: string): Promise<number> {
    const collection = db.collection(pluralResourceName);
    const pipeline = new NoSqlPipeline()
        .addOperations(operations)
        .build();
    
    const result = await collection.aggregate(pipeline).toArray();
    return result.length;
}

