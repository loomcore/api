import { IEntity, IQueryOptions, IUserContext } from "@loomcore/common/models";
import { Operation } from "../databases/index.js";

export type PrepareQueryCustomFunction = (userContext: IUserContext | undefined, queryObject: IQueryOptions, operations: Operation[]) => { queryObject: IQueryOptions, operations: Operation[] };
export type PostProcessEntityCustomFunction<TIn extends IEntity, TOut extends IEntity> = (userContext: IUserContext, entity: TIn) => TOut;
