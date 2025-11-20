import { Document } from "mongodb";
import { IQueryOptions, IModelSpec } from "@loomcore/common/models";
import { Operation } from "../../operations/operation.js";

export interface INoSqlPipeline {
    addStage(stage: Document): INoSqlPipeline;
    addStages(stages: Document[]): INoSqlPipeline;
    addMatch(queryOptions: IQueryOptions, modelSpec?: IModelSpec): INoSqlPipeline;
    addOperations(operations: Operation[]): INoSqlPipeline;
    addQueryOptions(queryOptions: IQueryOptions, pagination: boolean): INoSqlPipeline;
    build(): Document[];
}
