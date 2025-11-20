import { Collection } from "mongodb";
import { Operation } from "../../operations/operation.js";
import NoSqlPipeline from "../utils/pipeline.interface.util.js";


export async function getCount(collection: Collection, operations: Operation[]): Promise<number> {
    const pipeline = new NoSqlPipeline()
        .addOperations(operations)
        .build();
    
    const result = await collection.aggregate(pipeline).toArray();
    return result.length;
}

