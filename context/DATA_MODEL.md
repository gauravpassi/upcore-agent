# TurboIAM Data Models

> Compact Prisma schema reference. Read this INSTEAD of schema.prisma.
<!-- AUTO-MAINTENANCE: Update this file when... -->
<!-- - Running `prisma migrate dev` (new/changed fields) -->
<!-- - Adding new models or enums -->
<!-- - Changing relations or indexes -->

Schema file: `turbo-backend/prisma/schema.prisma`

---

## Enums

```
UserRole:          SUPER_ADMIN | GRC_ADMIN | APP_ADMIN | SSO_ADMIN | AUDITOR | DELEGATE
Environment:       DEV | STAGING | PROD
OnboardingStatus:  NOT_STARTED | PENDING | IN_PROGRESS | APPROVED | REJECTED
SSOPlatform:       OKTA
SSOProtocol:       SAML | OIDC
ApprovalStageType: TECHNICAL | SECURITY | BUSINESS | EXECUTIVE
ApprovalStatus:    PENDING | APPROVED | REJECTED | REVISION_REQUESTED
RiskClassification: LOW | MEDIUM | HIGH | CRITICAL
AssessmentStatus:  DRAFT | SUBMITTED | APPROVED | REJECTED | REVISION_REQUESTED
QuestionType:      TEXT | SINGLE_CHOICE | MULTI_CHOICE | SCALE | BOOLEAN
NotificationType:  SSO_SUBMITTED | SSO_APPROVED | SSO_REJECTED | SSO_REVISION |
                   RISK_SUBMITTED | RISK_APPROVED | RISK_REJECTED |
                   DELEGATION_RECEIVED | CERT_EXPIRING | SYSTEM
AuthMethod:        EMAIL_PASSWORD | OKTA_SSO
OktaSyncType:      APPLICATIONS | USERS | GROUPS
SyncStatus:        RUNNING | COMPLETED | FAILED | PARTIAL
```

---

## Core Identity

### Enterprise
```
id: String (uuid) PK
name: String
domain: String UNIQUE           ← used to look up Okta config by email domain
plan: String default("enterprise")
isActive: Boolean default(true)
createdAt, updatedAt: DateTime
→ users[], applications[], ssoConfigs[], riskQuestions[], auditLogs[]
→ teamContacts[], oktaConfig? (1:1 EnterpriseOktaConfig)
Table: enterprises
```

### User
```
id: String (uuid) PK
enterpriseId: String FK→Enterprise
email: String                   UNIQUE([enterpriseId, email])
passwordHash: String?           null for SSO-provisioned users
firstName, lastName: String
role: UserRole
avatarUrl: String?
isActive: Boolean default(true)
lastLoginAt: DateTime?
authMethod: AuthMethod default(EMAIL_PASSWORD)
oktaUserId: String?             Okta sub claim
oktaLogin: String?              Okta login (usually email)
createdAt, updatedAt: DateTime
Indexes: [enterpriseId, oktaUserId], [oktaLogin]
Table: users
```

---

## Applications

### Application
```
id: String (uuid) PK
enterpriseId: String FK→Enterprise
name: String
applicationId: String           UNIQUE([enterpriseId, applicationId])
description: String?
businessFunction: String?
riskLevel: RiskClassification?  enum (LOW|MEDIUM|HIGH|CRITICAL)
platform: String?               e.g., "salesforce", "okta", "azure"
ssoStatus: OnboardingStatus default(NOT_STARTED)
igaStatus: OnboardingStatus default(NOT_STARTED)
primaryOwnerId: String? FK→User
secondaryOwnerId: String? FK→User
createdAt, updatedAt: DateTime
→ instances[], delegations[], assessments[]
Table: applications
```

### ApplicationInstance
```
id: String (uuid) PK
applicationId: String FK→Application (cascade delete)
name: String
environment: Environment default(PROD)
ssoStatus, igaStatus: OnboardingStatus default(NOT_STARTED)
ownerId: String? FK→User
createdAt, updatedAt: DateTime
→ ssoConfigs[]
Table: application_instances
```

### ApplicationDelegation
```
id: String (uuid) PK
applicationId: String FK→Application
delegatorId: String FK→User
delegateId: String FK→User
reason, justification: String
expiresAt: DateTime
isActive: Boolean default(true)
createdAt: DateTime
Table: application_delegations
```

---

## SSO

