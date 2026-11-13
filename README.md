# @loomcore/api

An opinionated Node.js API toolkit using TypeScript, Express, and MongoDB or PostgreSQL.

This library provides a foundational structure for creating robust APIs, with a strong emphasis on multi-tenancy, user management, and OAuth 2.0 Code Flow authentication out of the box.

## Features

- **Generic API Controller**: A base `ApiController` that automatically scaffolds a full suite of RESTful endpoints for any data model. This includes support for CRUD operations, batch updates, pagination, and counting.
- **Built-in Multi-tenancy**: When `config.app.isMultiTenant` is true, `TenantScope` is applied automatically to every service unless it is decorated with `@CrossTenant`. Reads and writes are scoped to the current user's organization.
- **Request context**: `ApiController.createContext(req)` turns an HTTP request into a typed `IRequestContext` (`{ userContext }`). Service methods take that context first, then only their real domain inputs.
- **Query scopes**: Pluggable `IQueryScope` objects restrict which documents an operation can see and stamp scoped fields on every write. Feature scopes are declared as `protected scopes` on a service.
- **Model spec resolvers**: `IModelSpecResolver` chooses the model spec for a request (default `StaticModelSpecResolver`). The service resolves once per request and uses that spec for validate, decode, and encode.
- **Authentication & Authorization**: Integrated JWT-based authentication with `@Authorize` / `@AllowAnonymous` decorators to secure endpoints, plus support for OAuth 2.0 Code Flow including refresh tokens.
- **User & Organization Management**: Pre-built services and controllers for common user and organization management tasks.
- **Password Management**: Includes services for handling password reset requests and workflows.
- **Email Service Integration**: A ready-to-use service for sending transactional emails (e.g., for password resets or welcome messages).
- **Configuration-Driven**: Easily enable or disable features like multi-tenancy through a single configuration file.
- **TypeScript & ES Modules**: A modern codebase written entirely in TypeScript, using ES Modules.
- **Extensible Services**: A generic service layer that can be extended to add custom business logic while leveraging common data access patterns.
- **Custom Error Handling**: A set of predefined error classes for consistent and meaningful API error responses.
- **Schema Validation with TypeBox**: Leverages TypeBox for efficient, type-safe runtime data validation that integrates seamlessly with TypeScript.
- **JSON Translations with TypeBox**: All data translations, from json input, to object persistence in a database, back to json output, flow through and are completely handled by json-schema-based Typebox schemas.

## Core Concepts

### Schema Validation with TypeBox
This library uses `@sinclair/typebox` to define data models and validate incoming request bodies. This approach offers several key advantages:

- **Type Safety**: TypeBox schemas are standard TypeScript, which means your data models and validation logic are fully type-checked at compile time.
- **Performance**: It is a highly-performant validation library.
- **Single Source of Truth**: Define your data structure once as a TypeBox schema and reuse it to automatically infer TypeScript types. This eliminates the need to maintain separate validation schemas and type definitions.
- **Automatic Filtering**: By defining a `publicSchema` for your controllers, the API will automatically filter out sensitive fields (like passwords) before sending data back to the client.

The framework is built around a few core components:

1. **`ApiController`**: You extend this class to create a new controller for a specific data model (e.g., `UsersController`). It automatically maps all the standard REST routes. Controllers build context via `createContext` and do not validate — validation lives in the service write pipeline.
2. **`GenericApiService` / `GenericQueryService`**: Base services for CRUD and complex reads. Constructor order is always `(database, singularResourceName, pluralResourceName, modelSpec, ...)`.
3. **`TenantScope` + `@CrossTenant`**: Tenancy is foundational in multi-tenant apps. Opt out only with `@CrossTenant('reason')` (e.g. `OrganizationService`).

By extending these base classes, you can quickly stand up a new, fully-featured API endpoint with minimal boilerplate code.

### Multi-tenant organization provisioning

When multi-tenancy is enabled, **`POST /api/organizations`** is the only HTTP way to create a tenant organization. The request body provisions the org, its login domain, and an initial admin user (who receives a welcome/set-password email). Meta-org admins with the `admin` feature call this route; the work is implemented in `OrganizationService.createOrganizationWithAdmin` so self-service signup can reuse the same service logic later.

Request shape:

```json
{
  "name": "Acme Tenant",
  "code": "acme",
  "adminEmail": "acme-admin@example.com",
  "adminDisplayName": "Acme Admin"
}
```

Response (`201`): `{ organization, adminUser }` (password omitted). Org-only creates without an admin are not supported over HTTP.

### Lists

- `GET /` (`get`) returns a paged `IPagedResult`.
- `GET /all` (`getAll`) is the only unpaged list.

## Migrating from 0.2.x to 0.3.0

