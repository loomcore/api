import { Collection, Document } from "mongodb";
import { Operation } from "../../operations/operation.js";
import NoSqlPipeline from "../utils/pipeline.interface.util.js";


export async function getAll<T>(collection: Collection, operations: Operation[]): Promise<T[]> {
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