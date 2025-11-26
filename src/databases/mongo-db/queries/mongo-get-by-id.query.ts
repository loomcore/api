import { Db } from "mongodb";
import { Operation } from "../../operations/operation.js";
import { entityUtils } from "@loomcore/common/utils";
import { BadRequestError } from "../../../errors/index.js";
import { IQueryOptions } from "@loomcore/common/models";
import NoSqlPipeline from "../models/no-sql-pipeline.js";

export async function getById<T>(db: Db, operations: Operation[], queryObject: IQueryOptions, id: string, pluralResourceName: string): Promise<T | null> {
    if (!entityUtils.isValidObjectId(id)) {
        throw new BadRequestError('id is not a valid ObjectId');
    }
    const collection = db.collection(pluralResourceName);

    queryObject.filters || (queryObject.filters = {});
    queryObject.filters._id = { eq: id };

    const pipeline = new NoSqlPipeline()
        .addMatch(queryObject)
        .addOperations(operations)
        .build();

    const entity =await collection.aggregate(pipeline).next();

    return entity as T | null;
}

