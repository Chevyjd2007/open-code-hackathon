# Account Search Function

A user/account search function that queries the database using Drizzle ORM and Effect.

## Location

`packages/core/src/account/search.ts`

## Features

The search module provides four main functions:

### 1. General Search (`search`)
Searches both email and URL fields with a single query string.

```typescript
const results = yield* accountSearch.search({ 
  query: "example.com", 
  limit: 10  // optional, defaults to 50
})
```

### 2. Search by Email (`searchByEmail`)
Search accounts by email address only.

```typescript
const results = yield* accountSearch.searchByEmail("user@example.com")
```

### 3. Search by URL (`searchByUrl`)
Search accounts by URL only.

```typescript
const results = yield* accountSearch.searchByUrl("https://api.example.com")
```

### 4. Find by ID (`findById`)
Find a specific account by its ID.

```typescript
const result = yield* accountSearch.findById(accountId)
```

## Return Type

All search functions return `SearchResult[]` (or `SearchResult | undefined` for `findById`):

```typescript
interface SearchResult {
  readonly id: AccountV2.ID
  readonly email: string
  readonly url: string
}
```

## Usage

### Basic Usage with Effect.gen

```typescript
import { Effect } from "effect"
import * as AccountSearch from "@opencode-ai/core/account/search"

const searchAccounts = Effect.gen(function* () {
  const accountSearch = yield* AccountSearch.Service
  const results = yield* accountSearch.search({ query: "example" })
  return results
})
```

### With Default Layer

```typescript
import { Effect } from "effect"
import * as AccountSearch from "@opencode-ai/core/account/search"

const runSearch = (query: string) =>
  Effect.gen(function* () {
    const accountSearch = yield* AccountSearch.Service
    return yield* accountSearch.search({ query })
  }).pipe(Effect.provide(AccountSearch.defaultLayer))

// Execute the search
const results = await Effect.runPromise(runSearch("example"))
```

## Implementation Details

- Uses Drizzle ORM's `like` operator for pattern matching
- Searches use `%query%` pattern for partial matches
- Default result limit is 50 records
- All queries use `.orDie` for error handling (throws on database errors)
- Follows Effect v4 patterns with `Effect.fn` for tracing
- Returns only non-sensitive fields (id, email, url) - excludes tokens

## Database Schema

The search queries the `AccountTable` which has the following structure:

```typescript
{
  id: text().$type<AccountV2.ID>().primaryKey(),
  email: text().notNull(),
  url: text().notNull(),
  access_token: text().$type<AccountV2.AccessToken>().notNull(),
  refresh_token: text().$type<AccountV2.RefreshToken>().notNull(),
  token_expiry: integer(),
  time_created: integer(),
  time_updated: integer(),
}
```

## Examples

See `packages/core/src/account/search-example.ts` for complete usage examples.
