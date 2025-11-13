import { IModelSpec } from "@loomcore/common/models";
import { Operation } from "../operations/operations.js";

export interface IDatabase {
  getAll<T>(operations: Operation[]): Promise<T[]>;
  transformSingle<T>(single: any, modelSpec: IModelSpec): T;
}