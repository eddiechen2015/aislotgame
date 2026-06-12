# Game Management Backend (GMS)

A .NET/C# backend platform for slot game vendors to integrate with third-party casino operators via service-to-service APIs.

## Purpose

GMS sits between **operators** (casino platforms that own players and main wallets) and **game engines** (slot math and spin execution). It is responsible for:

- Registering and maintaining players on behalf of operators
- Managing player sessions for game access
- Handling wallet flows for two integration models: **normal wallet** and **seamless wallet**
- Exposing a consistent operator-facing API for login, validation, transfers, game catalog, and game launch

This repository contains **design and specification documentation only**. Implementation has not started.

## Relationship to the Slot Engine

The existing [Asian Tour slot engine](../ARCHITECTURE.md) in this monorepo handles pure math execution, settlement, and a demo HTTP server. GMS is a separate product layer that:

1. Authenticates players coming from operator platforms
2. Resolves wallet type and funds availability before a spin
3. Returns launch URLs that route players into hosted game instances
4. Coordinates bet debit and win credit according to wallet model

GMS does **not** replace the game engine; it orchestrates access to it.

## Core Components

| Component | Responsibility |
|-----------|----------------|
| [Player Management](docs/player-management.md) | Player registration, identity mapping, session lifecycle |
| [Wallet Management](docs/wallet-management.md) | Normal (casino) wallet and seamless (operator callback) wallet |
| [Operator API](docs/operator-api.md) | Service-to-service endpoints operators call |

See [ARCHITECTURE.md](ARCHITECTURE.md) for system design, deployment topology, and cross-cutting concerns.

## Wallet Models at a Glance

### Normal Wallet

- GMS maintains a **casino wallet** balance per player.
- The operator's **main wallet** lives on the operator side.
- Before play, the operator transfers funds into the casino wallet via API.
- Bets and wins are settled against the casino wallet inside GMS.

### Seamless Wallet

- No casino wallet balance is held in GMS.
- On each bet, GMS calls the operator's **callback API** to debit the main wallet.
- If the callback succeeds, the spin proceeds; if it fails, the spin is rejected.
- Wins are credited back via operator callback.

## Operator API Summary

| API | Normal Wallet | Seamless Wallet |
|-----|:-------------:|:---------------:|
| Player login / register | ✓ | ✓ |
| Session validation | ✓ | ✓ |
| Money transfer | ✓ | — |
| Game list | ✓ | ✓ |
| Game information | ✓ | ✓ |
| Game launch URL | ✓ | ✓ |

Full request/response contracts: [docs/operator-api.md](docs/operator-api.md)

## Documentation Index

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture, boundaries, and technology direction |
| [docs/player-management.md](docs/player-management.md) | Player identity, registration, sessions |
| [docs/wallet-management.md](docs/wallet-management.md) | Wallet types, transfers, callbacks, settlement |
| [docs/operator-api.md](docs/operator-api.md) | Operator-facing API specification |
| [docs/integration-guide.md](docs/integration-guide.md) | End-to-end integration flows for operators |
| [docs/game-engine-integration.md](docs/game-engine-integration.md) | How GMS integrates with the Game Engine Service |
| [../game-engine-service/README.md](../game-engine-service/README.md) | Unified multi-game engine service (GES) |

## Planned Technology Stack

| Layer | Direction |
|-------|-----------|
| Runtime | .NET 8+ (LTS) |
| API | ASP.NET Core Web API |
| Persistence | PostgreSQL (players, sessions, casino wallets, audit) |
| Cache | Redis (session lookup, idempotency keys) |
| Messaging | Optional queue for async wallet reconciliation |
| Auth | API keys / mTLS for operator service-to-service calls |

Final stack choices will be confirmed during implementation.

## Project Status

**Phase: Design & specification**

- [x] Requirements captured
- [x] Architecture documented
- [x] API contracts drafted
- [ ] Solution structure and .NET projects
- [ ] Database schema
- [ ] Implementation

## Glossary

| Term | Definition |
|------|------------|
| **Operator** | Third-party casino platform integrating with GMS |
| **Player** | End user identified by the operator; mapped to a GMS player record |
| **Main wallet** | Player balance held and authoritative on the operator side |
| **Casino wallet** | Balance held in GMS for normal-wallet operators |
| **Session** | Short-lived token linking an operator player to an active game context |
| **Seamless wallet** | Integration where GMS delegates debit/credit to operator callbacks |
| **Normal wallet** | Integration where funds are pre-transferred into GMS casino wallet |
