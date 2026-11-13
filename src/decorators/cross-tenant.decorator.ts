import 'reflect-metadata';
import { ServerError } from '../errors/index.js';

const CROSS_TENANT_METADATA_KEY = Symbol('tenancy-decorator:cross-tenant');

export function getCrossTenantReason(entity: any): string | undefined {
  return Reflect.getMetadata(CROSS_TENANT_METADATA_KEY, entity);
}

export function hasCrossTenant(entity: any): boolean {
  return Reflect.hasOwnMetadata(CROSS_TENANT_METADATA_KEY, entity);
}

type CrossTenantDecorator = (
  target: Function,
  _context: ClassDecoratorContext,
) => void;

/**
 * Marks a service as cross-tenant. Required reason is stored as metadata and read by GenericQueryService.
 * An empty reason throws ServerError at decoration time.
 */
export function CrossTenant(reason: string): CrossTenantDecorator {
  if (!reason || !reason.trim()) {
    throw new ServerError('@CrossTenant requires a non-empty reason');
  }

  return function (
    target: Function,
    _context: ClassDecoratorContext,
  ) {
    Reflect.defineMetadata(CROSS_TENANT_METADATA_KEY, reason.trim(), target);
  };
}
