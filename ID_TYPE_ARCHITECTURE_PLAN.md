# ID Type Architecture Plan: Compile-Time Type Safety with Module Augmentation

## Problem Statement
- MongoDB uses string IDs (ObjectIds as strings) - **NO CHANGES NEEDED**
- PostgreSQL uses integer IDs (auto-generated) - **NEEDS TYPE ENFORCEMENT**
- Current codebase has `id: string` hardcoded in many places
- HTTP requests always provide IDs as strings (from URL params)
- **This is a compile-time decision, not runtime** - we should use TypeScript's type system to enforce correctness
- **Note:** `IEntity` and related types are in `@loomcore/common/models` - we will update that library to use `AppId` type

## Core Principle
**Use TypeScript module augmentation to configure ID types at the host application level.**
- `@loomcore/common` defines `AppIdType` interface with `id: string | number` (flexible default)
- Host application augments `AppIdType` to specify concrete type (`string` for MongoDB, `number` for PostgreSQL)
- `IEntity._id` uses `AppId` type which resolves to the augmented type automatically
- **Zero boilerplate** - types flow through automatically without generics everywhere
- Type system enforces correct ID types at compile time based on host app configuration

---

## How It Works: End-to-End Example

### In `@loomcore/common` Library:
```typescript
// types/app.types.ts
export interface AppIdType {
  id: string | number; // Default flexible type
}
export type AppId = AppIdType['id'];

// models/entity.interface.ts
import { AppId } from '../types/app.types.js';

export interface IEntity {
  _id: AppId;  // Uses AppId type
  _orgId?: AppId;
}
```

### In PostgreSQL Host Application:
```typescript
// loomcore.d.ts - Module Augmentation
import '@loomcore/common';

declare module '@loomcore/common' {
  export interface AppIdType {
    id: number;  // Override: PostgreSQL uses numbers
  }
}

// app-setup.ts - Initialize IdSchema (runs at app startup)
import { setIdSchema } from '@loomcore/common/validation';
import { Type } from '@sinclair/typebox';

setIdSchema(Type.Number({ integer: true, minimum: 1 }));
```

### The Final Result:
Once the module augmentation file is in place:
1. **Direct imports work automatically:**
   ```typescript
   import { IUser, IEntity } from '@loomcore/common';
   
   // TypeScript knows IUser._id is number (not string | number)
   const userId: number = user._id;  // ✅ Type-safe!
   const wrong: string = user._id;    // ❌ TypeScript error!
   ```

2. **API library code uses AppId:**
   ```typescript
   // In API library - no generics needed!
   async getById(id: AppId): Promise<IEntity> {
     // AppId resolves to number in PostgreSQL host app
     // TypeScript enforces correct type automatically
   }
   ```

3. **Full type safety throughout:**
   - `IEntity._id` is `number` in PostgreSQL host app
   - `IEntity._id` is `string` in MongoDB host app
   - No need to specify types at call sites
   - TypeScript catches type errors at compile time

**The above is is a very powerful and clean way to design a TypeScript library that needs to be configurable by its consumers.**

---

## Architecture Layers & Changes Required

### 0. **Common Library Updates** (Foundation)
**Library:** `@loomcore/common/models`

**Changes Required:**
1. **Define `AppIdType` interface** with flexible default:
   ```typescript
   export interface AppIdType {
     id: string | number; // The default, flexible type that the host application will override
   }
   export type AppId = AppIdType['id'];
   ```

2. **Update `IEntity` interface** to use `AppId`:
   ```typescript
   import { AppId } from '../types/app.types.js';
   
   export interface IEntity {
     _id: AppId;
     _orgId?: AppId;
   }
   ```

3. **Export `IdSchema` from common library** with flexible default:
   ```typescript
   // validation/id-schema.provider.ts in @loomcore/common
   import { Type, TSchema } from '@sinclair/typebox';
   
   // Default flexible schema - host app will override via module augmentation
   export let IdSchema: TSchema = Type.Union([
     Type.String(),
     Type.Number({ integer: true, minimum: 1 })
   ]);
   ```

4. **Update TypeBox schema** to use `IdSchema`:
   ```typescript
   import { Type } from '@sinclair/typebox';
   import { IdSchema } from '../validation/id-schema.provider.js';
   
   export const EntitySchema = Type.Object({
     _id: IdSchema,
     _orgId: Type.Optional(Type.Unsafe({ ...IdSchema, title: 'Organization ID' }))
   });
   ```

