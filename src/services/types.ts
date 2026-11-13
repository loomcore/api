import type { IEntity, IQueryOptions } from '@loomcore/common/models';
import type { Operation } from '../databases/index.js';
import type { IRequestContext } from './request-context.interface.js';

export type PrepareQueryCustomFunction<TContext extends IRequestContext = IRequestContext> = (
  context: TContext | undefined,
  queryOptions: IQueryOptions,
  operations: Operation[],
) => { queryOptions: IQueryOptions; operations: Operation[] };

export type PostProcessEntityCustomFunction<
  TIn extends IEntity,
  TOut extends IEntity,
  TContext extends IRequestContext = IRequestContext,
> = (context: TContext, entity: TIn) => TOut;
