# @loomcore/api

An opinionated Node.js API toolkit using TypeScript, Express, and MongoDB (PostgreSQL support coming soon).

This library provides a foundational structure for creating robust APIs, with a strong emphasis on multi-tenancy, user management, and OAuth 2.0 Code Flow authentication out of the box.

## Features

- **Generic API Controller**: A base `ApiController` that automatically scaffolds a full suite of RESTful endpoints for any data model. This includes support for CRUD operations, batch updates, pagination, and counting.
- **Built-in Multi-tenancy**: Optional, configuration-driven multi-tenancy. When enabled, all database operations are automatically scoped to the current user's organization, ensuring strict data isolation.
- **Authentication & Authorization**: Integrated JWT-based authentication middleware (`isAuthenticated`) to easily secure endpoints and support for OAuth 2.0 Code Flow, including the use of refresh tokens.
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

1.  **`ApiController`**: You extend this class to create a new controller for a specific data model (e.g., `UsersController`). It automatically maps all the standard REST routes.
2.  **`GenericApiService`**: A base service that provides the business logic for data operations (get, create, update, delete).
3.  **`MultiTenantApiService`**: An extension of `GenericApiService` that adds the multi-tenancy layer, automatically filtering and tagging data with an organization ID.

By extending these base classes, you can quickly stand up a new, fully-featured API endpoint with minimal boilerplate code.

## Example Usage

### Host Application
A simple example usage of this library can be found in this [sample host application](https://github.com/thardy/monorepo-starter/tree/main/apps/api).

The following five files will give you a good overview of the functionality bundled into this library:
1. [Main app file](https://github.com/thardy/monorepo-starter/blob/main/apps/api/src/index.ts) - Contains robust graceful shutdown, bundled in `expressUtils.performGracefulShutdown()`. Current example hardwired to MongoDb, but database abstraction and PostgreSQL support is currently in progress.
2. [Sample model](https://github.com/thardy/monorepo-starter/blob/main/apps/api/src/features/products/product.model.ts) - uses Typebox for validation and all json transforms.
3. [Sample controller](https://github.com/thardy/monorepo-starter/blob/main/apps/api/src/features/products/products.controller.ts) - Simply override ApiController to get full CRUD endpoints - getAll, get (with typed Filter object from querystring), getById, getCount, create, batchUpdate, fullUpdateById, partialUpdateById, and deleteById. 
4. [Sample service](https://github.com/thardy/monorepo-starter/blob/main/apps/api/src/features/products/product.service.ts) - All CRUD handled by simply overriding GenericApiService. Override MultiTenantApiService instead to get full multi-tenant enforcement on all writes and queries. There are a ton of hooks available for overrides, including the ability to add joins on every get.
5. [Routes](https://github.com/thardy/monorepo-starter/blob/main/apps/api/src/server/routes/routes.ts) - full auth, organizations, and users endpoints/services are all bundled into the library