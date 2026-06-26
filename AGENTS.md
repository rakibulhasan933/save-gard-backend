# AGENTS.md

## Project Overview

This project is the backend for `super-sefty-signal`, a standalone Node.js service for a child safety / parental monitoring product. It exposes:

- An HTTP JSON API for admin authentication, child profile management, device pairing, app blocking rules, web filtering rules, and live-screen session state.
- A WebSocket signaling server at `/ws` for authenticated admins and child devices to exchange status updates, live-screen requests, and WebRTC signaling messages.
- PostgreSQL persistence through Drizzle ORM.

The main users are:

- Admin dashboard users, usually parents or guardians, who register/login, create child profiles, configure rules, and request live-screen sessions.
- Child devices, usually mobile apps, that pair with a child profile, authenticate with a child JWT, report status, and participate in live-screen/WebRTC flows.

## Tech Stack

Package manager:

- `pnpm@9.15.4`

Runtime dependencies from `package.json`:

- `bcryptjs`: `^3.0.2`
- `drizzle-orm`: `^0.44.2`
- `express`: `^5.2.1`
- `jose`: `^6.0.11`
- `postgres`: `^3.4.7`
- `ws`: `^8.18.3`
- `zod`: `^3.25.67`

Development dependencies from `package.json`:

- `@types/bcryptjs`: `^2.4.6`
- `@types/express`: `^5.0.6`
- `@types/node`: `^20.19.1`
- `@types/ws`: `^8.18.1`
- `dotenv`: `^16.4.7`
- `tsx`: `^4.22.4`
- `typescript`: `^5.8.3`

TypeScript configuration:

- `target`: `ES2017`
- `module`: `esnext`
- `moduleResolution`: `bundler`
- `lib`: `["esnext"]`
- `strict`: `true`
- `skipLibCheck`: `true`
- `esModuleInterop`: `true`
- `resolveJsonModule`: `true`
- `isolatedModules`: `true`
- `noEmit`: `true`
- `baseUrl`: `.`
- `include`: `src/**/*.ts`
- `exclude`: `node_modules`

## Folder Structure

Actual project files:

```text
.
|-- .env
|-- .env.example
|-- .agents/
|-- .codex/
|-- .git/
|-- .pnpm-store/
|-- node_modules/
|-- package.json
|-- pnpm-lock.yaml
|-- README.md
|-- tsconfig.json
`-- src/
    |-- server.ts
    |-- signal-server.ts
    |-- start.ts
    |-- db/
    |   |-- index.ts
    |   `-- schema.ts
    |-- lib/
    |   |-- auth.ts
    |   |-- childToken.ts
    |   |-- data-access.ts
    |   |-- http.ts
    |   |-- realtime-publisher.ts
    |   |-- server-config.ts
    |   `-- validators.ts
    |-- realtime/
    |   |-- connections.ts
    |   |-- messageTypes.ts
    |   `-- signalingServer.ts
    `-- routes/
        |-- api.ts
        |-- app-rules.ts
        |-- auth.ts
        |-- children.ts
        |-- live-screen.ts
        |-- pair.ts
        |-- shared.ts
        `-- web-rules.ts
```

Folder responsibilities:

- `src/server.ts`: Main process entry. Loads env files, validates config, checks database connectivity, builds Express, mounts routes, creates the HTTP server, attaches WebSocket upgrades, starts the live-screen database listener, and listens on the configured port.
- `src/start.ts`: Production entry. Sets `NODE_ENV=production` then imports `server.ts`.
- `src/signal-server.ts`: Alternate entry that imports `server.ts`.
- `src/routes/`: Express routers and route handlers. There are no separate controller files; handlers are local functions in each route file.
- `src/routes/shared.ts`: Shared route utilities, including Express wrapper, admin auth guard, Zod/JSON error handling, CORS helper, and pairing-code generation.
- `src/lib/`: Reusable HTTP, auth, child-token, validator, config, data-access, and PostgreSQL notification helpers.
- `src/db/`: Drizzle database connection and PostgreSQL schema/table/type definitions.
- `src/realtime/`: WebSocket connection registries, message schemas/types, and signaling server behavior.
- `node_modules/` and `.pnpm-store/`: Installed dependencies and pnpm store artifacts. Do not edit.
- `.agents/` and `.codex/`: Local agent/tooling metadata. Not part of runtime business logic.

