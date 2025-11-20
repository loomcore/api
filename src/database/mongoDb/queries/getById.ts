import { Collection, Document, ObjectId } from "mongodb";
import { Operation } from "../../operations/operation.js";
import { convertOperationsToPipeline } from "../utils/index.js";


export async function getById<T>(collection: Collection, operations: Operation[], id: string): Promise<T | null> {
    const objectId = new ObjectId(id);
    const baseQuery = { _id: objectId };
    
    // Convert operations to pipeline stages
    const operationsDocuments = convertOperationsToPipeline(operations);
    
    let entity: Document | null = null;
    
    if (operationsDocuments.length > 0) {
        // Use aggregation pipeline if there are operations
        const pipeline = [
            { $match: baseQuery },
            ...operationsDocuments
        ];
        entity = await collection.aggregate(pipeline).next();
    } else {
        // Use simple findOne if no operations
        entity = await collection.findOne(baseQuery);
    }
    
    return entity as T | null;
}