5. **Update any other types** that reference `_id` or ID types to use `AppId`

**Rationale:** The common library provides a flexible foundation that host applications configure via module augmentation. This keeps the library generic while allowing type safety at the host app level.

---

### 1. **Host Application Configuration** (Module Augmentation)

#### 1a. **Type Augmentation File**
**File:** `loomcore.d.ts` (or similar) in the host application

**For PostgreSQL (numeric IDs):**
```typescript
// This file tells TypeScript to augment the @loomcore/common library.
import '@loomcore/common'; // It's important to import the library to augment it.

declare module '@loomcore/common' {
  // We are re-declaring the AppIdType interface here.
  // TypeScript will merge this declaration with the original.
  export interface AppIdType {
    // This overrides the original `string | number` with just `number`.
    id: number;
  }
}
```

**For MongoDB (string IDs):**
```typescript
// This file tells TypeScript to augment the @loomcore/common library.
import '@loomcore/common'; // It's important to import the library to augment it.

declare module '@loomcore/common' {
  // We are re-declaring the AppIdType interface here.
  // TypeScript will merge this declaration with the original.
  export interface AppIdType {
    // This overrides the original `string | number` with just `string`.
    id: string;
  }
}
```

**Key Points:**
- Module augmentation happens at the host application level
- TypeScript merges the augmentation with the original declaration
- `AppId` type automatically resolves to the augmented type (`string` or `number`)
- `IEntity._id` automatically becomes the correct type throughout the codebase
- **Zero boilerplate** - no need to specify types at every call site

#### 1b. **TypeBox Schema Configuration**
**File:** App initialization file (e.g., `app.ts` or `main.ts`) in the host application

**For PostgreSQL (numeric IDs):**
```typescript
// In host app initialization (runs at app startup, before controllers are used)
import { setIdSchema } from '@loomcore/common/validation';
import { Type } from '@sinclair/typebox';

// Configure IdSchema for PostgreSQL
setIdSchema(Type.Number({ title: 'ID', integer: true, minimum: 1 }));
```

**For MongoDB (string IDs):**
```typescript
// In host app initialization
import { setIdSchema } from '@loomcore/common/validation';
import { Type } from '@sinclair/typebox';

// Configure IdSchema for MongoDB
setIdSchema(Type.String({ title: 'ID', pattern: '^[0-9a-fA-F]{24}$' })); // ObjectId pattern
```

**Key Points:**
- Common library exports `IdSchema` with a flexible default (`Type.Union([Type.String(), Type.Number()])`)
- Common library exports `setIdSchema()` function for configuration
- Host application calls `setIdSchema()` during app initialization (before controllers are used)
- Schema validation matches the ID type configuration
- Runtime validation enforces the correct ID format
- **No file path dependencies** - everything goes through `@loomcore/common`
- Controllers import `IdSchema` from `@loomcore/common/validation` (not from host app)

---

### 2. **API Library Updates** (Use AppId Type)

#### 2a. **IDatabase Interface** - Use AppId
**File:** `src/databases/models/database.interface.ts`

**Changes:**
```typescript
import { AppId } from '@loomcore/common/models';

export interface IDatabase {
  preprocessEntity<T extends IEntity>(entity: Partial<T>, modelSpec: TSchema): Partial<T>;
  postprocessEntity<T extends IEntity>(entity: T, modelSpec: TSchema): T;
  getAll<T extends IEntity>(operations: Operation[], pluralResourceName: string): Promise<T[]>;
  get<T extends IEntity>(operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec, pluralResourceName: string): Promise<IPagedResult<T>>;
  getById<T extends IEntity>(operations: Operation[], queryObject: IQueryOptions, id: AppId, pluralResourceName: string): Promise<T | null>;
  getCount(pluralResourceName: string): Promise<number>;
  create<T extends IEntity>(entity: Partial<T>, pluralResourceName: string): Promise<{ insertedId: AppId; entity: T }>;
  createMany<T extends IEntity>(entities: Partial<T>[], pluralResourceName: string): Promise<{ insertedIds: AppId[]; entities: T[] }>;
  batchUpdate<T extends IEntity>(entities: Partial<T>[], operations: Operation[], queryObject: IQueryOptions, pluralResourceName: string): Promise<T[]>;
  fullUpdateById<T extends IEntity>(operations: Operation[], id: AppId, entity: Partial<T>, pluralResourceName: string): Promise<T>;
  partialUpdateById<T extends IEntity>(operations: Operation[], id: AppId, entity: Partial<T>, pluralResourceName: string): Promise<T>;
  update<T extends IEntity>(queryObject: IQueryOptions, entity: Partial<T>, operations: Operation[], pluralResourceName: string): Promise<T[]>;
  deleteById(id: AppId, pluralResourceName: string): Promise<DeleteResult>;
  deleteMany(queryObject: IQueryOptions, pluralResourceName: string): Promise<DeleteResult>;
  find<T extends IEntity>(queryObject: IQueryOptions, pluralResourceName: string): Promise<T[]>;
  findOne<T extends IEntity>(queryObject: IQueryOptions, pluralResourceName: string): Promise<T | null>;
}
```