## Request And Data Flow

Startup flow:

1. `src/server.ts` determines development vs production from `NODE_ENV`.
2. It loads env files in order. Development loads `.env.development.local`, `.env.local`, `.env.development`, `.env`; production loads `.env.production.local`, `.env.local`, `.env.production`, `.env`.
3. `getServerConfig()` in `src/lib/server-config.ts` requires `DATABASE_URL` and a `JWT_SECRET` of at least 32 characters.
4. `src/db/index.ts` creates a `postgres` client with `ssl: "require"`, `max: 10`, and `prepare: false`, then wraps it with Drizzle.
5. Startup executes `select 1` to fail fast if the database is unreachable.
6. Express is created, `x-powered-by` is disabled, and an inline OPTIONS/CORS middleware responds before routing.
7. `createApiRouter(httpPort)` is mounted at both `/` and `/api`.
8. A Node HTTP server is created around Express.
9. WebSocket upgrades are routed through `handleUpgrade(..., "/ws")`.
10. `startLiveScreenRequestListener()` subscribes to PostgreSQL notifications for live-screen requests.

HTTP request flow:

1. Request reaches Express in `src/server.ts`.
2. OPTIONS requests are handled by the inline CORS middleware using `buildCorsHeaders()` and `sendNoContent()`.
3. Route matching happens through `src/routes/api.ts`.
4. Route handlers are wrapped with `wrap()` from `src/routes/shared.ts`.
5. Protected routes call `requireAdmin()`, which reads the `admin_session` cookie, verifies the JWT, and loads the admin from PostgreSQL.
6. Bodies are read manually with `readJsonBody()` from `src/lib/http.ts`.
7. Input validation uses Zod schemas from `src/lib/validators.ts` or local route schemas.
8. Database operations use Drizzle via `db`.
9. Responses use `sendJson()` / `sendError()` from `src/lib/http.ts`.

WebSocket flow:

1. HTTP upgrade requests for `/ws` are handled by `handleUpgrade()` in `src/realtime/signalingServer.ts`.
2. `createSignalingServer()` creates a `ws` server with `noServer: true`.
3. Authentication can happen from URL query params or from the first WebSocket auth message.
4. Admin sockets use `verifySessionToken()` from `src/lib/auth.ts`.
5. Child sockets use `verifyChildToken()` from `src/lib/childToken.ts`.
6. Authenticated sockets are stored in maps managed by `src/realtime/connections.ts`.
7. Incoming messages are parsed and validated with Zod schemas in `src/realtime/messageTypes.ts`.
8. `handleMessage()` dispatches by message `type`.
9. Messages update database state or are relayed to the matching admin/child socket.

## Business Logic

### Health And Root API

- Files: `src/routes/api.ts`, `src/server.ts`
- `GET /health` returns `{ ok: true }`.
- `GET /` returns service metadata, `apiUrl`, and `wsUrl`.
- The same router is mounted under both `/` and `/api`, so endpoints are available with or without the `/api` prefix.

### Auth Module

- Files: `src/routes/auth.ts`, `src/lib/auth.ts`, `src/lib/http.ts`, `src/lib/validators.ts`, `src/db/schema.ts`
- `POST /auth/register`: request body -> `emailPasswordSchema` -> check `admins` by email -> hash password with bcrypt -> insert admin -> create JWT session -> set `admin_session` cookie -> return admin id/email.
- `POST /auth/login`: request body -> `emailPasswordSchema` -> load admin by email -> verify bcrypt password -> create JWT session -> set `admin_session` cookie -> return admin id/email.
- `POST /auth/logout`: clears `admin_session` cookie and returns `{ ok: true }`.
- Session JWTs are signed with HS256 using `JWT_SECRET` and expire after 7 days.
- Cookies are HTTP-only. `SameSite` is `lax` in development and `none` in production. `Secure` is enabled in production.

### Admin Authorization

- Files: `src/routes/shared.ts`, `src/lib/auth.ts`, `src/lib/http.ts`
- Protected route handler -> `requireAdmin()` -> `getCurrentAdminFromHeaders()` -> parse `admin_session` cookie -> verify JWT -> query `admins` table -> return `{ id, email }` or send `401 Unauthorized`.
- Ownership checks are not centralized in middleware. They are performed per feature through data-access helpers such as `getOwnedChild()`, `getOwnedAppRule()`, `getOwnedWebRule()`, and `getOwnedLiveScreenSession()`.

