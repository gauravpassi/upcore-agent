# TurboIAM API Reference

> Single source of truth for all API endpoints and request/response shapes.
<!-- AUTO-MAINTENANCE: Update this file when... -->
<!-- - Adding/removing/renaming endpoints -->
<!-- - Changing required roles on any endpoint -->
<!-- - Modifying request body or response shape -->
<!-- - Adding query parameters -->

Base URL: `http://localhost:3000` | All protected routes require `Authorization: Bearer <accessToken>`

---

## Auth (`/api/auth`)

### POST /api/auth/login
**Public** | Login with email + password
```json
// Request
{ "email": "user@company.com", "password": "..." }
// Response 200
{ "accessToken": "...", "refreshToken": "...", "user": { "id", "email", "firstName", "lastName", "role", "enterpriseId" } }
```

### POST /api/auth/refresh
**Public** | Get new access token
```json
// Request
{ "refreshToken": "..." }
// Response 200
{ "accessToken": "...", "refreshToken": "..." }
```

### POST /api/auth/logout
**JWT** | Invalidate refresh token
```json
// Request
{ "refreshToken": "..." }
// Response 200
{ "message": "Logged out" }
```

### GET /api/auth/me
**JWT** | Current user profile
```json
// Response 200
{ "id", "email", "firstName", "lastName", "role", "avatarUrl", "isActive", "enterpriseId", "authMethod", "lastLoginAt" }
```

### PUT /api/auth/me/profile
**JWT** | Update profile
```json
// Request (all optional)
{ "firstName": "...", "lastName": "...", "avatarUrl": "..." }
// Response: updated user object
```

### PUT /api/auth/me/change-password
**JWT** | Change password
```json
// Request
{ "currentPassword": "...", "newPassword": "..." }
// Response 200
{ "message": "Password updated" }
```

### GET /api/auth/okta/initiate?email=
**Public** | Start Okta SSO — looks up enterprise by email domain
```json
// Response 200
{ "authorizationUrl": "https://dev-xxx.okta.com/oauth2/v1/authorize?..." }
```

### GET /api/auth/okta/callback?code=&state=
**Public** | Okta redirect handler — issues Redis session, redirects to frontend
- Redirects to: `{FRONTEND_URL}/auth/sso/callback?sid={sessionId}` on success
- Redirects to: `{FRONTEND_URL}/login?error=sso_failed` on failure

### POST /api/auth/okta/session
**Public** | One-time exchange of SSO session ID for tokens
```json
// Request
{ "sid": "uuid-session-id" }
// Response 200
{ "accessToken": "...", "refreshToken": "...", "user": {...} }
```

---

## Users (`/api/users`)
All endpoints require JWT. Role requirements noted per endpoint.

### GET /api/users
**JWT** (any role) | List users with pagination and filters
```
Query params: page (default:1), limit (default:10), search (name/email), role, status (active|inactive)
```
```json
// Response 200
{
  "users": [{ "id", "email", "firstName", "lastName", "role", "avatarUrl", "isActive", "lastLoginAt", "createdAt" }],
  "total": 42, "page": 1, "limit": 10, "totalPages": 5
}
```

### GET /api/users/metrics
**JWT** (any role) | Quick stats
```json
// Response 200
{ "totalActive": 38, "suspended": 4 }
```

### GET /api/users/:id
**JWT** (any role) | Single user by ID
```json
// Response 200 — same user shape as list item
```

### POST /api/users
**SUPER_ADMIN, GRC_ADMIN** | Create a new user
```json
// Request
{ "email": "...", "firstName": "...", "lastName": "...", "role": "APP_ADMIN", "password": "..." }
// Response 201 — created user object
```

### PUT /api/users/:id
**JWT** (any role, own data) | Update profile fields
```json
// Request (all optional)
{ "firstName": "...", "lastName": "...", "isActive": true }
// Response 200 — updated user
```

### PUT /api/users/:id/role
**SUPER_ADMIN** | Change user role
```json
// Request
{ "role": "SSO_ADMIN" }
// Response 200 — updated user
```

### DELETE /api/users/:id
**SUPER_ADMIN, GRC_ADMIN** | Deactivate user (soft delete)
```
Response 204 No Content
```