**Key Points:**
- **No generics needed** - `AppId` resolves to the correct type based on module augmentation
- All ID parameters use `AppId` - TypeScript enforces the correct type at compile time
- In PostgreSQL host app: `AppId` = `number`
- In MongoDB host app: `AppId` = `string`
- Output types (`insertedId`, `insertedIds`) return `AppId` (automatically correct type)

#### 2b. **IGenericApiService Interface** - Use AppId
**File:** `src/services/generic-api-service/generic-api-service.interface.ts`

**Changes:**
```typescript
import { AppId } from '@loomcore/common/models';

export interface IGenericApiService<T extends IEntity> {
  // ... other methods ...
  getById(userContext: IUserContext, id: AppId): Promise<T>;
  fullUpdateById(userContext: IUserContext, id: AppId, entity: T): Promise<T>;
  partialUpdateById(userContext: IUserContext, id: AppId, entity: Partial<T>): Promise<T>;
  partialUpdateByIdWithoutPreAndPostProcessing(userContext: IUserContext, id: AppId, entity: T): Promise<T>;
  deleteById(userContext: IUserContext, id: AppId): Promise<DeleteResult>;
  // ... other methods ...
}
```

**Key Points:**
- **No generics needed** - `AppId` is resolved from module augmentation
- **Service methods accept `AppId` directly** - exact types, no conversion needed
- Controllers handle conversion from HTTP strings to `AppId` using TypeBox
- Database interface uses `AppId` directly - TypeScript enforces correct type

---

### 3. **Database Implementation Layer** (Use AppId)

#### 3a. **PostgresDatabase** - Use AppId
**File:** `src/databases/postgres/postgres.database.ts`

**Current State:** PostgreSQL code currently has `id: string` in many places, but PostgreSQL uses integer IDs.

**Changes Required:**
1. **All method signatures use `id: AppId`** - TypeScript enforces `number` type (via module augmentation)
2. **Update all PostgreSQL internal code** (queries, commands) to use `AppId` instead of `string` for IDs
3. Update return types: `insertedId: AppId`, `insertedIds: AppId[]` (resolves to `number` in PostgreSQL host app)

**Example:**
```typescript
import { AppId } from '@loomcore/common/models';

export class PostgresDatabase implements IDatabase {
  // id: AppId becomes id: number in PostgreSQL host app - TypeScript enforces this!
  async getById<T extends IEntity>(operations: Operation[], queryObject: IQueryOptions, id: AppId, pluralResourceName: string): Promise<T | null> {
    // id is already number (via AppId) - controller converted it using TypeBox
    return getByIdQuery(this.client, operations, queryObject, id, pluralResourceName);
  }
  
  // All methods use AppId for IDs - TypeScript prevents wrong types
}
```

**Files to Update:**
- `postgres.database.ts` - method signatures use `id: AppId`
- `postgres-get-by-id.query.ts` - change `id: string` to `id: AppId`
- `postgres-delete-by-id.command.ts` - change `id: string` to `id: AppId`
- `postgres-full-update-by-id.command.ts` - change `id: string` to `id: AppId`
- `postgres-partial-update-by-id.command.ts` - change `id: string` to `id: AppId`
- Any other PostgreSQL code that uses `_id` or ID parameters

**Key Points:**
- Interface uses `id: AppId` which resolves to `id: number` in PostgreSQL host app
- TypeScript enforces `number` type at compile time (via module augmentation)
- Controller converts HTTP strings to `AppId` (which is `number`) using TypeBox before calling service
- All PostgreSQL internal code uses `AppId` for IDs
- Return types are `AppId` (resolves to `number` in PostgreSQL host app)