### Children Module

- Files: `src/routes/children.ts`, `src/routes/shared.ts`, `src/lib/data-access.ts`, `src/lib/validators.ts`, `src/db/schema.ts`
- `GET /children`: admin session -> query children for `admin.id` ordered by `createdAt desc` -> return `{ children }`.
- `POST /children`: admin session -> `createChildSchema` -> generate unique 8-character pairing code -> insert child with `status: "unpaired"` by DB default -> return child.
- `GET /children/:childId`: admin session -> `getOwnedChild(childId, admin.id)` -> return child or 404.
- `PATCH /children/:childId`: admin session -> ownership check -> `updateChildSchema` -> update `displayName`, `status`, and `updatedAt` -> return updated child.
- `DELETE /children/:childId`: admin session -> ownership check -> soft-disable by setting `status: "disabled"` and `updatedAt` -> return updated child.
- Pairing codes are generated in `routes/shared.ts` using alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, retrying up to 8 times for uniqueness.

### Child Pairing Module

- Files: `src/routes/pair.ts`, `src/lib/childToken.ts`, `src/lib/http.ts`, `src/db/schema.ts`
- Mounted as `/child/pair` because `api.ts` mounts `pairRouter` under `/child`.
- Child device posts `pairingCode`, optional `deviceUuid`, `platform`, `osVersion`, and `appVersion`.
- Handler validates a local Zod schema, uppercases the pairing code, and creates a random UUID if no `deviceUuid` is provided.
- It finds a non-disabled child by pairing code.
- If the child was `unpaired`, it updates status to `paired`.
- It inserts or updates the `child_devices` row using `deviceUuid` as the conflict target.
- It issues a 30-day child JWT with payload `{ id: childId, role: "child" }`.
- Response is `{ childId, childToken, deviceUuid }`.

### App Rules Module

- Files: `src/routes/app-rules.ts`, `src/lib/data-access.ts`, `src/lib/validators.ts`, `src/db/schema.ts`
- `GET /app-rules/:childId/app-rules`: admin session -> child ownership check -> list app block rules ordered by newest first.
- `POST /app-rules/:childId/app-rules`: admin session -> child ownership check -> `createAppRuleSchema` -> insert `packageName`, optional `label`, and `isEnabled` -> return rule.
- `PATCH /app-rules/:ruleId`: admin session -> `getOwnedAppRule()` -> `updateAppRuleSchema` -> update `label` and/or `isEnabled` -> return rule.
- `DELETE /app-rules/:ruleId`: admin session -> `getOwnedAppRule()` -> delete rule -> return `{ ok: true }`.
- There is no current WebSocket push after app-rule changes, even though `UPDATE_BLOCK_RULES` exists in realtime message types.

### Web Rules Module

- Files: `src/routes/web-rules.ts`, `src/lib/data-access.ts`, `src/lib/validators.ts`, `src/db/schema.ts`
- `GET /web-rules/:childId/web-rules`: admin session -> child ownership check -> list web rules ordered by newest first.
- `POST /web-rules/:childId/web-rules`: admin session -> child ownership check -> `createWebRuleSchema` -> insert `domain`, optional `category`, and `isBlocked` -> return rule.
- `PATCH /web-rules/:ruleId`: admin session -> `getOwnedWebRule()` -> `updateWebRuleSchema` -> update `category` and/or `isBlocked` -> return rule.
- `DELETE /web-rules/:ruleId`: admin session -> `getOwnedWebRule()` -> delete rule -> return `{ ok: true }`.
- There is no current WebSocket push after web-rule changes, even though `UPDATE_BLOCK_RULES` exists in realtime message types.

### Live Screen HTTP Module