### SSOConfiguration
```
id: String (uuid) PK
applicationId: String? FK→Application (nullable — top-level or instance-level)
instanceId: String? FK→ApplicationInstance
enterpriseId: String FK→Enterprise
platform: SSOPlatform            OKTA only (MVP)
protocol: SSOProtocol            SAML | OIDC
status: OnboardingStatus default(PENDING)
submittedAt, approvedAt: DateTime?
createdAt, updatedAt: DateTime
→ samlConfig?, oidcConfig?, certificates[], workflow?
Table: sso_configurations
```

### SAMLConfig (1:1 → SSOConfiguration)
```
entityId, acsUrl: String
nameIdFormat: String
metadataUrl?, metadataXml?: String
attributeMappings: Json default({})
Table: saml_configs
```

### OIDCConfig (1:1 → SSOConfiguration)
```
clientId, clientSecret: String
redirectUris: String[]
scopes: String[]
responseType: String default("code")
pkceEnabled: Boolean default(true)
discoveryEndpoint?: String
Table: oidc_configs
```

### ApprovalWorkflow (1:1 → SSOConfiguration)
```
currentStage: ApprovalStageType
status: ApprovalStatus default(PENDING)
riskTriggered: Boolean default(false)
→ stages[]
Table: approval_workflows
```

---

## Okta Integration

### EnterpriseOktaConfig (1:1 → Enterprise)
```
id: String (uuid) PK
enterpriseId: String UNIQUE FK→Enterprise
oktaDomain: String              e.g., "dev-12345.okta.com"
issuerUrl: String               "https://{oktaDomain}/oauth2/default"
clientId: String
clientSecretEnc: String         AES-256-GCM encrypted ciphertext (hex)
clientSecretIv: String          AES-GCM IV (hex)
apiTokenEnc?: String            optional, encrypted
apiTokenIv?: String
scopes: String[] default(["openid","profile","email","groups"])
callbackUrl?: String            null = use default
isActive: Boolean default(false)   must explicitly activate
isVerified: Boolean default(false) set true after successful test
lastVerifiedAt, lastSyncAt: DateTime?
configuredById?: String FK→User
→ roleMappings[], syncLogs[]
Table: enterprise_okta_configs
```

### OktaRoleMapping
```
id: String (uuid) PK
oktaConfigId: String FK→EnterpriseOktaConfig
enterpriseId: String            denormalized for query perf
oktaGroupId: String             UNIQUE([oktaConfigId, oktaGroupId])
oktaGroupName: String
turboIamRole: UserRole
isActive: Boolean default(true)
Table: okta_role_mappings
```

### OktaSyncLog
```
id: String (uuid) PK
oktaConfigId: String FK→EnterpriseOktaConfig
enterpriseId: String            denormalized
syncType: OktaSyncType
status: SyncStatus
itemsSynced, itemsFailed: Int default(0)
errorMessage?: String
details: Json default({})
startedAt, completedAt?: DateTime
Indexes: [enterpriseId, startedAt], [oktaConfigId, startedAt]
Table: okta_sync_logs
```

---

## Risk & Compliance

### RiskQuestion
```
id, enterpriseId, category: String
questionText: String
questionType: QuestionType default(SINGLE_CHOICE)
options: Json default([])
weight: Float default(1.0)
isRequired: Boolean default(true), isVisible: Boolean default(true)
sortOrder: Int default(0)
→ answers[]
Table: risk_questions
```

### RiskAssessment
```
id, applicationId, enterpriseId, submittedById: String
status: AssessmentStatus default(DRAFT)
riskScore?: Float
riskClassification?: RiskClassification
reviewedById?: String
reviewComments?: String
submittedAt?, reviewedAt?: DateTime
→ answers[]
Table: risk_assessments
```

---

## Audit & Notifications

### AuditLog
```
id, userId?, enterpriseId: String
action, entityType: String          e.g., "CREATE_USER", "User"
entityId?: String
details: Json default({})
ipAddress?, userAgent?: String
timestamp: DateTime
Indexes: [enterpriseId, timestamp], [userId, timestamp], [entityType, entityId]
Table: audit_logs
```

### Notification
```
id, userId: String FK→User (cascade)
type: NotificationType
title, message: String
isRead: Boolean default(false)
relatedEntityType?, relatedEntityId?: String
createdAt: DateTime
Index: [userId, isRead]
Table: notifications
```