#### 3b. **MongoDatabase** - Use AppId
**File:** `src/databases/mongo-db/mongo-db.database.ts`

**Changes:**
- **MINIMAL CHANGES** - MongoDB already uses strings for IDs
- **All method signatures use `id: AppId`** - TypeScript enforces `string` type (via module augmentation)
- Update return types: `insertedId: AppId`, `insertedIds: AppId[]` (resolves to `string` in MongoDB host app)
- **DO NOT** change internal MongoDB code - it already expects strings

**Example:**
```typescript
import { AppId } from '@loomcore/common/models';

export class MongoDBDatabase implements IDatabase {
  // id: AppId becomes id: string in MongoDB host app - TypeScript enforces this!
  async getById<T extends IEntity>(operations: Operation[], queryObject: IQueryOptions, id: AppId, pluralResourceName: string): Promise<T | null> {
    // id is already string (via AppId) - controller converted it using TypeBox
    // MongoDB internal code already expects string - no changes needed
    return getById<T>(this.db, operations, queryObject, id, pluralResourceName);
  }
}
```

**Key Points:**
- Interface uses `id: AppId` which resolves to `id: string` in MongoDB host app
- TypeScript enforces `string` type at compile time (via module augmentation)
- Controller converts HTTP strings to `AppId` (which is `string`) using TypeBox before calling service
- MongoDB internal code already expects strings - no changes needed
- Return types are `AppId` (resolves to `string` in MongoDB host app)

---

### 4. **Service Layer** (Use AppId - Exact Types)

#### 4a. **GenericApiService** - Use AppId Directly
**File:** `src/services/generic-api-service/generic-api.service.ts`

**Changes:**
```typescript
import { AppId } from '@loomcore/common/models';

export class GenericApiService<T extends IEntity> 
  implements IGenericApiService<T> {
  
  protected database: IDatabase;
  
  constructor(
    database: IDatabase,
    pluralResourceName: string,
    singularResourceName: string,
    modelSpec: IModelSpec
  ) {
    this.database = database;
    // ... rest of constructor
  }
  
  async getById(userContext: IUserContext, id: AppId): Promise<T> {
    const { operations, queryObject } = this.prepareQuery(userContext, {}, []);
    // id is already AppId (converted by controller using TypeBox)
    const entity = await this.database.getById<T>(operations, queryObject, id, this.pluralResourceName);
    if (!entity) {
      throw new IdNotFoundError();
    }
    return this.postprocessEntity(userContext, entity);
  }
  
  async deleteById(userContext: IUserContext, id: AppId): Promise<DeleteResult> {
    // id is already AppId (converted by controller using TypeBox)
    return await this.database.deleteById(id, this.pluralResourceName);
  }
  
  async fullUpdateById(userContext: IUserContext, id: AppId, entity: T): Promise<T> {
    // id is already AppId (converted by controller using TypeBox)
    // ... implementation
  }
  
  async partialUpdateById(userContext: IUserContext, id: AppId, entity: Partial<T>): Promise<T> {
    // id is already AppId (converted by controller using TypeBox)
    // ... implementation
  }
  
  // ... similar for all other methods that take IDs
}
```

**Key Points:**
- **No generics needed** - `AppId` resolves to the correct type via module augmentation
- **Service methods accept `AppId` directly** - exact types, no conversion needed
- Controllers handle conversion from HTTP strings to `AppId` using TypeBox
- PostgreSQL host app → `AppId` = `number`
- MongoDB host app → `AppId` = `string`
- Database interface uses `AppId` - TypeScript enforces correct type at compile time

---

### 5. **HTTP String Handling** (Controller Layer with TypeBox)

**Problem:** HTTP always provides strings, but services need exact types (`AppId`).

**Solution:** Controllers use TypeBox to validate and convert HTTP string IDs to `AppId` before calling services. This follows the established pattern of using TypeBox for all JSON-to-object conversions.