- Files: `src/routes/live-screen.ts`, `src/lib/realtime-publisher.ts`, `src/lib/data-access.ts`, `src/lib/validators.ts`, `src/realtime/signalingServer.ts`, `src/db/schema.ts`
- `GET /live-screen/:childId/live-screen`: admin session -> child ownership check -> list latest 25 live-screen sessions for child.
- `POST /live-screen/:childId/live-screen/request`: admin session -> child ownership check -> insert `live_screen_sessions` with `status: "requested"` -> call `notifyLiveScreenRequest()` -> return session.
- `PATCH /live-screen/:sessionId/start`: admin session -> session ownership check -> set status `active`, set `startedAt`, clear `reason` -> return session.
- `PATCH /live-screen/:sessionId/end`: admin session -> session ownership check -> `endLiveScreenSchema` -> set status `ended`, set `endedAt`, set optional reason -> return session.
- `PATCH /live-screen/:sessionId/fail`: admin session -> session ownership check -> `failLiveScreenSchema` -> set status `failed`, set `endedAt`, set reason -> return session.
- Live-screen request data flow: admin HTTP request -> route inserts session -> `pg_notify("live_screen_requests", notice)` -> WebSocket listener receives session id -> `signalLiveScreenRequest()` -> bind target -> broadcast `LIVE_SCREEN_REQUEST` to connected child sockets.

### WebSocket Signaling Module

- Files: `src/realtime/signalingServer.ts`, `src/realtime/connections.ts`, `src/realtime/messageTypes.ts`, `src/lib/auth.ts`, `src/lib/childToken.ts`, `src/db/schema.ts`
- Connection auth:
  - Query auth: `/ws?role=admin&token=...` or `/ws?role=child&token=...&deviceUuid=...`.
  - Message auth: first message is `AUTH_ADMIN` with session token or `AUTH_CHILD` with child token and device UUID.
  - Auth timeout is 10 seconds.
- Connection registry:
  - Admin sockets are stored by `adminId`.
  - Child sockets are stored by `childId` and `deviceUuid`.
  - New child connection for the same device UUID closes the old socket.
  - Live-screen targets are tracked by `sessionId`, optionally pinned to a child device UUID after acceptance.
- `STATUS_UPDATE`: child socket only -> payload identity must match socket identity -> update child `lastSeenAt` -> update device `lastOnlineAt` and `updatedAt` -> broadcast status to admin sockets.
- `LIVE_SCREEN_ACCEPTED`: child socket only -> validate session belongs to child -> bind target to child device -> set session `active` and `startedAt` -> broadcast acceptance to admin.
- `LIVE_SCREEN_REJECTED`: child socket only -> validate session belongs to child -> clear target -> set session `failed`, `endedAt`, and reason -> broadcast rejection to admin.
- `LIVE_SCREEN_ENDED`: admin or child socket -> validate ownership -> set session `ended`, `endedAt`, and optional reason -> relay to the other side -> clear target.
- `WEBRTC_OFFER`, `WEBRTC_ANSWER`, `WEBRTC_ICE_CANDIDATE`: admin or child socket -> validate session and `fromRole` -> relay to the other side. Admin-to-child messages require an accepted target child device; otherwise an error `CHILD_OFFLINE` is sent.
- `PING` returns `PONG`; `PONG` is accepted as no-op.

### Database Schema

- Files: `src/db/schema.ts`, `src/db/index.ts`
- Tables:
  - `admins`: admin account credentials.
  - `children`: child profiles owned by admins, with pairing code, status, and last seen time.
  - `child_devices`: paired device records keyed by `deviceUuid`.
  - `app_block_rules`: app package block settings per child.
  - `web_filter_rules`: domain/category block settings per child.
  - `live_screen_sessions`: live-screen request/session state per child/admin.
- Enums:
  - `child_status`: `unpaired`, `paired`, `disabled`
  - `device_platform`: `android`, `ios`, `web`
  - `live_screen_status`: `requested`, `active`, `ended`, `failed`
- Exported schema-derived types:
  - `Admin`
  - `Child`
  - `LiveScreenSession`

## TypeScript Conventions

- Strict mode is on: `strict: true`.
- The project does not have `*.dto.ts`, `*.types.ts`, or an `interfaces/` directory.
- Runtime validation and request shape definitions are Zod schemas:
  - HTTP request schemas live mainly in `src/lib/validators.ts`.
  - WebSocket schemas live in `src/realtime/messageTypes.ts`.
  - One local pairing request schema lives inside `src/routes/pair.ts`.
- Most exported TypeScript types are derived with `z.infer<typeof schema>` or Drizzle `$inferSelect`.
- Existing type naming patterns:
  - Schema constants use lower camel case ending in `Schema`, for example `emailPasswordSchema`, `clientMessageSchema`.
  - Inferred types use PascalCase, for example `ClientMessage`, `ServerMessage`, `ChildTokenPayload`, `SessionPayload`.
  - Connection types use PascalCase descriptive names, for example `AdminConnection`, `ChildConnection`, `ConnectionContext`, `LiveScreenTarget`.
  - Database table constants use lower camel case plural names, for example `admins`, `children`, `liveScreenSessions`.
