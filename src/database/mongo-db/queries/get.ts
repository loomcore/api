import { Collection, Document } from "mongodb";
import { IModelSpec, IQueryOptions, IPagedResult } from "@loomcore/common/models";
import { Operation } from "../../operations/operation.js";
import NoSqlPipeline from "../utils/pipeline.interface.util.js";
import { apiUtils } from "../../../utils/api.utils.js";


export async function get<T>(collection: Collection, operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec): Promise<IPagedResult<T>> {
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

