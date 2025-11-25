import { Db, Document, ObjectId } from "mongodb";
import { Operation } from "../../operations/operation.js";
import { convertOperationsToPipeline } from "../utils/index.js";
import { entityUtils } from "@loomcore/common/utils";
import { BadRequestError } from "../../../errors/index.js";


export async function getById<T>(db: Db, operations: Operation[], id: string, pluralResourceName: string): Promise<T | null> {
    if (!entityUtils.isValidObjectId(id)) {
        throw new BadRequestError('id is not a valid ObjectId');
    }
    const collection = db.collection(pluralResourceName);
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