- The current code avoids explicit `any`. Continue that pattern. Do not introduce `any`; define proper types, use `unknown` for untrusted values, or infer from Zod/Drizzle.
- Several route handlers accept `IncomingMessage` / `ServerResponse` rather than Express `Request` / `Response`, then narrow route params with inline structural casts like `(request as { params?: { childId?: string } })`.

## Commands

Scripts from `package.json`:

- `pnpm dev`: runs `tsx src/server.ts`. Starts the development server without setting `NODE_ENV=production`.
- `pnpm build`: runs `tsc -p tsconfig.json`. Type-checks the project because `noEmit` is true.
- `pnpm start`: runs `tsx src/start.ts`. Sets `NODE_ENV=production` then starts the server.

Useful setup from README:

- `pnpm install`: installs dependencies.

Required environment:

- `DATABASE_URL`: PostgreSQL connection string. Startup fails if missing or unreachable.
- `JWT_SECRET`: must be at least 32 characters. Used for admin session JWTs and child JWTs.
- `API_PORT`, `HTTP_PORT`, or `PORT`: HTTP listen port. Defaults to `4000`.
- `WS_PORT`: parsed by config but the current server uses the HTTP server and `/ws` upgrade path on the same port. Defaults to `4000`.
- `CORS_ORIGIN` or `FRONTEND_ORIGIN`: comma-separated allowed origins. Defaults to `http://localhost:3000`.

## Coding Conventions

- Keep route registration in `src/routes/api.ts`.
- Keep route-specific handlers in the matching `src/routes/*.ts` file unless a shared helper is actually reused.
- Use `wrap()` for async route handlers so rejected promises flow to Express.
- Build CORS headers per request with `buildCorsHeaders(request)` and pass them into all responses.
- Use `sendJson()`, `sendError()`, and `sendNoContent()` instead of calling Express response helpers directly.
- Read request bodies with `readJsonBody()` and validate with Zod before touching business data.
- Use `handleHandlerError()` for Zod and invalid JSON errors in handlers that parse request bodies.
- Check admin authentication with `requireAdmin()` before protected database operations.
- Check ownership with `getOwnedChild()`, `getOwnedAppRule()`, `getOwnedWebRule()`, or `getOwnedLiveScreenSession()` before returning, mutating, or deleting child-owned records.
- Use Drizzle query builders and schema objects from `src/db/schema.ts`; avoid raw SQL except for intentional cases such as PostgreSQL `pg_notify`.
- Preserve existing JWT requirements: `JWT_SECRET` must be at least 32 characters, admin sessions expire in 7 days, child tokens expire in 30 days.
- For WebSocket messages, add or change message contracts in `src/realtime/messageTypes.ts` first, then update `handleMessage()` and relay logic.
- Keep WebSocket connection bookkeeping in `src/realtime/connections.ts`.
- Keep direct request/response transport helpers in `src/lib/http.ts`.

## Do NOT

- Do not use `any`. Use specific types, `unknown`, Zod inference, Drizzle inference, or explicit discriminated unions.
- Do not add business logic in controllers or thin route wrappers if it belongs in shared helpers or data-access functions. This repo currently uses route-local handlers, so keep handlers readable and move repeated ownership/query logic to `src/lib/data-access.ts`.
- Do not change Zod schemas, WebSocket message schemas, or Drizzle table definitions without updating every usage and data flow that depends on them.
- Do not bypass `requireAdmin()` on admin-only routes.
- Do not return or mutate child-owned records without an ownership check.
- Do not read cookies manually outside `src/lib/auth.ts` unless there is a clear reason.
- Do not hand-roll JSON responses in routes; use `src/lib/http.ts`.
- Do not add routes only under `/api` or only under `/` unless intentional; the shared router is mounted at both prefixes.
- Do not assume a child is online just because the database record exists. WebSocket delivery depends on an active socket, and stale status is considered after 120 seconds.
- Do not send WebRTC admin-to-child messages before a live-screen target is accepted and bound to a child device.
- Do not edit generated or dependency directories such as `node_modules/` or `.pnpm-store/`.
- Do not commit secrets from `.env`; use `.env.example` as the safe template.
