# Product Requirements Document: Refrigeration Equipment Monitoring System

## 1. Overview

Polo Sanca is developing a monitoring system for refrigeration equipment deployed across multiple companies and their branch locations. The system enables real-time monitoring, maintenance tracking, and multi-tenant access control for refrigeration assets.

### 1.1 Product Vision

Provide companies with a centralized platform to monitor the health and performance of their refrigeration equipment across all branches, while giving Polo Sanca the tools to manage multiple client companies efficiently.

### 1.2 Target Users

- **Global Admins** (Polo Sanca staff): System administrators who manage companies and users
- **Company Admins**: Client company administrators who manage their organization's users
- **Company Viewers**: Client company users who monitor equipment data

## 2. User Roles and Permissions

### 2.1 Global Admin (Polo Sanca)

**Capabilities:**
- Add, update, and deactivate companies in the system
- Create, update, and delete branches across any company
- Register, update, rotate API keys for, and deactivate equipment in any branch
- Invite users to any company (as admins or viewers) or add new global admins
- View all companies, branches, users, and equipment across all tenants
- Create, edit, enable/disable, and delete generic alert rules across global, company, or equipment scopes
- Acknowledge and resolve alerts, log manual temperature readings when equipment is offline, and manage maintenance records across any company
- Export telemetry and alert history as CSV
- View system-wide audit logs (`GET /v1/audit-logs` and Global Admin UI)

### 2.2 Company Admin

**Capabilities:**
- View and manage all branches within their company (create, edit, delete unassigned branches)
- Register, update, rotate API keys for, and deactivate equipment within their company's branches
- Invite new users to their company and resend pending invitations
- Assign user roles (`company_admin` or `company_viewer`) within their company
- Configure branch-level access restrictions for viewers
- Deactivate or remove users from their company
- Manage their own company profile
- View monitoring data, export CSV reports, acknowledge/resolve alerts, log manual temperature readings during offline events, and log/edit maintenance records for their company's equipment
- View applicable alert rules in read-only mode (global rules plus rules scoped to their company/equipment)

**Restrictions:**
- Cannot access other companies' data
- Cannot create or deactivate companies
- Cannot promote users to `global_admin`
- Cannot create, modify, or delete alert rules
- Cannot view system-wide audit logs

### 2.3 Company Viewer

**Capabilities:**
- View equipment monitoring data and maintenance history for accessible branches
- View equipment status, applicable alert thresholds, and alerts
- Access monitoring dashboards and export CSV telemetry/alert reports for accessible branches
- Manage their own user profile name and password

**Access Levels:**
- **Full Access**: Can view all branches within their company
- **Branch-Restricted**: Can only view one or more specific branches assigned by a Global Admin or Company Admin

**Restrictions:**
- Read-only access to company resources (cannot manage branches, equipment, manual telemetry, maintenance records, or users)
- Cannot acknowledge or resolve alerts
- Cannot modify company settings or access other companies' data
- If branch-restricted, cannot view or export data from branches outside their assigned scope

### 2.4 RBAC Permission Matrix

| Resource / Action | Global Admin | Company Admin | Company Viewer (Full) | Company Viewer (Restricted) |
| :--- | :---: | :---: | :---: | :---: |
| **Companies**: List all / Create / Deactivate | Yes | No | No | No |
| **Companies**: View / Edit own company profile | Yes (All) | Yes (Own) | Read-only (Own) | Read-only (Own) |
| **Branches**: Create / Edit / Delete | Yes (All) | Yes (Own) | No | No |
| **Branches**: View | Yes (All) | Yes (Own) | Yes (Own) | Assigned branches only |
| **Users**: Invite / Resend / Edit role & branches / Deactivate | Yes (All + Global Admins) | Yes (Own company, non-global) | No | No |
| **Users**: View company users | Yes (All) | Yes (Own) | No | No |
| **Own Profile (`/auth/me`)**: View & update name / password | Yes | Yes | Yes | Yes |
| **Equipment**: Register / Edit / Rotate API key / Deactivate | Yes (All) | Yes (Own) | No | No |
| **Equipment & Telemetry**: View status, history & export CSV | Yes (All) | Yes (Own) | Yes (Own) | Assigned branches only |
| **Manual Telemetry Entry**: Log offline temperature reading | Yes (All) | Yes (Own) | No | No |
| **Alerts**: View alerts, statistics & export CSV | Yes (All) | Yes (Own) | Yes (Own) | Assigned branches only |
| **Alerts**: Acknowledge / Manually resolve | Yes (All) | Yes (Own) | No | No |
| **Alert Rules**: Create / Edit / Delete | Yes | No | No | No |
| **Alert Rules**: View applicable rules | Yes (All) | Read-only (Global + Own) | Read-only (Equipment view) | Read-only (Assigned equipment) |
| **Maintenance Records**: Create / Edit / Delete | Yes (All) | Yes (Own) | No | No |
| **Maintenance Records**: View history | Yes (All) | Yes (Own) | Yes (Own) | Assigned branches only |
| **Audit Logs**: View (`GET /v1/audit-logs` & UI) | Yes | No | No | No |

## 3. Core Entities

### 3.1 Company
- Company name (unique)
- Contact information (email, phone)
- Number of branches (derived)
- Total equipment count (derived)
- Status (`active`, `inactive`)
- Created / updated timestamps
- Associated users

### 3.2 Branch
- Branch name/identifier (unique per company)
- Physical address
- Company association
- Number of equipment units (derived)
- Branch manager contact (optional)

### 3.3 Equipment
- Equipment ID (UUID) and unique serial number
- Equipment type (`freezer`, `refrigerator`, `cold_room`)
- Company and Branch location (branch must belong to the same company via composite FK)
- Installation date, manufacturer, and model
- Active lifecycle flag (`is_active`, default `true` — deactivating via `DELETE /v1/equipments/{id}` sets `is_active = false`, rejecting new hardware telemetry with `403`, halting offline checks, and preserving 100% of historical telemetry, alerts, and maintenance records)
- Operational status (`operational`, `warning`, `critical`, `offline` — recomputed deterministically across ingestion, alert evaluation, manual alert resolution, and heartbeat sweeps; defaults to `offline` after **10 minutes (`600s`)** of hardware silence even if no `equipment_offline` alert rule is configured)
- Denormalized `current_data` JSONB snapshot (updated on hardware ingestion with PostgreSQL `fillfactor = 80` so 30s dashboard polling avoids hypertable joins)
- Server-generated API key (stored as a **`SHA-256` hash** at rest; plaintext returned only once upon creation or rotation)
- Last seen timestamp (`last_seen_at`, updated only by hardware telemetry)
- Last maintenance date and next scheduled maintenance date (derived/synced from maintenance logbook)

### 3.4 User
- Name
- Email (unique)
- Role (`global_admin`, `company_admin`, `company_viewer`)
- Company association (`null` for `global_admin`; required for company roles)
- Branch access restrictions (applies to `company_viewer`; admins always have full company access):
  - Access type: `full` or `restricted`
  - Assigned branches (minimum 1 branch required when `restricted`)
- Status (`active`, `inactive`, `pending`)
- Invitation token & expiration (7-day TTL while `pending`)
- Password reset token & expiration (1-hour TTL when requested)
- Last login timestamp

### 3.5 Alert Rules

Alert rules are generic threshold/duration rules created and managed by Global Admins (and viewable read-only by Company Admins for their company/equipment). No rules are pre-seeded automatically; Global Admins configure thresholds and persistence durations based on real operational needs.

