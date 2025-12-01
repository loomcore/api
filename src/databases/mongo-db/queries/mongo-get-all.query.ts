import { Db, Document } from "mongodb";
import { Operation } from "../../operations/operation.js";
import NoSqlPipeline from "../models/no-sql-pipeline.js";


export async function getAll<T>(db: Db, operations: Operation[], pluralResourceName: string): Promise<T[]> {
    const collection = db.collection(pluralResourceName);
    const pipeline = new NoSqlPipeline()
        .addOperations(operations)
        .build();

    let aggregateResult: Document[];

    if (pipeline.length === 0) {
        // Use existing simple find approach if no additional stages
        // This is more efficient than using aggregate for simple queries
        const cursor = collection.find();
        aggregateResult = await cursor.toArray();
    } else {
        const cursor = collection.aggregate(pipeline);
        aggregateResult = await cursor.toArray();
    }
    return aggregateResult as T[];
}