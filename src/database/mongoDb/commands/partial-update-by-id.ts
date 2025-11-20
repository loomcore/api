import { Collection } from "mongodb";
import { Operation } from "../../operations/operation.js";
import { IdNotFoundError } from "../../../errors/index.js";
import NoSqlPipeline from "../utils/pipeline.interface.js";
import { buildNoSqlMatch } from "../utils/buildNoSqlMatch.js";


export async function partialUpdateById<T>(collection: Collection, operations: Operation[], id: string, entity: Partial<any>): Promise<T> {
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