**Controller Layer (ApiController):**
```typescript
import { Value } from '@sinclair/typebox/value';
import { IdSchema } from '@loomcore/common/validation'; // From common library (configured by host app)
import { AppId } from '@loomcore/common/models';

async getById(req: Request, res: Response, next: NextFunction) {
  res.set('Content-Type', 'application/json');
  
  // Convert HTTP string to AppId using TypeBox
  // IdSchema is configured by host app via setIdSchema() (Type.Number for PostgreSQL, Type.String for MongoDB)
  const idParam = req.params?.id; // Always string from HTTP
  const id = Value.Decode(IdSchema, idParam) as AppId; // TypeBox validates and converts
  
  // Service accepts AppId directly (exact type)
  const entity = await this.service.getById(req.userContext!, id);
  apiUtils.apiResponse<T>(res, 200, { data: entity }, this.modelSpec, this.publicSpec);
}

async deleteById(req: Request, res: Response, next: NextFunction) {
  res.set('Content-Type', 'application/json');
  
  // Convert HTTP string to AppId using TypeBox
  const idParam = req.params?.id;
  const id = Value.Decode(IdSchema, idParam) as AppId;
  
  // Service accepts AppId directly (exact type)
  const deleteResult = await this.service.deleteById(req.userContext!, id);
  apiUtils.apiResponse<DeleteResult>(res, 200, { data: deleteResult }, this.modelSpec, this.publicSpec);
}

// Similar pattern for fullUpdateById, partialUpdateById, etc.
```

**Service Layer (GenericApiService):**
```typescript
// Service accepts AppId directly (exact type, already converted by controller)
async getById(userContext: IUserContext, id: AppId): Promise<T> {
  const { operations, queryObject } = this.prepareQuery(userContext, {}, []);
  // id is already AppId (converted by controller using TypeBox)
  const entity = await this.database.getById<T>(operations, queryObject, id, this.pluralResourceName);
  // ...
}
```

**PostgresDatabase Implementation:**
```typescript
// Database interface uses id: AppId which is id: number in PostgreSQL host app
// TypeScript prevents passing strings - conversion already happened in controller
async getById<T extends IEntity>(operations: Operation[], queryObject: IQueryOptions, id: AppId, pluralResourceName: string): Promise<T | null> {
  // id is already number (via AppId) - TypeScript enforces this
  return getByIdQuery(this.client, operations, queryObject, id, pluralResourceName);
}
```

**MongoDatabase Implementation:**
```typescript
// Database interface uses id: AppId which is id: string in MongoDB host app
// TypeScript prevents passing numbers - conversion already happened in controller
async getById<T extends IEntity>(operations: Operation[], queryObject: IQueryOptions, id: AppId, pluralResourceName: string): Promise<T | null> {
  // id is already string (via AppId) - TypeScript enforces this
  // MongoDB internal code already expects string - no changes needed
  return getById<T>(this.db, operations, queryObject, id, pluralResourceName);
}
```

**Key Points:**
- **Controllers use TypeBox** to validate and convert HTTP strings to `AppId` (follows established pattern)
- **Service layer accepts `AppId` directly** - exact types, no conversion needed
- **Database interface uses `id: AppId`** - TypeScript enforces correct type at compile time
- PostgreSQL host app → `AppId` = `number` (TypeBox validates as number, TypeScript prevents strings)
- MongoDB host app → `AppId` = `string` (TypeBox validates as ObjectId string, TypeScript prevents numbers)
- **TypeBox provides runtime validation** - catches invalid IDs before they reach the service layer
- **TypeScript provides compile-time safety** - prevents type errors at development time

---

## Implementation Order

### Phase 0: Update Common Library
**Library:** `@loomcore/common/models`

1. **Define `AppIdType` interface:**
   ```typescript
   export interface AppIdType {
     id: string | number; // The default, flexible type that the host application will override
   }
   export type AppId = AppIdType['id'];
   ```

2. **Update `IEntity` interface** to use `AppId`:
   ```typescript
   import { AppId } from '../types/app.types.js';
   
   export interface IEntity {
     _id: AppId;
     _orgId?: AppId;
   }
   ```

3. **Export `IdSchema` configuration** from common library:
   ```typescript
   // validation/id-schema.provider.ts in @loomcore/common
   import { Type, TSchema } from '@sinclair/typebox';
   
   // Default flexible schema
   export let IdSchema: TSchema = Type.Union([
     Type.String(),
     Type.Number({ integer: true, minimum: 1 })
   ]);
   
   // Host app calls this during initialization to configure the concrete schema
   export function setIdSchema(schema: TSchema): void {
     IdSchema = schema;
   }
   ```

