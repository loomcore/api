import type { IModelSpec } from '@loomcore/common/models';
import type { IRequestContext } from './request-context.interface.js';

/**
 * Chooses the model spec for a request. Default is StaticModelSpecResolver(this.modelSpec).
 */
export interface IModelSpecResolver<TContext extends IRequestContext = IRequestContext> {
  resolve(context: TContext): Promise<IModelSpec>;
}

export class StaticModelSpecResolver implements IModelSpecResolver {
  constructor(private readonly modelSpec: IModelSpec) {}

  async resolve(_context?: IRequestContext): Promise<IModelSpec> {
    return this.modelSpec;
  }
}
