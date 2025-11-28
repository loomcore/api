import { Db } from "mongodb";
import { Operation } from "../../operations/operation.js";
import { BadRequestError, IdNotFoundError } from "../../../errors/index.js";
import NoSqlPipeline from "../models/no-sql-pipeline.js";
import { buildNoSqlMatch } from "../utils/build-no-sql-match.util.js";
import { entityUtils } from "@loomcore/common/utils";


export async function partialUpdateById<T>(db: Db, operations: Operation[], id: string, entity: Partial<any>, pluralResourceName: string): Promise<T> {
    if (!entityUtils.isValidObjectId(id)) {
        throw new BadRequestError('id is not a valid ObjectId');
    }
    const collection = db.collection(pluralResourceName);
    // Build match document and extract the filter object
    const matchDocument = buildNoSqlMatch({ filters: { _id: { eq: id } } });
    const filter = matchDocument.$match;
    
    // For partial update, we use findOneAndUpdate with $set
    // The operations are used when retrieving the updated entity
    const updatedEntity = await collection.findOneAndUpdate(
        filter,
        { $set: entity },
        { returnDocument: 'after' }
    );
    
    if (!updatedEntity) {
        throw new IdNotFoundError();
    }
    
    const pipeline = new NoSqlPipeline()
        .addMatch({ filters: { _id: { eq: id } } })
        .addOperations(operations)
        .build();
    
    const updatedEntityWithOperations = await collection.aggregate(pipeline).next();
    if (!updatedEntityWithOperations) {
        throw new IdNotFoundError();
    }
    return updatedEntityWithOperations as T;
}

