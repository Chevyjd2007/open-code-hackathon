import { like, or, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { Database } from "../database/database"
import { AccountTable } from "./sql"
import { AccountV2 } from "../account"

export interface SearchOptions {
  readonly query: string
  readonly limit?: number
}

export interface SearchResult {
  readonly id: AccountV2.ID
  readonly email: string
  readonly url: string
}

export interface Interface {
  readonly search: (options: SearchOptions) => Effect.Effect<SearchResult[]>
  readonly searchByEmail: (email: string) => Effect.Effect<SearchResult[]>
  readonly searchByUrl: (url: string) => Effect.Effect<SearchResult[]>
  readonly findById: (id: AccountV2.ID) => Effect.Effect<SearchResult | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/AccountSearch") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const toSearchResult = (row: { id: AccountV2.ID; email: string; url: string }): SearchResult => ({
      id: row.id,
      email: row.email,
      url: row.url,
    })

    const search = Effect.fn("AccountSearch.search")(function* (options: SearchOptions) {
      const searchPattern = `%${options.query}%`
      const limit = options.limit ?? 50

      const rows = yield* db
        .select({
          id: AccountTable.id,
          email: AccountTable.email,
          url: AccountTable.url,
        })
        .from(AccountTable)
        .where(or(like(AccountTable.email, searchPattern), like(AccountTable.url, searchPattern)))
        .limit(limit)
        .all()
        .pipe(Effect.orDie)

      return rows.map(toSearchResult)
    })

    const searchByEmail = Effect.fn("AccountSearch.searchByEmail")(function* (email: string) {
      const searchPattern = `%${email}%`

      const rows = yield* db
        .select({
          id: AccountTable.id,
          email: AccountTable.email,
          url: AccountTable.url,
        })
        .from(AccountTable)
        .where(like(AccountTable.email, searchPattern))
        .all()
        .pipe(Effect.orDie)

      return rows.map(toSearchResult)
    })

    const searchByUrl = Effect.fn("AccountSearch.searchByUrl")(function* (url: string) {
      const searchPattern = `%${url}%`

      const rows = yield* db
        .select({
          id: AccountTable.id,
          email: AccountTable.email,
          url: AccountTable.url,
        })
        .from(AccountTable)
        .where(like(AccountTable.url, searchPattern))
        .all()
        .pipe(Effect.orDie)

      return rows.map(toSearchResult)
    })

    const findById = Effect.fn("AccountSearch.findById")(function* (id: AccountV2.ID) {
      const row = yield* db
        .select({
          id: AccountTable.id,
          email: AccountTable.email,
          url: AccountTable.url,
        })
        .from(AccountTable)
        .where(sql`${AccountTable.id} = ${id}`)
        .get()
        .pipe(Effect.orDie)

      return row ? toSearchResult(row) : undefined
    })

    return Service.of({ search, searchByEmail, searchByUrl, findById })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Database.layer))
