import { Db } from "mongodb";
import { Operation } from "../../operations/operation.js";
import { BadRequestError, IdNotFoundError } from "../../../errors/index.js";
import NoSqlPipeline from "../models/no-sql-pipeline.js";
import { buildNoSqlMatch } from "../utils/build-no-sql-match.util.js";
import { entityUtils } from "@loomcore/common/utils";
import type { AppIdType } from "@loomcore/common/types";

export async function fullUpdateById<T>(db: Db, operations: Operation[], id: AppIdType, entity: any, pluralResourceName: string): Promise<T> {
    if (!entityUtils.isValidObjectId(id)) {
        throw new BadRequestError('id is not a valid ObjectId');
    }

    const collection = db.collection(pluralResourceName);
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
