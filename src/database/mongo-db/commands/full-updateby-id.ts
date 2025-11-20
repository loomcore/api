import { Collection } from "mongodb";
import { Operation } from "../../operations/operation.js";
import { IdNotFoundError } from "../../../errors/index.js";
import NoSqlPipeline from "../utils/pipeline.interface.util.js";
import { buildNoSqlMatch } from "../utils/build-no-sql-match.util.js";


export async function fullUpdateById<T>(collection: Collection, operations: Operation[], id: string, entity: any): Promise<T> {
    // Build match document and extract the filter object
    const matchDocument = buildNoSqlMatch({ filters: { _id: { eq: id } } });
    const filter = matchDocument.$match;
    
    const replaceResult = await collection.replaceOne(filter, entity);
    if (replaceResult.matchedCount <= 0) {
        throw new IdNotFoundError();
    }
    
    const pipeline = new NoSqlPipeline()
        .addMatch({ filters: { _id: { eq: id } } })
        .addOperations(operations)
        .build();
        
    const updatedEntity = await collection.aggregate(pipeline).next();
    if (!updatedEntity) {
        throw new IdNotFoundError();
    }
    
    return updatedEntity as T;
}

