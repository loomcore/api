import { Collection, Db, Document, ObjectId } from "mongodb";
import { Operation } from "../../operations/operation.js";
import { BadRequestError } from "../../../errors/index.js";
import { convertOperationsToPipeline } from "../utils/index.js";
import { IQueryOptions } from "@loomcore/common/models";


export async function batchUpdate<T>(db: Db, entities: Partial<T>[], operations: Operation[], queryObject: IQueryOptions, pluralResourceName: string): Promise<T[]> {
    const collection = db.collection(pluralResourceName);
    if (!entities || entities.length === 0) {
        return [];
    }

    const bulkOperations = [];
    const entityIds: ObjectId[] = [];

    for (const entity of entities) {
        const { _id, ...updateData } = entity as any;

        if (!_id || !(_id instanceof ObjectId)) {
            throw new BadRequestError('Each entity in a batch update must have a valid _id that has been converted to an ObjectId.');
        }
        
        entityIds.push(_id);

        bulkOperations.push({
            updateOne: {
                filter: { _id },
                update: { $set: updateData },
            },
        });
    }

    if (bulkOperations.length > 0) {
        await collection.bulkWrite(bulkOperations);
    }

    // Build query to retrieve updated entities
    const baseQuery = { _id: { $in: entityIds } };
    
    // Convert operations to pipeline stages
    const operationsDocuments = convertOperationsToPipeline(operations);
    
    let updatedEntities: Document[];
    
    if (operationsDocuments.length > 0) {
        // Use aggregation pipeline if there are operations
        const pipeline = [
            { $match: baseQuery },
            ...operationsDocuments
        ];
        updatedEntities = await collection.aggregate(pipeline).toArray();
    } else {
        // Use simple find if no operations
        updatedEntities = await collection.find(baseQuery).toArray();
    }

    return updatedEntities as T[];
}