4. **Update TypeBox schema** to use `IdSchema`:
   ```typescript
   import { Type } from '@sinclair/typebox';
   import { IdSchema } from '../validation/id-schema.provider.js';
   
   export const EntitySchema = Type.Object({
     _id: IdSchema,
     _orgId: Type.Optional(Type.Unsafe({ ...IdSchema, title: 'Organization ID' }))
   });
   ```

5. **Update related types** that reference `_id` to use `AppId`:
   - `IAuditable` (if it references `_id`)
   - Any other interfaces that extend or use `IEntity`

6. **Update Filter type** (if needed):
   - Ensure `Filter.eq` and `Filter.in` support `AppId` for ID fields in queries

7. **Publish/update the common library dependency** in this project

**Rationale:** The common library provides a flexible foundation that host applications configure via module augmentation. This keeps the library generic while allowing type safety at the host app level.

### Phase 1: Update API Library Interfaces
1. Update `IDatabase` interface to use `AppId` instead of generic `TId`
2. Update `IGenericApiService` interface to use `AppId` instead of generic `TId`
3. Fix all TypeScript errors (will show what needs updating)

### Phase 2: Update Database Implementations
1. **PostgresDatabase:**
   - Update all method signatures to use `AppId` for IDs
   - Update all internal PostgreSQL code (queries, commands) to use `AppId`
   - Update return types to use `AppId`
   - Note: In PostgreSQL host app, `AppId` resolves to `number` via module augmentation

2. **MongoDatabase:**
   - Update all method signatures to use `AppId` for IDs
   - Update return types to use `AppId`
   - Note: In MongoDB host app, `AppId` resolves to `string` via module augmentation
   - **DO NOT** change internal MongoDB code - it already expects strings

### Phase 3: Update Service Layer
1. Update `GenericApiService` to use `AppId` instead of generic `TId`
2. Update all method signatures to accept `AppId` directly (exact types)
3. Remove generic type parameters (no longer needed)
4. Remove any ID conversion logic (handled by controllers)

### Phase 4: Update Controllers
1. **Import TypeBox and IdSchema:**
   - Import `Value` from `@sinclair/typebox/value`
   - Import `IdSchema` from host app's `id-schema.provider.ts`

2. **Update controller methods** to use TypeBox for ID conversion:
   - `getById`: Convert `req.params.id` (string) to `AppId` using `Value.Decode(IdSchema, idParam)`
   - `deleteById`: Convert `req.params.id` to `AppId` using TypeBox
   - `fullUpdateById`: Convert `req.params.id` to `AppId` using TypeBox
   - `partialUpdateById`: Convert `req.params.id` to `AppId` using TypeBox

3. **Pass `AppId` to service methods** (service accepts exact types)

### Phase 5: Update Query Filters
1. Update filter building to handle `_id` with proper type conversion
2. PostgreSQL: Convert strings to numbers in filters (AppId resolves to number)
3. MongoDB: Validate ObjectId format in filters (AppId resolves to string)

### Phase 6: Create Host Application Configuration
1. **Create module augmentation file** (`loomcore.d.ts`):
   - For PostgreSQL: Augment `AppIdType` to `{ id: number }`
   - For MongoDB: Augment `AppIdType` to `{ id: string }`

2. **Initialize IdSchema in app setup** (e.g., in main app initialization file):
   ```typescript
   import { setIdSchema } from '@loomcore/common/validation';
   import { Type } from '@sinclair/typebox';
   
   // For PostgreSQL
   setIdSchema(Type.Number({ title: 'ID', integer: true, minimum: 1 }));
   
   // For MongoDB
   // setIdSchema(Type.String({ title: 'ID', pattern: '^[0-9a-fA-F]{24}$' }));
   ```

3. **Verify type resolution:**
   - Import `IEntity` from `@loomcore/common` in host app
   - Verify `IEntity._id` is correctly typed (`number` for PostgreSQL, `string` for MongoDB)
   - Verify TypeScript catches type errors at compile time
   - Verify `IdSchema` is correctly configured (import and check at runtime)

### Phase 7: Tests
1. Update test code to use `AppId` type
2. Verify type safety (TypeScript should catch errors)
3. Run tests for both database types
4. Verify module augmentation works correctly in test environment

---

## Key Design Decisions

### Decision 1: Module Augmentation vs Generics
**Answer:** Use module augmentation at the host application level. This provides:
- **Zero boilerplate** - no need to specify types at every call site
- **Automatic type resolution** - `AppId` resolves to the correct type throughout the codebase
- **Clean separation** - library code uses `AppId`, host app configures the concrete type
- **Type safety** - TypeScript enforces correct types at compile time

