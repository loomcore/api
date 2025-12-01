import { Db } from "mongodb";
import { IQueryOptions } from "@loomcore/common/models";
import { Operation } from "../../operations/operation.js";
import { NotFoundError } from "../../../errors/index.js";
import NoSqlPipeline from "../models/no-sql-pipeline.js";
import { buildNoSqlMatch } from "../utils/build-no-sql-match.util.js";

export async function update<T>(db: Db, queryObject: IQueryOptions, entity: Partial<any>, operations: Operation[], pluralResourceName: string): Promise<T[]> {
    const collection = db.collection(pluralResourceName);
    const matchDocument = buildNoSqlMatch(queryObject);
    const filter = matchDocument.$match;
    const updateResult = await collection.updateMany(filter, { $set: entity });
    
    if (updateResult.matchedCount <= 0) {
        throw new NotFoundError('No records found matching update query');
    }
    
    // Build pipeline for retrieving updated entities (with operations)
    const pipeline = new NoSqlPipeline()
        .addMatch(queryObject)
        .addOperations(operations)
        .addQueryOptions(queryObject, false)
        .build();
    
    const updatedEntities = await collection.aggregate(pipeline).toArray();
    
    return updatedEntities as T[];
}