**Alert Rule Properties:**
- Rule ID
- Rule name (unique) and optional description
- Rule type: `temperature_high`, `temperature_low`, `pressure_high`, `pressure_low`, `door_open`, `equipment_offline`
- Condition parameters:
  - Numeric threshold rules (`temperature_*`, `pressure_*`): require `threshold_value` (in °C or kPa), `comparison_operator` (`>`, `<`, `=`, `>=`, `<=`), and `duration_seconds`
  - State / heartbeat rules (`door_open`, `equipment_offline`): `threshold_value` and `comparison_operator` are `null`; only `duration_seconds` is required (e.g., door open continuously for `300` seconds, or no hardware telemetry received for `duration_seconds`)
- Severity: `warning`, `critical`
- Alert message template
- Created by (Global Admin)
- Assignment scope: `global` (`scope_id = null`), `company` (`scope_id = company_id`), or `equipment` (`scope_id = equipment_id`)
- Active status (`is_active`: enabled/disabled)

**Priority, Deduplication & Hysteresis Semantics:**
- Priority order is **Equipment (`1`) > Company (`2`) > Global (`3`)**, evaluated **per `(rule_type, severity)` pair**:
  - Example: An equipment-specific `(temperature_high, critical)` rule overrides company and global `(temperature_high, critical)` rules for that unit, while leaving a company `(temperature_high, warning)` rule and global `(door_open, warning)` rule active.
- Transient spikes (such as brief door openings or defrost cycles) are handled generically via `duration_seconds` without custom hardware state machines.
- **Database-Enforced Deduplication:** A PostgreSQL partial unique index on `alerts (equipment_id, alert_rule_id) WHERE status IN ('active', 'acknowledged')` guarantees at most one open alert per rule/equipment even under concurrent Celery workers, dispatching a **single email notification** to **active Company Admins + permitted active Company Viewers (respecting `UserBranchAccess`)** of the owning company.
- **Auto-Resolution Hysteresis:** Open threshold/door alerts auto-resolve only after hardware readings remain within normal bounds continuously for **60 seconds** (preventing sensor-flapping email storms). Open `equipment_offline` alerts auto-resolve immediately upon receipt of a valid hardware telemetry point.

### 3.6 Monitoring Data (Equipment Telemetry)

Monitoring data comes primarily from hardware HTTP POST requests, supplemented by admin-logged manual temperature readings when hardware is offline.

