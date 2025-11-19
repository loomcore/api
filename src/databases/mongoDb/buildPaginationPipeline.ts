import { IQueryOptions } from "@loomcore/common/models";
import { Document } from "mongodb";

export function buildPaginationPipeline(pipeline: Document[]): Document[] {
    return [
        { 
            $facet: { 
                results: pipeline, 
                total: [{ $count: 'total' }] 
            } 
        },
        { $project: { results: 1, total: { $arrayElemAt: ['$total.total', 0] } } }
    ];
}