### Decision 2: Input vs Output Types
**Answer:** 
- **Controller layer (input):** Receive strings from HTTP
- **Controller layer (conversion):** Use TypeBox (`Value.Decode(IdSchema, idParam)`) to validate and convert HTTP strings to `AppId` before calling services
- **Service layer (input):** Accept `AppId` directly - exact types, no conversion needed
- **Database interface (input):** Use `id: AppId` directly - TypeScript enforces correct type (resolved via module augmentation)
- **Database interface (output):** Return `AppId` (resolves to `number` for PostgreSQL, `string` for MongoDB via module augmentation)
- **Type safety:** TypeScript prevents wrong types at compile time, TypeBox provides runtime validation

### Decision 3: Common Library Updates
**Answer:** Update `@loomcore/common/models` to use `AppId` type from `AppIdType` interface. Host applications augment `AppIdType` to specify the concrete type. This keeps the library generic while providing type safety at the host app level.

### Decision 4: TypeBox Schema Configuration
**Answer:** Common library exports `IdSchema` with a flexible default and provides `setIdSchema()` function for configuration. Host application calls `setIdSchema()` during app initialization to configure the concrete schema. This ensures:
- **No file path dependencies** - everything goes through `@loomcore/common`
- **Runtime validation matches compile-time types** - schema validation aligns with `AppId` type
- **Clean separation** - library code imports from `@loomcore/common`, host app configures once at startup

### Decision 5: MongoDB Changes
**Answer:** Minimal changes to MongoDB code. It already uses strings - just update to use `AppId` type. Do not change internal MongoDB implementation. Module augmentation in MongoDB host app makes `AppId` resolve to `string`.

---

## Benefits of This Approach

✅ **Compile-time type safety** - TypeScript enforces correct ID types via module augmentation
✅ **Zero boilerplate** - No need to specify types at every call site, types flow automatically
✅ **Clean separation** - Library code uses `AppId`, host app configures concrete type once
✅ **No runtime type checking needed** - Type system prevents errors at compile time
✅ **Clear intent** - Module augmentation file clearly shows which ID type is used
✅ **IDE support** - Autocomplete and type checking work correctly throughout codebase
✅ **Refactoring safety** - Changing ID type in augmentation file shows all places that need updates
✅ **Documentation** - Types serve as documentation, augmentation file documents configuration
✅ **Professional pattern** - Module augmentation is a well-established TypeScript pattern for library configuration

---

## Implementation Strategy

1. **Update common library** - Define `AppIdType` and update `IEntity` to use `AppId`
2. **Update API library interfaces** - Replace generic `TId` with `AppId` throughout
3. **Update PostgreSQL** - Use `AppId` for all ID parameters and return types
4. **Update MongoDB** - Use `AppId` for all ID parameters and return types (minimal changes)
5. **Update services** - Use `AppId` instead of generic `TId`, add conversion from `string | number`
6. **Create host app configuration** - Module augmentation file and TypeBox schema override
7. **Verify type resolution** - Ensure `AppId` resolves correctly in host application

---

## Success Criteria

✅ `@loomcore/common/models` updated with `AppIdType` interface and `IEntity` uses `AppId`
✅ TypeScript compiles without errors
✅ `PostgresDatabase` methods use `AppId` for IDs (resolves to `number` in PostgreSQL host app)
✅ `MongoDatabase` methods use `AppId` for IDs (resolves to `string` in MongoDB host app)
✅ `GenericApiService` uses `AppId` instead of generic `TId`
✅ Controllers use TypeBox to convert HTTP strings to `AppId` before calling services
✅ Service layer accepts `AppId` directly (exact types, no conversion needed)
✅ Database interface uses `id: AppId` - TypeScript enforces correct type via module augmentation
✅ Return types use `AppId` (resolves to `number` for PostgreSQL, `string` for MongoDB)
✅ Type system prevents mixing ID types at compile time
✅ Host application has module augmentation file that configures `AppIdType`
✅ Host application has TypeBox schema override for `IdSchema`
✅ Importing `IEntity` from `@loomcore/common` in host app shows correct ID type
✅ All tests pass for both database types
✅ Module augmentation works correctly in test environment
✅ No workarounds for common library limitations
