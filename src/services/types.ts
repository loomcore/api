import { IEntity, IQueryOptions, IUserContext } from '@loomcore/common/models';
import { Operation } from '../databases/index.js';

export type PrepareQueryCustomFunction = (userContext: IUserContext | undefined, queryOptions: IQueryOptions, operations: Operation[]) => { queryOptions: IQueryOptions, operations: Operation[] };
export type PostProcessEntityCustomFunction<TIn extends IEntity, TOut extends IEntity> = (userContext: IUserContext, entity: TIn) => TOut;
