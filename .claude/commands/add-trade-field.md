# Add Trade Field

Add a new field to the trades table and update all related code.

## Instructions

1. Read current schema from `src/lib/db/schema.ts`
2. Add the new column to the Drizzle schema
3. Generate migration: `npx drizzle-kit generate`
4. Update tRPC router input/output schemas
5. Update the TradesTable column definitions
6. Update AddTradeDialog form
7. Update PnL engine if the field affects calculations
8. Run the db-architect agent for schema review
9. Run the code-reviewer agent on all changed files

## Arguments
$ARGUMENTS = field name, type, and description

## Example
`/add-trade-field marketplace TEXT — which marketplace the gift was bought from (Fragment, GetGems, P2P)`
