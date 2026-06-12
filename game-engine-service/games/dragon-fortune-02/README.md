# Dragon Fortune (`dragon-fortune-02`)

Placeholder for the second slot game plugin. Demonstrates how new titles are added without changing GES platform code or GMS operator APIs.

## Status

Not implemented. Use this folder as a template when starting the next title.

## Planned Metadata

| Field | Value |
|-------|-------|
| gameId | `dragon-fortune-02` |
| code | `DRAGON-FORTUNE-02` |
| category | slots |

## To Implement

1. Copy structure from `asian-tour-01/` (after migration)
2. Build engine + settlement
3. Add `plugin.ts` implementing [GamePlugin](../../docs/game-plugin-contract.md)
4. Register in `platform/server/bootstrap.ts`
5. Add client under `clients/dragon-fortune-02/`
6. Register in GMS catalog

See [../../docs/adding-a-game.md](../../docs/adding-a-game.md).