---

## Applications (`/api/applications`)
All require JWT.

### GET /api/applications
**All roles** | List applications
```
Query params: search, page (default:1), limit (default:20), platform
```
```json
// Response 200
{
  "applications": [{ "id", "name", "applicationId", "description", "platform", "ssoStatus", "igaStatus", "riskLevel", "primaryOwner", "createdAt" }],
  "total": 15, "page": 1, "limit": 20, "totalPages": 1
}
```

### GET /api/applications/metrics
**SA, AA, SSO, GRC, AUD** | Application stats
```json
// Response 200
{ "total": 15, "byStatus": {...}, "bySsoStatus": {...} }
```

### GET /api/applications/:id
**All roles** | Single application detail
```json
// Response 200 — full application object with relations
```

### POST /api/applications
**SUPER_ADMIN, APP_ADMIN** | Register new application
```json
// Request
{
  "name": "Salesforce", "applicationId": "sfdc-prod", "description": "...",
  "businessFunction": "CRM", "platform": "salesforce",
  "riskLevel": "HIGH", "primaryOwnerId": "uuid", "secondaryOwnerId": "uuid"
}
// Response 201 — created application
```

### PUT /api/applications/:id
**SUPER_ADMIN, APP_ADMIN** | Update application
```json
// Request — any fields from create (all optional)
// Response 200 — updated application
```

### DELETE /api/applications/:id
**SUPER_ADMIN, APP_ADMIN** | Remove application
```
Response 204 No Content
```

---

## Okta Integration (`/api/okta`)
All require JWT.

### GET /api/okta/config
**SUPER_ADMIN, SSO_ADMIN** | Get Okta configuration (secrets masked with `***`)
```json
// Response 200
{
  "id", "oktaDomain": "dev-xxx.okta.com", "issuerUrl": "https://...",
  "clientId": "...", "clientSecretEnc": "***",
  "scopes": ["openid","profile","email","groups"],
  "isActive": true, "isVerified": true, "lastVerifiedAt": "...",
  "roleMappings": [{ "oktaGroupId", "oktaGroupName", "turboIamRole" }]
}
```

### POST /api/okta/config
**SUPER_ADMIN** | Create Okta configuration
```json
// Request
{
  "oktaDomain": "dev-xxx.okta.com",
  "clientId": "...", "clientSecret": "...",
  "apiToken": "...",  // optional
  "scopes": ["openid","profile","email","groups"],  // optional
  "callbackUrl": "..."  // optional override
}
```

### PATCH /api/okta/config
**SUPER_ADMIN** | Update Okta config (partial update, all fields optional)

### POST /api/okta/config/verify
**SUPER_ADMIN, SSO_ADMIN** | Test OIDC connection
```json
// Response 200
{ "verified": true, "issuer": "...", "message": "Connection successful" }
```

### POST /api/okta/config/activate
**SUPER_ADMIN** | Enable/disable SSO for enterprise
```json
// Request
{ "isActive": true }
// Response 200 — updated config
```

### GET /api/okta/role-mappings
**SA, SSO** | List Okta group → TurboIAM role mappings

### POST /api/okta/role-mappings
**SUPER_ADMIN** | Create/update a mapping
```json
// Request
{ "oktaGroupId": "00gxxx", "oktaGroupName": "Engineering", "turboIamRole": "APP_ADMIN" }
```

### DELETE /api/okta/role-mappings/:groupId
**SUPER_ADMIN** | Deactivate a mapping | 204

### GET /api/okta/applications
**SA, SSO, AA** | Live fetch from Okta Management API

### POST /api/okta/applications/sync
**SA, SSO** | Sync Okta apps into TurboIAM DB
```json
// Request (optional — sync specific apps)
{ "appIds": ["0oaxxx", "0oayyy"] }
// Response 200
{ "synced": 12, "failed": 0, "details": [...] }
```

### GET /api/okta/groups
**SA, SSO** | Live groups from Okta (for role mapping UI)

### GET /api/okta/users
**SA, SSO** | Live users from Okta

### GET /api/okta/sync-logs?limit=20
**SA, SSO, AUD** | Sync history
