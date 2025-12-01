import { Db } from "mongodb";
import { IModelSpec, IQueryOptions, IPagedResult } from "@loomcore/common/models";
import { Operation } from "../../operations/operation.js";
import NoSqlPipeline from "../models/no-sql-pipeline.js";
import { apiUtils } from "../../../utils/api.utils.js";


export async function get<T>(db: Db, operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec, pluralResourceName: string): Promise<IPagedResult<T>> {
    const collection = db.collection(pluralResourceName);
    const pipeline = new NoSqlPipeline()
        .addMatch(queryOptions, modelSpec)
        .addOperations(operations)
        .addQueryOptions(queryOptions, true)
        .build();
            
    const cursor = collection.aggregate(pipeline);
    const aggregateResult = await cursor.next();

    const pagedResult = apiUtils.getPagedResult<T>(
        aggregateResult?.data || [],
        aggregateResult?.total || 0,
        queryOptions
    );
    return pagedResult;
}

