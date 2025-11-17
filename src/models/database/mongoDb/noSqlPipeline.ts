import { Document } from "mongodb";
import { IQueryOptions, IModelSpec } from "@loomcore/common/models";
import { Operation } from "../../operations/operations.js";
import { buildMongoMatchFromQueryOptions } from "../../../utils/mongo/buildMongoMatchFromQueryOptions.js";
import { convertOperationsToPipeline } from "../../../utils/mongo/convertOperationsToPipeline.js";
import { buildPaginationPipeline } from "./buildPaginationPipeline.js";

export interface IPipeline {
    addStage(stage: Document): IPipeline;
    addStages(stages: Document[]): IPipeline;
    addMatch(queryOptions: IQueryOptions, modelSpec?: IModelSpec): IPipeline;
    addOperations(operations: Operation[]): IPipeline;
    addPagination(queryOptions: IQueryOptions): IPipeline;
    build(): Document[];
}

class NoSqlPipeline implements IPipeline {
    private pipeline: Document[];

    constructor(pipeline: Document[] | null = null) {
        if (pipeline) {
            this.pipeline = [...pipeline];
        } else {
            this.pipeline = [];
        }
    }

    addStage(stage: Document): NoSqlPipeline {
        this.pipeline.push(stage);
        return this;
    }

    addStages(stages: Document[]): NoSqlPipeline {
        this.pipeline = this.pipeline.concat(stages);
        return this;
    }

    addMatch(queryOptions: IQueryOptions, modelSpec?: IModelSpec): NoSqlPipeline {
        const matchDocument = buildMongoMatchFromQueryOptions(queryOptions, modelSpec);
        if (matchDocument) {
            this.pipeline.push(matchDocument);
        }
        return this;
    }

    addOperations(operations: Operation[]): NoSqlPipeline {
        const operationsDocuments = convertOperationsToPipeline(operations);
        if (operationsDocuments.length > 0) {
            this.pipeline = this.pipeline.concat(operationsDocuments);
        }
        return this;
    }

    addPagination(queryOptions: IQueryOptions): NoSqlPipeline {
        const paginationDocuments = buildPaginationPipeline(queryOptions);
        this.pipeline = this.pipeline.concat(paginationDocuments);
        return this;
    }

    build(): Document[] {
        return this.pipeline;
    }
}

export default NoSqlPipeline;