import { IQueryOptions } from "@loomcore/common/models";
import { Document } from "mongodb";

export function buildPaginationPipeline(queryOptions: IQueryOptions): Document[] {
    let pipeline: Document[] = [];
    let resultStages: Document[] = [];
    if (queryOptions.orderBy) {
        resultStages.push({ $sort: { [queryOptions.orderBy]: queryOptions.sortDirection === 'asc' ? 1 : -1 } });
    }
    if (queryOptions.page && queryOptions.pageSize) {
        resultStages.push({ $skip: (queryOptions.page - 1) * queryOptions.pageSize });
        resultStages.push({ $limit: queryOptions.pageSize });
    }

    pipeline.push({ 
        $facet: { 
            results: resultStages, 
            total: [{ $count: 'total' }] 
        } 
    });
    return pipeline;
}