import { Db, Document, ObjectId } from "mongodb";
import { Operation } from "../../operations/operation.js";
import { BadRequestError } from "../../../errors/index.js";
import { convertOperationsToPipeline } from "../utils/index.js";
import { IQueryOptions } from "@loomcore/common/models";
import { buildNoSqlMatch } from "../utils/build-no-sql-match.util.js";
import NoSqlPipeline from "../models/no-sql-pipeline.js";


export async function batchUpdate<T>(db: Db, entities: Partial<T>[], operations: Operation[], queryObject: IQueryOptions, pluralResourceName: string): Promise<T[]> {
    const collection = db.collection(pluralResourceName);
    if (!entities || entities.length === 0) {
        return [];
    }

    const bulkOperations = [];
    const entityIds: ObjectId[] = [];

    // Build base filter from queryObject (includes tenant filters for multi-tenant services)
    const queryObjectMatch = buildNoSqlMatch(queryObject);
    const baseFilter = queryObjectMatch.$match || {};

    for (const entity of entities) {
        const { _id, ...updateData } = entity as any;

        if (!_id || !(_id instanceof ObjectId)) {
            throw new BadRequestError('Each entity in a batch update must have a valid _id that has been converted to an ObjectId.');
        }
        
        entityIds.push(_id);

        // Merge _id filter with base filter (includes tenant filters) for security
        const updateFilter = { ...baseFilter, _id };
        
        bulkOperations.push({
            updateOne: {
                filter: updateFilter,
                update: { $set: updateData },
            },
        });
    }

    if (bulkOperations.length > 0) {
        await collection.bulkWrite(bulkOperations);
    }

    // Build query to retrieve updated entities, merging _id filter with queryObject filters
    // Convert ObjectIds to strings for buildNoSqlMatch (it will convert them back to ObjectIds)
    const retrievalQueryObject: IQueryOptions = {
        ...queryObject,
        filters: {
            ...(queryObject.filters || {}),
            _id: { in: entityIds.map(id => id.toString()) }
        }
    };
    
    // Convert operations to pipeline stages
    const operationsDocuments = convertOperationsToPipeline(operations);
    
    let updatedEntities: Document[];
    
    if (operationsDocuments.length > 0) {
        // Use aggregation pipeline if there are operations
        const pipeline = new NoSqlPipeline()
            .addMatch(retrievalQueryObject)
            .addOperations(operations)
            .build();
        updatedEntities = await collection.aggregate(pipeline).toArray();
    } else {
        // Use simple find if no operations, but still apply queryObject filters
        const retrievalMatch = buildNoSqlMatch(retrievalQueryObject);
        const retrievalFilter = retrievalMatch.$match || {};
        updatedEntities = await collection.find(retrievalFilter).toArray();
    }

    return updatedEntities as T[];
}