This is a clean breaking release. There are no compatibility shims.

### Request context

- Every service method takes `context: IRequestContext` first (`{ userContext: IUserContext }`), not bare `IUserContext`.
- Controllers call `this.createContext(req)` and pass that context to the service.
- Internal/system callers use `createSystemContext()`.

### Tenancy

- Delete subclasses of `MultiTenantApiService` / `MultiTenantQueryService` and extend `GenericApiService` / `GenericQueryService` instead.
- Remove `TenantQueryDecorator` and `getTenantOrgId` usage.
- In a multi-tenant app, isolation is automatic. Mark cross-tenant services with `@CrossTenant('reason')` (empty reason throws at startup).
- Tenant users can no longer change `_orgId` on update (`TenantScope.applyToEntity` stamps it on every write).

### Service constructors and hooks

- Constructor order is `(database, singularResourceName, pluralResourceName, modelSpec, ...)`. `MultiTenantApiService` previously used plural-then-singular — reverse those arguments.
- `prepareQuery(context, queryOptions, operations)` — query shaping only; scope filters are merged after it.
- `preProcessEntity(context, spec, entity, isCreate)` — receives the resolved spec; no `allowId` parameter; do not stamp `_orgId` here.
- `postProcessEntity(context, spec, entity)` — uses the resolved spec.
- `getModelSpecForPreProcessing` is removed; override `modelSpecResolver` / use `resolveModelSpec(context)`.
- `partialUpdateByIdWithoutPreAndPostProcessing` is removed.

### Validation

- Controllers no longer call `validate` / `validateMany` (removed from `ApiController` and from the public service interface).
- The service write pipeline validates with `validate(spec, entity, { partial })` after resolving the model spec.
- Dates at the service boundary must be ISO strings when validation runs before decode.

### IDatabase

- Trailing `orgId` parameters are removed. Callers supply scope via `Filters`.
- Renames: `fullUpdateById` → `replaceOne`, `partialUpdateById` → `updateOne`, `update` → `updateMany`, `deleteById` → `deleteOne`.
- `getAll` and `getCount` take filters. Collection name is first on the public `IDatabase` methods.

### Feature scopes and resolvers

- Declare feature scopes as `protected scopes: IQueryScope[] = [...]` (never list `TenantScope`).
- Override `protected modelSpecResolver` when the model spec depends on the request.

## Testing

### PostgreSQL Testing

The test suite supports two modes for PostgreSQL testing:

1. **pg-mem (default)**: Fast, in-memory PostgreSQL simulation. Use for most tests.
   ```bash
   npm run test:postgres
   ```

2. **Real PostgreSQL Container**: Full PostgreSQL compatibility for tests that require advanced features (e.g., LATERAL joins). Requires Docker.
   ```bash
   # Start the test database container
   npm run test:db:start

   # Wait for it to be ready (optional, tests will retry)
   ./scripts/wait-for-postgres.sh

   # Run tests with real PostgreSQL
   npm run test:postgres:real

   # Stop the container when done
   npm run test:db:stop
   ```

The container uses port `5444` to avoid conflicts with local PostgreSQL instances. Set `USE_REAL_POSTGRES=true` to use the container instead of pg-mem.

## Example Usage

### Host Application
A simple example usage of this library can be found in this [sample host application](https://github.com/thardy/monorepo-starter/tree/main/apps/api).

The following five files will give you a good overview of the functionality bundled into this library:
1. [Main app file](https://github.com/thardy/monorepo-starter/blob/main/apps/api/src/index.ts) - Contains robust graceful shutdown, bundled in `expressUtils.performGracefulShutdown()`. Current example hardwired to MongoDb, but database abstraction and PostgreSQL support is currently in progress.
2. [Sample model](https://github.com/thardy/monorepo-starter/blob/main/apps/api/src/features/products/product.model.ts) - uses Typebox for validation and all json transforms.
3. [Sample controller](https://github.com/thardy/monorepo-starter/blob/main/apps/api/src/features/products/products.controller.ts) - Simply override ApiController to get full CRUD endpoints - getAll, get (with typed Filter object from querystring), getById, getCount, create, batchUpdate, fullUpdateById, partialUpdateById, and deleteById.
4. [Sample service](https://github.com/thardy/monorepo-starter/blob/main/apps/api/src/features/products/product.service.ts) - All CRUD handled by simply overriding GenericApiService. In a multi-tenant app, TenantScope applies automatically; use `@CrossTenant` only when a service must see across tenants. There are a ton of hooks available for overrides, including the ability to add joins on every get.
5. [Routes](https://github.com/thardy/monorepo-starter/blob/main/apps/api/src/server/routes/routes.ts) - full auth, organizations, and users endpoints/services are all bundled into the library