**Hardware Request Data (Fixed 7-Metric Payload):**
- `serial` - Equipment serial number (must match the authenticated `X-API-Key`'s equipment)
- `temperature` - Current temperature reading in **Celsius (°C)**
- `pressure` - Current gauge pressure reading in **kilopascals (kPa)**
- `door` - Door status (`0` = closed, `1` = open)
- `heater` - Heater/resistor status (`0` = off, `1` = on)
- `compressor` - Compressor status (`0` = off, `1` = on)
- `fan` - Fan/ventilator status (`0` = off, `1` = on)

**Manual Entry Data (Admin-Only Fallback During Offline Events):**
- `temperature` - Observed thermometer reading in **Celsius (°C)** (required)
- `recorded_at` *(optional)* - Observed timestamp (defaults to server UTC time; component/pressure fields remain `null`)
- `notes` *(optional)* - Operator/inspection note

**Stored & Server-Generated Fields:**
- `id` (`record_id`) - Server-generated UUID (included in hypertable composite PK `(time, equipment_id, id)` to prevent sub-millisecond collisions)
- `time` (`timestamp`) - Timezone-aware UTC receipt timestamp for hardware data (or `recorded_at` for manual entries)
- `source` - `'device'` (hardware ingestion) or `'manual'` (admin-entered reading)
- `recorded_by` - Nullable `user_id` (populated when `source = 'manual'`)
- `notes` - Nullable text (for manual entries)

**Data Characteristics & Export Guardrails:**
- Hardware readings use `0`/`1` integers for component states in raw time-series payloads/tables; summary status objects (`current_data` / `realtime`) expose human-readable status strings (`"open"/"closed"`, `"on"/"off"`). Numeric `0.0` values must be preserved explicitly (`is not None`).
- Manual entries (`source = 'manual'`) are included in historical charts and CSV exports for food-safety compliance, but **do not** update `equipment.last_seen_at`, `current_data`, or clear `offline` equipment status.
- **CSV Streaming & Window Caps:** CSV exports stream rows via server-side cursors; `interval=raw` telemetry exports enforce a **90-day maximum window** per download (`400 Bad Request` if exceeded), while `1hour` and `1day` aggregate exports allow up to **2 years**.
- Retention & compression: Raw data retained for 2 years in TimescaleDB (compressed after 7 days), with pre-computed hourly and daily continuous aggregates.

## 4. Key Features

### 4.1 Company Management

**For Global Admins:**
- Create and configure new companies
- View list of all companies
- Edit company information
- Deactivate/reactivate companies
- View company statistics (users, branches, equipment)

### 4.2 User Management

**For Global Admins:**
- Invite users to any company with role assignment
- Promote users to global admin
- View all users across the system
- Deactivate user accounts

**For Company Admins:**
- Invite users to their company
- Assign roles (admin or viewer) to invited users
- Configure branch access for viewers:
  - Grant full access to all branches
  - Restrict access to one or more specific branches
  - Select which branches a viewer can access (multi-select)
  - Modify branch access for existing viewers
- View list of company users
- Remove users from their company
- Change user roles within their company

### 4.3 Branch-Level Access Control

**Purpose:**
Allow company admins to limit viewer access to specific branches, enabling granular control over who can see which locations.

**Use Cases:**
- Branch managers who should only see their own location
- Regional supervisors who manage specific geographic areas
- External auditors or contractors with limited scope
- Temporary staff needing access to specific locations

**Configuration Options:**

**For Viewers:**
1. **Full Access (Default)**
   - Viewer can see all branches and equipment within the company
   - No restrictions applied

2. **Branch-Restricted Access**
   - Viewer can only see one or more selected branches (company admin chooses which ones)
   - At least one branch must be assigned for the viewer to have access
   - Multiple branches can be assigned simultaneously
   - Access can be modified at any time by company admin

**Behavior:**
- Branch-restricted viewers only see:
  - Assigned branches in branch lists/maps
  - Equipment from assigned branches
  - Alerts from assigned branches
  - Reports filtered to assigned branches
- Dashboard automatically filters to show only accessible data
- Branch selection dropdown shows only assigned branches
- System indicates if user has restricted access in user profile

**Admin Interface:**
- Checkbox/toggle: "Restrict to specific branches"
- Multi-select list of branches when restriction enabled
- Visual indicator on user list showing restricted users
- Ability to quickly add/remove branch access

### 4.4 Equipment Monitoring

**For All Authenticated Users:**
- Dashboard showing equipment status overview (auto-refreshed every **30 seconds** via HTTP polling)
- Near-real-time monitoring data display:
  - Temperature readings (°C)
  - Pressure readings (kPa)
  - Door status (open/closed indicator)
  - Heater/resistor status (on/off indicator)
  - Compressor status (on/off indicator)
  - Fan/ventilator status (on/off indicator)
- Equipment status indicators (`operational`, `warning`, `critical`, `offline`)
- Alert notifications for equipment issues
- Historical data and trends with time-series charts (distinguishing hardware `'device'` readings from `'manual'` offline entries)
- CSV export of historical telemetry (`GET /v1/equipments/{equipment_id}/telemetry/export`)
- Equipment location grouping (by branch), last hardware update timestamp (`last_seen_at`), and `last_maintenance_date` / `next_maintenance_date`

**For Global Admins and Company Admins (Offline Fallback):**
- Manual temperature entry (`POST /v1/equipments/{equipment_id}/telemetry/manual`) when equipment is `offline`, recording observed temperature (°C), optional timestamp/notes, `source = 'manual'`, and `recorded_by = user_id` while keeping equipment status `offline` until hardware resumes reporting

**Filtering and Views:**
- Filter by branch (respects branch-level access restrictions)
- Filter by equipment status
- Filter by equipment type
- Search by equipment ID or serial number
- Date range selector for historical data and CSV exports

**Note:** Branch-restricted viewers automatically see and export only equipment data from their assigned branches.

### 4.5 Branch Management

**For Global Admins and Company Admins:**
- Add new branches (Global Admins specify target company; Company Admins create within their own company)
- Edit branch information
- Delete branches (only after reassigning equipment and resolving any single-branch restricted viewers)
- Register and assign equipment to branches

**For All Company Users:**
- View branch locations (filtered by branch access if restricted)
- View equipment per branch (filtered by branch access if restricted)

### 4.6 Alerts and Notifications

**v1 Alert Types & Delivery:**
- Temperature threshold alerts (`temperature_high`, `temperature_low`)
- Pressure threshold alerts (`pressure_high`, `pressure_low`)
- Door open duration alerts (`door_open`)
- Equipment offline heartbeat alerts (`equipment_offline`, evaluated by periodic 60s background check)
- **Notification Delivery (Lean v1):**
  - In-app dashboard alert feed and active alert counters (polled every 30 seconds)
  - **Single email notification** dispatched asynchronously (with Celery retry/backoff) when a new alert transitions to `active`, sent to **active Company Admins + permitted active Company Viewers (filtered by `UserBranchAccess`)** of the owning company
- **CSV Export:** Streamed CSV export of filtered alert history (`GET /v1/alerts/export`)

**Future Enhancements (Phase 2+):**
- Smart anomaly detection, configurable notification preferences, and critical alert escalations (see Section 8)

**Note:** Branch-restricted viewers only see, receive, and export alerts for equipment in their assigned branches.

### 4.7 Alert Rule Configuration & Visibility

**For Global Admins (Full CRUD):**

**Create Alert Rules:**
- Define rule name and description
- Select generic rule type (`temperature_high`, `temperature_low`, `pressure_high`, `pressure_low`, `door_open`, `equipment_offline`)
- Set threshold values and comparison operators (required for numeric rules; `null` for `door_open` and `equipment_offline`)
- Configure persistence duration (`duration_seconds`) — handles transient spikes such as brief door openings or defrost cycles without custom state machines
- Set severity level (`warning`, `critical`)
- Customize alert message template
- Enable/disable rule (no rules are pre-seeded automatically)

**Assign Alert Rules:**
- **Global assignment**: Apply rule to all equipment across all companies (`scope = global`, `scope_id = null`)
- **Company-specific**: Apply rule to all equipment in a specific company (`scope = company`, `scope_id = company_id`)
- **Equipment-specific**: Apply rule to an individual equipment unit (`scope = equipment`, `scope_id = equipment_id`)
- View which rules are assigned to each scope

**Manage Rules:**
- List all alert rules with filtering
- Edit existing rules
- Enable/disable rules without deletion
- Delete rules (with confirmation showing affected equipment count)
- View rule trigger history and statistics

**For Company Admins (Read-Only Visibility):**
- View global rules and rules assigned to their company or its equipment (`GET /v1/alert-rules` and `GET /v1/equipments/{equipment_id}/alert-rules`)

**Rule Priority (per `(rule_type, severity)` pair):**
1. Equipment-specific rules (highest priority)
2. Company-specific rules
3. Global rules (lowest priority)

**Use Cases:**
- Configure tailored temperature/duration thresholds for specific equipment units
- Set stricter company-wide rules for high-value clients
- Allow Company Admins to inspect which thresholds apply to their equipment without modifying global policy

### 4.8 Maintenance Tracking

- Simple per-equipment maintenance logbook: log, view, edit, and delete maintenance records (write access restricted to Global Admins and owning Company Admins; technician name recorded in `performed_by`)
- Automatically sync and display `last_maintenance_date` and `next_maintenance_date` on the Equipment UI
- View maintenance history per equipment (filtered by branch access for restricted viewers)
- *(Note: Temporary `maintenance-mode` alert muting and automated maintenance reminder emails are deferred to Phase 2 — see Section 8.3.)*

### 4.9 Data Ingestion API & Background Evaluation

**Purpose:**
Receive monitoring data from refrigeration hardware via HTTP POST requests (plus admin manual offline fallback) and evaluate alert rules asynchronously.

**Hardware Endpoint Specification:**
- Method: HTTP POST (`/v1/equipments/telemetry`)
- Authentication: Equipment-specific API key (`X-API-Key` header, verified against stored `SHA-256` hash)
- Content-Type: `application/json` or `application/x-www-form-urlencoded`

**Hardware Request Payload (Fixed 7 Metrics):**
```
serial: [Equipment serial number]
temperature: [Temperature value in Celsius (°C)]
pressure: [Gauge pressure value in kilopascals (kPa)]
door: [Door status: 0=closed, 1=open]
heater: [Heater status: 0=off, 1=on]
compressor: [Compressor status: 0=off, 1=on]
fan: [Fan status: 0=off, 1=on]
```

**Server Processing (Hardware Ingestion):**
1. Require `X-API-Key` header (`401` if missing) and validate all 7 required payload fields (`400` if missing/malformed)
2. Look up equipment by `serial` (`404` if unknown) and verify constant-time match of `SHA-256(X-API-Key)` against stored hash (`401` if invalid)
3. Verify `equipment.is_active == true` and owning company is `active` (`403` if company/equipment is deactivated)
4. Capture timezone-aware server UTC receipt timestamp (`time`), generate UUID `record_id`, and tag `source = 'device'`
5. Persist telemetry point in TimescaleDB hypertable, update `equipment.last_seen_at` and denormalized `equipment.current_data` JSONB snapshot, auto-resolve any open `equipment_offline` alert, and deterministically recompute `equipment.status` (immediately transitioning `offline` → `operational` when no active alerts remain)
6. Enqueue asynchronous Celery alert rule evaluation task
7. Return `200 OK` with `{success, message, timestamp, record_id}`

**Manual Offline Entry (`POST /v1/equipments/{equipment_id}/telemetry/manual`):**
- Authenticated via JWT (Global Admin or owning Company Admin) when equipment status is `offline`
- Persists `temperature` (°C), optional `recorded_at` (defaults to server UTC) and `notes`, with `source = 'manual'` and `recorded_by = user_id` (`pressure` and component state columns `null`)
- Keeps `equipment.status = 'offline'` and does **not** update `equipment.last_seen_at` or `equipment.current_data`

**Background Alert & Heartbeat Evaluation (Celery Worker + Beat):**
1. **Threshold & Door Evaluation** (triggered on hardware ingestion and periodic 60s sweep for active equipment):
   - Resolve effective active rules per `(rule_type, severity)` in priority order (`equipment` → `company` → `global`)
   - Verify condition has persisted across telemetry readings for `duration_seconds`
   - Insert `Alert` protected by the partial unique index `uq_open_alert_per_rule`, recompute `equipment.status`, and dispatch a single email notification to active Company Admins and permitted Company Viewers
   - Auto-resolve `active`/`acknowledged` threshold/door alerts once hardware readings remain within normal bounds continuously for **60 seconds** (recomputing `equipment.status`)
2. **Offline Heartbeat Monitor** (Celery Beat every 60s across `is_active = true` equipment):
   - Default dashboard badge timeout: transition `equipment.status` to `offline` when `now() - last_seen_at >= 600s` (10 minutes), even if no `equipment_offline` alert rule is configured
   - Alert rule evaluation: if an active `equipment_offline` rule applies (resolved by `equipment` → `company` → `global` priority) and `now() - last_seen_at >= duration_seconds`, transition `equipment.status` to `offline`, create an `equipment_offline` alert, and send a single email notification.

**Response:**
- Success: HTTP 200 with confirmation message, timestamp, and `record_id`
- Error: HTTP 400 (validation) / 401 (auth) / 403 (inactive tenant) / 404 (unknown serial) / 429 (rate limit) / 500 (server error)

**Security Considerations:**
- API key authentication required (`X-API-Key`), stored as `SHA-256` hash at rest, rotatable via admin API
- Rate limiting per equipment (12 req/min)
- Strict input validation and numeric range bounds
- Structured ingestion and error logging

## 5. User Flows

### 5.1 User Login, Token Refresh, Logout, and Password Reset Flow

1. User navigates to login page and enters email and password (`POST /v1/auth/login`)
2. System validates credentials (rate-limited to mitigate brute force) and checks `user.status == active`
3. If valid:
   - System generates JWT `access_token` (1h TTL) and `refresh_token` (30d TTL)
   - System updates `last_login_at` timestamp
   - User is redirected to dashboard
4. If invalid:
   - System returns `401` error message
   - User can retry or initiate password reset (`POST /v1/auth/forgot-password` → email reset token → `POST /v1/auth/reset-password`)
5. User accesses protected resources with `access_token`
6. When `access_token` expires, client calls `POST /v1/auth/refresh` with `refresh_token` to obtain a new `access_token`
7. User logs out (`POST /v1/auth/logout`):
   - Server revokes token JTI in Redis blocklist until natural expiration; client clears stored tokens
   - User is redirected to login page

### 5.2 Company Onboarding Flow

1. Global admin creates new company (`POST /v1/companies`)
2. Global admin invites first company admin user (`POST /v1/users/invite`)
3. Company admin receives invitation email (token valid for 7 days)
4. Company admin redeems token and sets password (`POST /v1/users/accept-invitation`), activating their account, and logs in
5. Company admin (or Global admin) adds branches (`POST /v1/branches`)
6. Global admin or company admin registers equipment in branches (`POST /v1/equipments`)
7. Company admin invites additional users (`company_admin` or `company_viewer`)

### 5.3 Equipment Registration Flow

**Scenario: Adding new equipment to a branch**

1. Global admin or company admin navigates to equipment management
2. Admin clicks "Add Equipment" button
3. Admin fills in equipment details:
   - Serial number
   - Equipment type (`freezer`, `refrigerator`, `cold_room`)
   - Manufacturer and model
   - Branch assignment (must belong to admin's company)
   - Installation date (optional)
4. Admin saves configuration (`POST /v1/equipments`)
5. System validates serial uniqueness and branch ownership, then generates a cryptographically secure API key (storing only its `SHA-256` hash at rest)
6. Equipment is created with initial status `offline` and returned once with the plaintext `api_key`
7. Admin configures physical equipment with the API key and server endpoint (and can rotate the key later via `POST /v1/equipments/{id}/rotate-api-key` if compromised)
8. Equipment begins sending telemetry data
9. Equipment transitions immediately to `operational` once valid hardware telemetry is received

### 5.4 Equipment Monitoring Flow

1. User logs in
2. User sees dashboard with equipment overview (filtered to assigned branches if restricted viewer), auto-refreshing every 30 seconds via HTTP polling
3. User filters by branch, equipment type, or status
4. User clicks on equipment to see latest readings, applicable alert thresholds, maintenance dates, and historical charts (or exports telemetry as CSV)
5. User views temperature/pressure trends, component states, and alerts
6. If user is a Global Admin or Company Admin, they can acknowledge/resolve alerts, log maintenance records, or enter manual temperature readings when the unit is `offline`

### 5.5 User Invitation Flow

1. Admin (Global or Company) enters new user name, email, role, and optional viewer branch restrictions (`POST /v1/users/invite`)
2. System creates user with `status = pending`, generates a single-use 7-day invitation token, and sends invitation email
3. If the link expires, an Admin can trigger `POST /v1/users/{user_id}/resend-invitation` to issue a fresh 7-day token
4. New user clicks invitation link and submits their chosen password (`POST /v1/users/accept-invitation`)
5. System hashes password, transitions `status` from `pending` to `active`, clears invitation token, and grants access to dashboards

### 5.6 Branch Access Restriction Flow

**Scenario: Company admin restricting a viewer to specific branches**

1. Company admin (or Global admin) navigates to user management
2. Admin selects existing viewer or invites a new viewer
3. Admin enables "Restrict to specific branches" option (`branch_access.type = "restricted"`)
4. Admin selects one or more branches from their company's branch list
5. Admin saves configuration
6. System validates that all branch IDs belong to the user's company and at least one branch is selected
7. System updates `user_branch_access` mappings
8. Viewer logs in and sees only branches, equipment, telemetry, CSV exports, alerts, and maintenance records from their assigned branches

**Scenario: Modifying branch access**

1. Admin navigates to user management and selects a viewer
2. Admin adds/removes branches or switches `branch_access.type` to `"full"`
3. Admin saves changes (`PATCH /v1/users/{user_id}`)
4. Viewer's effective permissions update immediately on the next API request

### 5.7 Alert Management Flow

**Scenario: User viewing and responding to alerts**

1. When an alert transitions to `active`, the background worker sends a single email notification and surfaces the alert in the dashboard feed (polled every 30s)
2. User clicks on alerts section (`GET /v1/alerts`)
3. System displays alerts filtered by user's permissions:
   - Branch-restricted viewers only see alerts from their assigned branches
   - Company users see alerts from their company
   - Global admins see all alerts across tenants
4. User filters alerts by severity (`warning`, `critical`), status (`active`, `acknowledged`, `resolved`), date range, branch, or equipment, and can export the filtered list as CSV (`GET /v1/alerts/export`)
5. User clicks on a specific alert (`GET /v1/alerts/{alert_id}`) to view equipment info, current readings vs threshold, duration, and context
6. If user is an Admin (Global or Company), they can:
   - Acknowledge the alert with action notes (`POST /v1/alerts/{alert_id}/acknowledge`)
   - Manually resolve the alert if addressed out-of-band (`POST /v1/alerts/{alert_id}/resolve`)
7. When hardware readings return to normal, the background evaluator automatically resolves active/acknowledged alerts

### 5.8 Alert Rule Configuration Flow

**Scenario: Creating and assigning alert rules (Global Admin)**

1. Global admin navigates to alert rule management and clicks "Create Alert Rule"
2. Admin configures rule parameters:
   - Rule name and description
   - Rule type (`temperature_high`, `temperature_low`, `pressure_high`, `pressure_low`, `door_open`, `equipment_offline`)
   - Threshold value and comparison operator (`>`, `<`, `>=`, `<=`, `=`) for numeric rules (`null` for `door_open` and `equipment_offline`)
   - Duration (`duration_seconds` condition must persist)
   - Severity level (`warning`, `critical`) and custom message template
3. Admin selects assignment scope (`global`, `company` + `company_id`, or `equipment` + `equipment_id`) and active state
4. Admin saves configuration (`POST /v1/alert-rules`); system validates parameters and activates rule
5. Global Admin can view trigger statistics (`GET /v1/alert-rules/{rule_id}/statistics`), edit, disable, or delete rules
6. Company Admins can view applicable rules in read-only mode (`GET /v1/alert-rules` and `GET /v1/equipments/{equipment_id}/alert-rules`)

**Scenario: Handling rule priority**

1. Equipment sends temperature reading of 9°C sustained across `duration_seconds` (e.g., 300s)
2. System checks applicable `(temperature_high, critical)` rules in order:
   - Equipment-specific rule: temperature > 7°C (MATCHES — highest priority, selected)
   - Company-specific rule: temperature > 8°C (shadowed for `(temperature_high, critical)`)
   - Global rule: temperature > 10°C (shadowed for `(temperature_high, critical)`)
3. System generates a single alert based on the highest-priority rule for that `(rule_type, severity)` pair and dispatches a single email notification

### 5.9 Equipment Data Ingestion & Manual Fallback Flow

**Scenario: Equipment sending monitoring data**

1. Equipment collects the 7 sensor metrics (`serial`, `temperature` in °C, `pressure` in kPa, `door`, `heater`, `compressor`, `fan`)
2. Equipment sends `POST /v1/equipments/telemetry` (`application/json` or `application/x-www-form-urlencoded`) with `X-API-Key` header
3. Server validates `X-API-Key` presence, required payload fields, equipment `serial` existence, `SHA-256` API key match, and active company status
4. Server captures UTC receipt timestamp, stores telemetry (`source = 'device'`) in TimescaleDB hypertable, updates `equipment.last_seen_at`, and transitions `offline` equipment to `operational` (if no active alerts exist)
5. Server returns `200 OK` to equipment and enqueues background Celery rule evaluation
6. Background worker evaluates applicable generic alert rules (`duration_seconds`) and triggers/auto-resolves alerts as needed

**Error & Offline Fallback Scenarios:**
- **Missing fields / malformed payload**: Server returns `400 Bad Request`
- **Missing or invalid `X-API-Key`**: Server returns `401 Unauthorized`
- **Unknown serial number**: Server returns `404 Not Found`
- **Extended hardware / network outage**: Periodic 60s heartbeat check marks equipment `offline`; Global Admins or owning Company Admins can log manual thermometer checks via `POST /v1/equipments/{equipment_id}/telemetry/manual` (`source = 'manual'`, keeping status `offline` until hardware reports again)

### 5.10 Branch Management Flow

**Scenario: Admin creating and managing branches**

1. Company admin or Global admin navigates to branch management and clicks "Add Branch"
2. Admin fills in branch name, physical address, and optional branch manager contact (`POST /v1/branches`)
3. System validates branch uniqueness within the company and creates the branch
4. Admin can register/reassign equipment to the branch, assign branch-restricted viewers, edit branch details, or filter dashboards by branch

**Scenario: Editing or deleting a branch**

1. Admin selects an existing branch to update (`PATCH /v1/branches/{branch_id}`) or delete (`DELETE /v1/branches/{branch_id}`)
2. Before deleting a branch, the system enforces two guards:
   - **Assigned equipment check**: Deletion is blocked (`409 Conflict`) if any equipment is still assigned to the branch; admin must reassign or deactivate equipment first
   - **Orphaned restricted-viewer check**: Deletion is blocked (`409 Conflict`) if any `restricted` viewer has *only* this branch assigned; admin must assign another branch, switch the viewer to `full` access, or deactivate the viewer first (if a viewer has multiple branches, removing this branch simply removes that mapping)
3. Once preconditions pass and admin confirms, the branch is deleted

### 5.11 Maintenance Logbook Flow

**Scenario: Logging maintenance activity**

1. Admin (Global Admin or Company Admin) navigates to equipment details and clicks "Log Maintenance" (`POST /v1/equipments/{equipment_id}/maintenance-records`)
2. Admin enters:
   - Maintenance type (`routine_inspection`, `repair`, `part_replacement`, `emergency_fix`)
   - Description of work performed
   - Technician name (`performed_by` string — records the internal or third-party technician who performed the work)
   - Optional notes and `next_maintenance_date`
3. System saves the maintenance record and updates `equipment.last_maintenance_date` and `equipment.next_maintenance_date` displayed on the Equipment UI
4. All permitted users (including Viewers for accessible branches) can view the equipment's maintenance history (`GET /v1/equipments/{equipment_id}/maintenance-records`), and Admins can update or delete records (`PATCH`/`DELETE /v1/maintenance-records/{record_id}`)

## 6. Technical Considerations

### 6.1 Multi-tenancy

- Strict data isolation between companies
- Role-based access control (RBAC) across all routes
- Branch-level access control (`user_branch_access`) for `company_viewer`
- Efficient query filtering for branch-restricted users

### 6.2 Near-Real-Time Monitoring

- Hardware sends telemetry via HTTP POST (`POST /v1/equipments/telemetry`)
- Dashboard updates every **30 seconds** via HTTP polling (`GET /v1/telemetry/realtime` and `GET /v1/alerts`) backed by a denormalized `current_data` JSONB snapshot on `equipments` (`fillfactor = 80`) — avoiding hypertable joins on every poll
- Offline detection runs every 60 seconds via Celery Beat: units silent for **>= 10 minutes (`600s`)** flip `equipment.status` to `offline` on the dashboard by default, while `equipment_offline` alerts + emails fire according to configured `equipment_offline` rules
- Admin manual temperature logging (`source = 'manual'`) covers compliance tracking during prolonged equipment connectivity loss

### 6.3 Data Storage

**Time-Series Data (TimescaleDB Hypertable — `telemetry`):**
- Composite key `(time, equipment_id, id)` with UUID `id` (`record_id`), timezone-aware `time` (UTC), `equipment_id`, and `temperature` (°C, `NOT NULL`)
- Hardware metrics (`pressure` in kPa, `door`, `heater`, `compressor`, `fan` as `0`/`1` — nullable when `source = 'manual'`)
- Provenance metadata: `source` (`'device'` or `'manual'`), `recorded_by` (nullable `user_id`), and `notes` (nullable text)
- Automatic 1-day chunk partitioning on `time`
- Compression policy: compress chunks older than **7 days** (segmented by `equipment_id`, ordered by `time DESC`)
- Retention policy: retain raw telemetry for **2 years**, with continuous aggregates (`telemetry_hourly`, `telemetry_daily`) for long-term charts and multi-month CSV exports

**Relational Data (PostgreSQL):**
- Companies, branches (`UNIQUE (id, company_id)`), equipment (`is_active` soft-deactivation flag, `SHA-256` hashed API keys, `last_seen_at`, `current_data` JSONB snapshot with `fillfactor = 80`, `last_maintenance_date`, `next_maintenance_date` — no destructive `delete-orphan` cascades onto historical records), and users
- User permissions and branch access mappings (`user_branch_access`), enforced via centralized query-scoping helpers
- Generic alert rules per scope (`global`, `company`, `equipment`), plus partial unique index `uq_open_alert_per_rule` on `alerts (equipment_id, alert_rule_id) WHERE status IN ('active', 'acknowledged')`

**Logs and History:**
- Alert history, acknowledgments, and manual/auto resolutions
- Equipment maintenance logbook (`maintenance_records`)
- Immutable administrative audit logs (`audit_logs`), exposed to Global Admins via `GET /v1/audit-logs` and the Global Admin UI
- Structured ingestion & error logs

### 6.4 Security

**User Authentication:**
- JWT access tokens (1h TTL) + refresh tokens (30d TTL) with Redis JTI revocation blocklist on logout/deactivation
- Single-use, expiring tokens for user invitations (7-day TTL) and password resets (1-hour TTL)
- Audit logging for all administrative mutations (`audit_logs`)

**Equipment API Security:**
- Per-equipment API keys (`X-API-Key`), generated server-side, stored as a **`SHA-256` hash** at rest, returned in plaintext only once on creation/rotation, and rotatable on demand
- Constant-time key hash verification paired with `serial` ownership and `is_active` check
- Per-equipment rate limiting (12 req/min) to prevent abuse
- Strict schema validation and numeric range bounds

**Data Transmission:**
- HTTPS/TLS 1.2+ encryption required for all web, API, and equipment telemetry traffic
- Environment-based secret management (zero hardcoded production credentials)

### 6.5 Scalability

- Multi-tenant support across dozens of companies and thousands of equipment units
- Denormalized `current_data` snapshot on `equipments` keeps 30s dashboard polling O(N_equipments) without scanning `telemetry` chunks
- Asynchronous rule evaluation and single-email alert delivery (with retry/backoff) via Celery workers
- Streamed CSV exports (`yield_per` server-side cursors) capped at **90 days** for `interval=raw` and **2 years** for `1hour`/`1day` aggregates

### 6.6 Backend Architecture

**Technology Stack:**
- **Framework**: Flask 3.x (Python 3.10+)
- **API Design**: RESTful API following OpenAPI 3.0 specification (`/v1/` prefix)
- **Database**:
  - **PostgreSQL 14+** with **TimescaleDB extension**
  - **Relational tables**: `companies`, `branches`, `users`, `user_branch_access`, `equipments`, `alert_rules`, `alerts`, `maintenance_records`, `audit_logs`
  - **Time-series hypertables**: `telemetry` (with `telemetry_hourly` and `telemetry_daily` continuous aggregates)
- **Authentication**:
  - User JWTs via `Flask-JWT-Extended` (with Redis blocklist)
  - Equipment API Key authentication (`X-API-Key` verified via `SHA-256` hash)
- **Background Tasks**: `Celery` + `Celery Beat` with **Redis** as message broker and result backend
  - Event-driven and periodic (60s) generic alert rule evaluation (with 60s normal-reading hysteresis before auto-resolution)
  - Periodic (60s) equipment offline heartbeat detection (10-minute default `offline` badge + rule-based `equipment_offline` alerts)
  - Async single-email alert dispatch (`Flask-Mail` with automatic task retry/exponential backoff)
- **Validation**: `Marshmallow` schemas for all request bodies and query parameters
- **Database ORM & Migrations**: `SQLAlchemy 2.x` + `Flask-Migrate` (`Alembic`)
- **Rate Limiting**: `Flask-Limiter` backed by Redis
- **Logging & Monitoring**: Structured JSON logging and deep `/health` readiness endpoint verifying PostgreSQL (`SELECT 1`) and Redis (`PING`) connectivity

**Security:**
- Explicit CORS allowlist in production
- Rate limiting via `Flask-Limiter` (especially on `/v1/auth/*` and `/v1/equipments/telemetry`)
- Input validation and sanitization via Marshmallow
- SQL injection prevention via SQLAlchemy parameterized queries
- Password hashing with `bcrypt`; equipment API keys hashed with `SHA-256`

**Testing & Quality:**
- Unit, integration, and end-to-end API flow tests via `pytest` + `pytest-flask` + `pytest-cov` (note: test fixtures in `tests/conftest.py` store `SHA-256` hashed equipment API keys while passing plaintext keys in test `X-API-Key` headers)
- Formatting & linting: `black`, `flake8`, `mypy`

**Deployment:**
- WSGI server: `Gunicorn` behind `Nginx`
- Containers: `Docker` + `Docker Compose` (Flask API, Celery Worker, Celery Beat, TimescaleDB, Redis)

### 6.7 Frontend Architecture

**Technology Stack:**
- **Framework**: React 19 + Vite
- **State Management**: React Context API (auth state, tenant/branch filter context)
- **API Integration**: Axios with JWT request/refresh interceptors (`VITE_API_URL` environment configuration)
- **Live Data Refresh**: 30-second HTTP polling (`GET /v1/telemetry/realtime` and `GET /v1/alerts`)
- **UI Components**: Ant Design (`antd`) configured with the built-in Brazilian Portuguese (`ptBR`) locale provider
- **Charts/Visualization**: `Recharts` for time-series temperature, pressure, and component-state charts
- **Routing**: `react-router-dom` for SPA navigation and role-protected routes (including Global Admin Audit Logs view)

**Language & Units (Lean v1):**
- **Language**: Brazilian Portuguese (`pt-BR`) only in v1 (multi-language `en-US` via `react-i18next` deferred to Phase 2)
- **Units**: Celsius (`°C`) for temperature and kilopascals (`kPa`) for pressure only in v1 (`°F` conversion toggle deferred to Phase 2)

**Responsive Design:**
- Desktop-first approach for control-room monitoring
- Tablet-friendly views (768px+) for on-site managers and maintenance staff
- Breakpoints: Desktop (1920px), Laptop (1366px), Tablet (768px)

**Performance Considerations:**
- Code splitting for faster initial load
- Lazy loading for route-based components
- Virtualization for large lists (equipment, alerts)
- Debounced search and filter operations
- Memoization for expensive calculations

**Accessibility:**
- WCAG 2.1 Level AA compliance
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support
- Focus management for modals and dialogs

## 7. Success Metrics

- Number of companies onboarded
- Number of equipment units monitored
- Alert response time
- User engagement (logins, dashboard views)
- Equipment uptime percentage
- Maintenance completion rate

## 8. Future Work (Phase 2+)

To keep the v1 MVP lean and focused on operational delivery for Polo Sanca, the following capabilities are intentionally deferred to Phase 2+:

### 8.1 Smart Anomaly Detection Alerts

**Overview:**
Explore statistical and machine-learning anomaly detection to identify unusual equipment behavior patterns without manual threshold configuration once sufficient historical telemetry (30+ days per unit) has been collected.

**Domain Anomaly Candidates:**
1. **Temperature anomalies**: Gradual temperature drift, unexpected spikes/drops, or slower pull-down recovery after door openings
2. **Component behavior anomalies**: Short-cycling compressors, unusually long fan runs, or irregular heater activation
3. **Usage pattern anomalies**: Door openings at unusual hours or frequencies
4. **Performance degradation**: Declining cooling efficiency or lengthening recovery times over months
5. **Multi-variable anomalies**: Correlated symptoms across metrics (e.g., rising temperature with low compressor activity)

**Planned Iterative Rollout (Exploratory):**
- **Phase 2.1**: Rolling statistical baselines (mean + standard deviation / z-scores per equipment)
- **Phase 2.2**: Single-metric outlier models (e.g., Isolation Forest) with Global Admin sensitivity controls and false-positive feedback
- **Phase 2.3**: Multi-variate pattern detection and post-maintenance baseline reset triggers

### 8.2 Real-Time WebSockets (`Flask-SocketIO`)

- Push live `telemetry:update`, `alert:created`, and `alert:resolved` events over authenticated `Flask-SocketIO` rooms (replacing or supplementing v1's 30-second HTTP polling).

### 8.3 Maintenance Mode Alert Suppression & Scheduled Maintenance Reminders

- Temporary per-equipment **Maintenance Mode** (`maintenance_until` window via `POST /v1/equipments/{equipment_id}/maintenance-mode`) allowing Admins to mute threshold/door alerts while technicians service or restock a unit.
- Cross-equipment upcoming/overdue maintenance dashboard (`GET /v1/maintenance-records/upcoming`) and automated daily scheduled reminder emails before/after `next_maintenance_date`.

### 8.4 Configurable Notification Preferences & Critical Alert Escalations

- Per-user notification preference toggles (in-app vs. email, severity filters) and notification cooldown windows.
- Multi-tier escalation timers (e.g., secondary email, SMS, or phone voice alert if a `critical` alert remains unacknowledged past SLA).

### 8.5 Multi-Language Internationalization (`en-US`) & Unit Switching

- Secondary English (`en-US`) localization via `react-i18next` alongside `pt-BR`.
- User-selectable display units (`°F` temperature conversion, `psi`/`bar` pressure conversion) persisted on user profiles.

### 8.6 Offline Hardware Batch Ingestion, PDF Reports, Webhooks & External Integrations

- Buffered hardware batch ingestion (`POST /v1/equipments/telemetry/batch` with device-side `recorded_at` timestamps) for controllers with local flash queues.
- Formatted PDF compliance reports (supplementing v1 CSV exports).
- Outbound tenant webhooks for alert/offline events and bi-directional integration with external ERP, CRM, or CMMS platforms, plus native mobile apps (iOS/Android).

## 9. Resolved Product & Architecture Decisions (v1 MVP)

All product, domain, and architectural open points for v1 have been resolved in favor of a lean, pragmatic MVP:

1. **Roles & Permissions:** Keep the **3 existing roles** (`global_admin`, `company_admin`, `company_viewer`). No separate `technician` user role—Global Admins and Company Admins log maintenance records and record the technician's name in the `performed_by` string. Branch restrictions apply exclusively to `company_viewer`.
2. **Company Admin Scope:** Company Admins have full CRUD over branches, equipment (including API key rotation), user invitations/viewer branch restrictions, alert acknowledgment/resolution, manual offline temperature entry, and maintenance records within their company, plus **read-only visibility** into applicable alert rules (`global` + own `company`/`equipment`). Rule creation/editing remains Global Admin only.
3. **Branch Deletion Safety:** Deleting a branch returns `409 Conflict` if equipment is still assigned OR if any `restricted` viewer is assigned *only* to that branch.
4. **Hardware Telemetry Contract:** Hardware ingestion (`POST /v1/equipments/telemetry`, supporting both `application/json` and `application/x-www-form-urlencoded`) strictly uses the **7 fixed hardware fields** (`serial`, `temperature` in °C, `pressure` in kPa, `door`, `heater`, `compressor`, `fan`) with server-captured UTC timestamps (`source = 'device'`). Hardware `recorded_at` and batch ingestion are deferred to Phase 2.
5. **Generic Alert Rules:** Alert rules remain **100% generic** (`rule_type`, nullable `threshold_value` & `comparison_operator` for `door_open`/`equipment_offline`, `duration_seconds`, `severity`, `scope`, `scope_id`). No rules are pre-seeded, and no custom defrost state-machine or `equipment_type` rule filter is needed—`duration_seconds` absorbs transient spikes in practice. Override priority (`equipment` > `company` > `global`) applies per `(rule_type, severity)` pair.
6. **Manual Offline Telemetry & Streamed CSV Exports:** Included in v1. Global Admins and owning Company Admins can log manual thermometer readings (`POST /v1/equipments/{equipment_id}/telemetry/manual`) when a unit is `offline` (`source = 'manual'`, `recorded_by = user_id`), keeping `equipment.status = 'offline'` until hardware reports again. Permitted users can stream CSV exports for telemetry (`GET /v1/equipments/{equipment_id}/telemetry/export` — capped at **90 days** for `interval=raw` and up to **2 years** for `1hour`/`1day` aggregates) and alerts (`GET /v1/alerts/export`).
7. **Lean Maintenance Logbook:** Included in v1 as a per-equipment maintenance logbook (`maintenance_records`) that syncs `last_maintenance_date` and `next_maintenance_date` on the Equipment UI. Maintenance-mode alert muting and reminder emails are deferred to Phase 2.
8. **Alert Notifications, Deduplication & Hysteresis:** In-app dashboard alerts + a **single email** sent to **active Company Admins + permitted active Company Viewers (respecting `UserBranchAccess`)** when an alert transitions to `active`, protected against concurrent worker duplicates by a partial unique index (`uq_open_alert_per_rule`). Open threshold/door alerts require **60 seconds of sustained normal hardware readings** before auto-resolving to prevent flapping email storms.
9. **Dashboard Live Updates, Default Offline Timeout & Background Workers:** Dashboard uses **30-second HTTP polling** backed by a denormalized `current_data` JSONB snapshot on `equipments` (WebSockets deferred to Phase 2). Backend retains **`Celery` + `Celery Beat` + `Redis`** for asynchronous rule evaluation, periodic 60s offline checks (**10-minute default silence timeout** flips `equipment.status` to `offline` even without a rule; `equipment_offline` alerts/emails require an active rule), async email sending with retry/backoff, JWT JTI revocation blocklist, and `Flask-Limiter` rate limiting.
10. **Language, Units & Frontend Stack:** v1 is **Brazilian Portuguese (`pt-BR`)** and **Celsius (`°C`) + `kPa`** only, built on **React 19 + Vite + Context API + Axios + Ant Design (`antd` `ptBR`) + Recharts**.
11. **Standalone Boundary & Auditability:** v1 runs standalone without external ERP/CMMS integrations. Administrative mutations are recorded in PostgreSQL `audit_logs` and exposed to Global Admins via **`GET /v1/audit-logs` and a Global Admin Audit Log UI page**.
12. **Equipment API Key Security & Non-Destructive Deactivation:** Equipment `X-API-Key` secrets are stored as **`SHA-256` hashes** at rest, returned in plaintext only once upon creation (`POST /v1/equipments`) or rotation (`POST /v1/equipments/{equipment_id}/rotate-api-key`). Deactivating equipment (`DELETE /v1/equipments/{equipment_id}`) sets `is_active = false` (blocking new telemetry with `403` and stopping offline sweeps) without deleting historical telemetry, alerts, or maintenance logs.

## 10. Non-Functional Requirements

### 10.1 Performance
- Dashboard initial load time < 2 seconds (p95)
- Dashboard live data refresh <= 30 seconds via HTTP polling (`GET /v1/telemetry/realtime` and `GET /v1/alerts`)
- Support 100+ concurrent web users and 1,000+ reporting equipment units

### 10.2 Availability & Disaster Recovery
- 99.9% uptime SLA
- Automated daily PostgreSQL/TimescaleDB backups with point-in-time recovery (PITR) and tested restore procedures
- Scheduled maintenance windows communicated in advance

### 10.3 Usability
- Intuitive Brazilian Portuguese (`pt-BR`) interface requiring minimal training
- Responsive design for desktop and tablet
- Accessibility compliance (WCAG 2.1 Level AA)

### 10.4 Compliance (LGPD & Auditability)
- **LGPD compliance (mandatory for Brazilian operations)** and GDPR readiness:
  - Explicit legal basis and privacy notice for user account PII (name, email, IP address in audit logs)
  - **Soft-deactivation & PII anonymization:** Deactivating a user sets `status = inactive` and revokes active tokens; permanent erasure requests anonymize personal identifiers (`name`, `email`) while preserving user UUID references on historical alert acknowledgments, maintenance logs, and `audit_logs`
  - Tenant offboarding procedure for exporting or purging company data upon contract termination
- Immutable audit trail (`audit_logs`) for all administrative, authentication, and permission changes, inspectable by Global Admins via `GET /v1/audit-logs`

## 11. API Overview & Contract Reference

> **Single Source of Truth:** Exact request/response schemas, query parameters, authentication headers, and HTTP status codes are defined canonically in [`openapi.yaml`](./openapi.yaml) (viewable via [`api-docs.html`](./api-docs.html)). Do not duplicate JSON wire payloads in this document.

### 11.1 Versioning, Naming & Rate Limits

- **Base Path & Versioning:** All routes are prefixed with `/v1/` (breaking changes increment major version with a 12-month deprecation window; missing version prefix returns `404`).
- **Naming Conventions:** Plural lowercase hyphenated nouns for collections (`/users`, `/companies`, `/branches`, `/equipments`, `/alerts`, `/alert-rules`, `/maintenance-records`, `/audit-logs`) and `snake_case` JSON keys.
- **Authentication:**
  - **Users:** `Authorization: Bearer <jwt>` (`1h` access token; `30d` refresh token on `POST /v1/auth/refresh`; Redis JTI blocklist on logout/deactivation).
  - **Equipment Hardware:** `X-API-Key: <equipment_api_key>` (verified in constant time against stored `SHA-256` hash).
- **Rate Limits (`Flask-Limiter` + Redis):**
  - `POST /v1/auth/login`, `POST /v1/auth/forgot-password`: 10 req/min per IP
  - `POST /v1/equipments/telemetry`: 12 req/min per equipment
  - Authenticated user calls: 100 req/min per user (`1000` req/min for Global Admin)

### 11.2 v1 Endpoint Index

| Domain | Method & Path | Auth / Permitted Roles | Summary |
| :--- | :--- | :--- | :--- |
| **Auth & Profile** | `POST /v1/auth/login` | Public | Authenticate active user; returns `access_token`, `refresh_token`, `user` |
| | `POST /v1/auth/refresh` | JWT Refresh | Issue new `access_token` |
| | `POST /v1/auth/logout` | JWT (All) | Revoke current token JTI in Redis |
| | `GET, PATCH /v1/auth/me` | JWT (All) | View own profile/branch scope; update own `name` |
| | `POST /v1/auth/change-password` | JWT (All) | Change own password (`current_password` + `new_password`) |
| | `POST /v1/auth/forgot-password` | Public | Send 1-hour password reset email (enumeration-safe `200`) |
| | `POST /v1/auth/reset-password` | Public (Reset Token) | Redeem 1-hour reset token and set new password |
| **Users** | `GET /v1/users` | Global / Company Admin | List users (scoped to own company for Company Admin) |
| | `POST /v1/users/invite` | Global / Company Admin | Create `pending` user and send 7-day invitation email |
| | `POST /v1/users/accept-invitation` | Public (Invite Token) | Redeem 7-day invite token, set password, activate account |
| | `POST /v1/users/{user_id}/resend-invitation` | Global / Company Admin | Issue fresh 7-day token and resend invite |
| | `GET, PATCH, DELETE /v1/users/{user_id}` | Global / Company Admin | View, update role/branches/status, or soft-deactivate/anonymize user |
| **Companies** | `GET, POST /v1/companies` | Global Admin | List all companies; create new company |
| | `GET /v1/companies/{company_id}` | Global Admin / Own Company | View company profile |
| | `PATCH /v1/companies/{company_id}` | Global / Own Company Admin | Update company profile (`status` changes Global Admin only) |
| **Branches** | `GET /v1/branches`, `GET /v1/branches/{branch_id}` | JWT (Scoped) | List/view branches (filtered by `UserBranchAccess` for restricted viewers) |
| | `POST, PATCH, DELETE /v1/branches*` | Global / Own Company Admin | Create, update, or delete branch (`409` if equipment or single-branch viewer attached) |
| **Equipment** | `GET /v1/equipments`, `GET /v1/equipments/{equipment_id}` | JWT (Scoped) | List (`"equipment"` key) or view equipment, status, and maintenance dates |
| | `POST /v1/equipments` | Global / Own Company Admin | Register equipment; returns plaintext `api_key` once (stores `SHA-256` hash) |
| | `PATCH, DELETE /v1/equipments/{equipment_id}` | Global / Own Company Admin | Update metadata/branch or deactivate equipment |
| | `POST /v1/equipments/{equipment_id}/rotate-api-key` | Global / Own Company Admin | Rotate equipment API key and return new plaintext key once |
| **Telemetry** | `POST /v1/equipments/telemetry` | `X-API-Key` | Ingest 7-metric hardware reading (JSON or form-urlencoded; optional `Idempotency-Key` / `request_id` deduplication); returns `200` |
| | `POST /v1/equipments/{equipment_id}/telemetry/manual` | Global / Own Company Admin | Log manual temperature (`source="manual"`) while unit is `offline` (`409` if online); returns `201` with `record_id` |
| | `GET /v1/equipments/{equipment_id}/telemetry` | JWT (Scoped) | Query historical telemetry (`"count"`, `"data"`, `"next_page_token"`, `"pagination"`) |
| | `GET /v1/equipments/{equipment_id}/telemetry/export` | JWT (Scoped) | Export historical telemetry as `text/csv` |
| | `GET /v1/telemetry/realtime` | JWT (Scoped) | Latest equipment snapshot for 30s dashboard HTTP polling |
| **Alerts** | `GET /v1/alerts`, `GET /v1/alerts/{alert_id}` | JWT (Scoped) | List or inspect alerts |
| | `GET /v1/alerts/statistics`, `GET /v1/alerts/export` | JWT (Scoped) | Active alert counts or `text/csv` alert export |
| | `POST /v1/alerts/{alert_id}/acknowledge`, `.../resolve` | Global / Own Company Admin | Acknowledge (with notes) or manually resolve alert |
| **Alert Rules** | `GET /v1/alert-rules`, `GET /v1/alert-rules/{rule_id}` | Global / Company Admin | List/view rules (Company Admin read-only for `global` + own scopes) |
| | `POST, PATCH, DELETE /v1/alert-rules*` | Global Admin | Create (`201`), update (`200`), or delete (`204`) generic alert rules |
| | `GET /v1/alert-rules/{rule_id}/statistics` | Global Admin | Rule trigger statistics |
| | `GET /v1/equipments/{equipment_id}/alert-rules` | JWT (Scoped) | Applicable rules ordered by `(rule_type, severity)` priority |
| **Maintenance** | `GET /v1/equipments/{equipment_id}/maintenance-records` | JWT (Scoped) | Paginated maintenance logbook for an equipment unit |
| | `POST /v1/equipments/{equipment_id}/maintenance-records` | Global / Own Company Admin | Log maintenance record and sync equipment maintenance dates |
| | `GET /v1/maintenance-records/{record_id}` | JWT (Scoped) | View specific maintenance record |
| | `PATCH, DELETE /v1/maintenance-records/{record_id}` | Global / Own Company Admin | Update or delete maintenance record |
| **Audit Logs** | `GET /v1/audit-logs` | Global Admin | Query immutable administrative audit trail (keyset `page_token` + offset pagination) |
