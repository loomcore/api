import { Document } from "mongodb";

export function buildNoSqlPaginationPipeline(pipeline: Document[]): Document[] {
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