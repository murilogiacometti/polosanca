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
- Add new companies to the system
- Invite users to any company (as admins or viewers)
- Add new global admins
- View all companies and their equipment
- Configure alert rules and thresholds for equipment
- Assign alert rules to companies or individual equipment
- Manage system-wide settings
- Access company data across all tenants

### 2.2 Company Admin

**Capabilities:**
- View all equipment within their company (across all branches)
- Invite new users to their company
- Assign user roles (admin or viewer) within their company
- Configure branch-level access restrictions for viewers
- Manage company profile and settings
- Remove users from their company
- View monitoring data and alerts for their equipment

**Restrictions:**
- Cannot access other companies' data
- Cannot create new companies
- Cannot promote users to global admin

### 2.3 Company Viewer

**Capabilities:**
- View equipment monitoring data for their company
- View equipment status and alerts
- Access monitoring dashboards and reports

**Access Levels:**
- **Full Access**: Can view all branches within their company
- **Branch-Restricted**: Can only view one or more specific branches assigned by company admin

**Restrictions:**
- Cannot invite or manage users
- Cannot modify company settings
- Cannot access other companies' data
- If branch-restricted, cannot view data from branches outside their assigned scope

## 3. Core Entities

### 3.1 Company
- Company name
- Contact information
- Number of branches
- Total equipment count
- Status (active/inactive)
- Created date
- Associated users

### 3.2 Branch
- Branch name/identifier
- Physical address
- Company association
- Number of equipment units
- Branch manager contact (optional)

### 3.3 Equipment
- Equipment ID/serial number
- Equipment type (freezer, refrigerator, cold room, etc.)
- Branch location
- Installation date
- Manufacturer and model
- Status (operational, warning, critical, offline)
- Last maintenance date
- Next scheduled maintenance

### 3.4 User
- Name
- Email
- Role (global admin, company admin, company viewer)
- Company association (if applicable)
- Branch access restrictions (for viewers only)
  - Access type: Full or Branch-Restricted
  - Assigned branches (if branch-restricted)
- Status (active/inactive/pending)
- Last login

### 3.5 Alert Rules

Alert rules are configured by Global Admins to define when alerts should be triggered based on monitoring data.

**Alert Rule Properties:**
- Rule ID
- Rule name
- Rule type: temperature_high, temperature_low, pressure_high, pressure_low, door_open, equipment_offline
- Condition parameters:
  - Threshold value (e.g., temperature > 8°C)
  - Duration (e.g., condition must persist for 5 minutes)
  - Comparison operator (>, <, =, ≥, ≤)
- Severity: warning, critical
- Alert message template
- Created by (Global Admin)
- Assignment scope: global, company-specific, or equipment-specific
- Active status (enabled/disabled)

**Assignment:**
- Global rules apply to all equipment by default
- Company-specific rules override global rules for that company
- Equipment-specific rules override both global and company rules
- Multiple rules can be active simultaneously

### 3.6 Monitoring Data (Equipment Telemetry)

Equipment sends monitoring data via HTTP POST requests to the server with the following data points:

**Request Data:**
- `serial` - Equipment serial number/identifier (links to Equipment entity)
- `temperature` - Current temperature reading (in Celsius)
- `pressure` - Current pressure reading
- `door` - Door status (open/closed)
- `heater` - Heater/resistor status (on/off)
- `compressor` - Compressor status (on/off)
- `fan` - Fan/ventilator status (on/off)

**Server-Generated Data:**
- Timestamp (date and time) - Captured when server receives the data
- Record ID - Unique identifier for each data point

**Data Characteristics:**
- Time-series data stored for historical analysis
- Frequency: Configurable (e.g., every 5 minutes, 15 minutes, etc.)
- Retention period: Configurable based on company needs
- Used for real-time monitoring, alerts, and trend analysis

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
- Dashboard showing equipment status overview
- Real-time monitoring data display:
  - Temperature readings (°C)
  - Pressure readings
  - Door status (open/closed indicator)
  - Heater/resistor status (on/off indicator)
  - Compressor status (on/off indicator)
  - Fan/ventilator status (on/off indicator)
- Equipment status indicators (operational, warning, critical, offline)
- Alert notifications for equipment issues
- Historical data and trends with time-series charts
- Equipment location mapping (by branch)
- Last update timestamp for each equipment

**Filtering and Views:**
- Filter by branch (respects branch-level access restrictions)
- Filter by equipment status
- Filter by equipment type
- Search by equipment ID or serial number
- Date range selector for historical data

**Note:** Branch-restricted viewers automatically see only equipment from their assigned branches.

### 4.5 Branch Management

**For Company Admins:**
- Add new branches
- Edit branch information
- View equipment by branch
- Assign equipment to branches

**For All Company Users:**
- View branch locations (filtered by branch access if restricted)
- View equipment per branch (filtered by branch access if restricted)

### 4.6 Alerts and Notifications

**Current Alert Types:**
- Temperature threshold alerts (filtered by branch access for restricted viewers)
- Pressure threshold alerts (filtered by branch access for restricted viewers)
- Door open alerts (filtered by branch access for restricted viewers)
- Equipment offline alerts (filtered by branch access for restricted viewers)
- Maintenance due notifications (filtered by branch access for restricted viewers)
- Critical status notifications (filtered by branch access for restricted viewers)
- Configurable notification preferences (email, in-app)

**Future Enhancement (Phase 2):**
- Smart anomaly detection alerts that identify unusual patterns automatically
- Predictive failure warnings based on performance degradation trends
- See Section 8.1 for detailed anomaly detection specifications

**Note:** Branch-restricted viewers only receive alerts for equipment in their assigned branches.

### 4.7 Alert Rule Configuration

**For Global Admins:**

**Create Alert Rules:**
- Define rule name and description
- Select rule type (temperature_high, temperature_low, pressure_high, pressure_low, door_open, equipment_offline)
- Set threshold values and comparison operators
- Configure duration/persistence requirements
- Set severity level (warning, critical)
- Customize alert message template
- Enable/disable rule

**Assign Alert Rules:**
- **Global assignment**: Apply rule to all equipment across all companies
- **Company-specific**: Apply rule to all equipment in a specific company
- **Equipment-specific**: Apply rule to individual equipment units
- View which rules are assigned to each scope

**Manage Rules:**
- List all alert rules with filtering
- Edit existing rules
- Enable/disable rules without deletion
- Delete rules (with confirmation if actively assigned)
- View rule trigger history and statistics

**Rule Priority:**
1. Equipment-specific rules (highest priority)
2. Company-specific rules
3. Global rules (lowest priority)

**Use Cases:**
- Set different temperature thresholds for freezers vs refrigerators
- Configure stricter rules for specific high-value clients
- Create custom rules for equipment with special requirements
- Temporarily disable rules during maintenance windows

### 4.8 Maintenance Tracking

- Log maintenance activities
- Schedule maintenance
- Maintenance history per equipment
- Maintenance due dashboard

### 4.9 Data Ingestion API

**Purpose:**
Receive monitoring data from equipment via HTTP POST requests.

**Endpoint Specification:**
- Method: HTTP POST
- Authentication: Equipment-specific token or API key
- Content-Type: application/x-www-form-urlencoded or application/json

**Request Payload:**
```
serial: [Equipment serial number]
temperature: [Temperature value in Celsius]
pressure: [Pressure value]
door: [Door status: 0=closed, 1=open]
heater: [Heater status: 0=off, 1=on]
compressor: [Compressor status: 0=off, 1=on]
fan: [Fan status: 0=off, 1=on]
```

**Server Processing:**
1. Validate equipment serial number exists in system
2. Verify equipment belongs to an active company
3. Capture server timestamp (date and time)
4. Store data in time-series database
5. Update equipment last-seen timestamp
6. Evaluate configured alert rules against new data:
   - Check equipment-specific rules first
   - Then company-specific rules
   - Finally global rules
   - Apply duration/persistence requirements
7. Trigger alerts and notifications if rule conditions met
8. Return success/error response to equipment

**Response:**
- Success: HTTP 200 with confirmation message
- Error: HTTP 400/401/500 with error details

**Error Handling:**
- Invalid/unknown serial number
- Missing required fields
- Malformed data
- Database write failures
- Equipment not associated with any company

**Security Considerations:**
- API authentication required
- Rate limiting per equipment
- Input validation and sanitization
- Logging of all ingestion attempts

## 5. User Flows

### 5.1 User Login and Authentication Flow

1. User navigates to login page
2. User enters email and password
3. System validates credentials
4. If valid:
   - System generates JWT access token and refresh token
   - System updates user's last login timestamp
   - User is redirected to dashboard
5. If invalid:
   - System returns error message
   - User can retry or use password reset
6. User accesses protected resources with access token
7. When token expires, system uses refresh token to get new access token
8. User logs out:
   - System invalidates session (token removed client-side)
   - User is redirected to login page

### 5.2 Company Onboarding Flow

1. Global admin creates new company
2. Global admin adds first company admin user
3. Company admin receives invitation email
4. Company admin sets password and logs in
5. Company admin adds branches
6. Global admin or company admin adds equipment to branches
7. Company admin invites additional users (admins/viewers)

### 5.3 Equipment Registration Flow

**Scenario: Adding new equipment to a branch**

1. Global admin or company admin navigates to equipment management
2. Admin clicks "Add Equipment" button
3. Admin fills in equipment details:
   - Serial number
   - Equipment type (freezer, refrigerator, cold room, etc.)
   - Manufacturer and model
   - Branch assignment
   - Installation date
4. System generates unique API key for equipment
5. Admin saves equipment configuration
6. System validates serial number is unique
7. Equipment is created and appears in equipment list
8. Admin receives API key and configuration details
9. Admin configures physical equipment with API key and server endpoint
10. Equipment begins sending telemetry data
11. Equipment appears as "operational" on dashboard once first data is received

### 5.4 Equipment Monitoring Flow

1. User logs in
2. User sees dashboard with equipment overview
3. User filters by branch or status
4. User clicks on equipment to see details
5. User views temperature trends and alerts
6. User acknowledges alerts (if admin)

### 5.5 User Invitation Flow

1. Admin (global or company) enters new user email and role
2. System sends invitation email
3. New user clicks invitation link
4. New user creates password and completes profile
5. New user gains access to appropriate dashboards

### 5.6 Branch Access Restriction Flow

**Scenario: Company admin restricting a viewer to specific branches**

1. Company admin navigates to user management
2. Admin selects existing viewer or creates new viewer
3. Admin enables "Restrict to specific branches" option
4. Admin selects one or more branches from multi-select list (e.g., "Downtown Branch", "Airport Branch", and "Harbor Branch")
5. Admin saves configuration
6. System validates at least one branch is selected
7. System updates user permissions
8. Viewer logs in and sees only equipment/data from their assigned branches
9. Viewer's dashboard, alerts, and reports automatically filter to show only the assigned branches

**Scenario: Modifying branch access**

1. Company admin navigates to user management
2. Admin clicks on branch-restricted viewer
3. Admin adds or removes branches from assignment
4. Admin saves changes
5. Viewer's access updates immediately on next page load/refresh

### 5.7 Alert Management Flow

**Scenario: User viewing and responding to alerts**

1. User logs in and sees alert badge/notification on dashboard
2. User clicks on alerts section
3. System displays list of active alerts filtered by user's permissions:
   - Branch-restricted viewers only see alerts from their assigned branches
   - Company users see alerts from their company
   - Global admins see all alerts
4. User filters alerts by:
   - Severity (warning, critical)
   - Status (active, acknowledged, resolved)
   - Date range
   - Branch or equipment
5. User clicks on specific alert to view details:
   - Equipment information
   - Alert type and severity
   - Current readings vs threshold
   - Timestamp and duration
   - Historical context
6. If user is admin, they can acknowledge alert:
   - Add notes about action taken
   - Mark alert as acknowledged
   - System records who acknowledged and when
7. User can view alert history and trends
8. When issue is resolved (equipment readings return to normal):
   - System automatically marks alert as resolved
   - Notification sent to users who acknowledged it

### 5.8 Alert Rule Configuration Flow (Global Admin)

**Scenario: Creating and assigning alert rules**

1. Global admin navigates to alert rule management
2. Admin clicks "Create Alert Rule"
3. Admin configures rule parameters:
   - Rule name and description
   - Rule type (temperature_high, temperature_low, pressure_high, pressure_low, door_open, equipment_offline)
   - Threshold value
   - Comparison operator (>, <, ≥, ≤, =)
   - Duration (how long condition must persist)
   - Severity level (warning, critical)
   - Custom message template
4. Admin selects assignment scope:
   - **Option A - Global**: Rule applies to all equipment across all companies
   - **Option B - Company-specific**: Admin selects one or more companies
   - **Option C - Equipment-specific**: Admin selects specific equipment units
5. Admin enables/disables rule
6. Admin saves configuration
7. System validates rule parameters
8. Rule is activated and begins monitoring:
   - Equipment sends telemetry data
   - System evaluates rules in priority order (equipment → company → global)
   - When condition is met for specified duration, alert is triggered
9. Admin can view rule statistics:
   - How many times rule has triggered
   - Which equipment is affected most
   - Average trigger frequency
10. Admin can edit or disable rules:
    - Modify thresholds or parameters
    - Temporarily disable during maintenance
    - Delete rule with confirmation

**Scenario: Handling rule priority**

1. Equipment sends temperature reading of 9°C
2. System checks applicable rules in order:
   - Equipment-specific rule: temperature > 7°C (MATCHES - triggers alert)
   - Company-specific rule: temperature > 8°C (would match but lower priority)
   - Global rule: temperature > 10°C (does not match)
3. System generates alert based on highest priority matching rule
4. Alert is sent to relevant users based on branch access permissions

### 5.9 Equipment Data Ingestion Flow

**Scenario: Equipment sending monitoring data**

1. Equipment collects sensor readings (temperature, pressure, door status, etc.)
2. Equipment prepares HTTP POST request with monitoring data
3. Equipment sends POST request to server endpoint with:
   - Serial number
   - Temperature reading
   - Pressure reading
   - Door status
   - Heater status
   - Compressor status
   - Fan status
4. Server receives request and validates equipment serial number
5. Server verifies equipment belongs to active company
6. Server captures timestamp and stores data in time-series database
7. Server evaluates alert rules against new data
8. If temperature exceeds threshold or equipment goes offline:
   - System generates alert
   - System sends notifications to relevant users (filtered by branch access)
9. Server returns success response to equipment
10. Dashboard automatically updates for users viewing that equipment (real-time or near-real-time)
11. Historical data charts update with new data point

**Error Scenarios:**
- **Unknown serial number**: Server returns 400 error, equipment logs failure
- **Network failure**: Equipment retries after interval (with exponential backoff)
- **Server timeout**: Equipment queues data and attempts resend

### 5.10 Branch Management Flow

**Scenario: Company admin creating and managing branches**

1. Company admin logs in and navigates to branch management
2. Admin clicks "Add Branch" button
3. Admin fills in branch details:
   - Branch name
   - Physical address
   - Branch manager contact (optional)
4. Admin saves branch configuration
5. System validates branch information
6. Branch is created and appears in branch list
7. Admin can now:
   - Assign equipment to the new branch
   - Assign users with branch-restricted access to this branch
   - View equipment count per branch
   - Edit branch information
   - View all equipment at this branch location
8. Admin can filter dashboard views by branch
9. When viewing branch details:
   - See list of equipment at branch
   - See branch-restricted users assigned to this branch
   - View aggregate statistics (total equipment, active alerts, etc.)

**Scenario: Editing or deactivating a branch**

1. Company admin selects existing branch
2. Admin can update branch information
3. If deleting/deactivating branch:
   - System checks for assigned equipment
   - System warns if equipment will be orphaned
   - System checks for branch-restricted users with only this branch
   - Admin must reassign equipment before deletion
   - Admin confirms deletion
4. Branch is removed from system

### 5.11 Maintenance Logging Flow

**Scenario: Logging maintenance activity for equipment**

1. User (admin or technician) navigates to equipment details
2. User clicks "Log Maintenance" button
3. User fills in maintenance details:
   - Maintenance type (routine inspection, repair, part replacement, emergency fix)
   - Description of work performed
   - Technician name
   - Parts replaced (if any)
   - Notes and observations
   - Next scheduled maintenance date
   - Maintenance duration
4. User saves maintenance record
5. System timestamps the maintenance activity
6. System updates equipment's "last maintenance date"
7. System updates equipment's "next scheduled maintenance"
8. Maintenance record appears in equipment history
9. System may temporarily suppress alerts during maintenance (if configured)
10. User can view maintenance history:
    - See all past maintenance activities
    - Filter by maintenance type
    - View maintenance frequency
    - Track maintenance costs (if tracked)
11. Dashboard shows equipment with upcoming maintenance due dates
12. System can send notifications when maintenance is approaching or overdue

**Scenario: Scheduled maintenance notification**

1. System checks daily for equipment with upcoming maintenance
2. When maintenance is due within 7 days:
   - System generates maintenance reminder
   - Notification sent to company admins
   - Equipment flagged on dashboard as "maintenance due"
3. When maintenance becomes overdue:
   - Severity escalates to warning
   - More frequent notifications sent
   - Equipment status may show "maintenance overdue"
4. After maintenance is logged:
   - Notifications are cleared
   - Next maintenance date is set
   - Equipment returns to normal status

## 6. Technical Considerations

### 6.1 Multi-tenancy

- Data isolation between companies
- Role-based access control (RBAC)
- Branch-level access control for granular permissions
- Tenant-specific configurations
- Efficient query filtering for branch-restricted users

### 6.2 Real-time Monitoring

- Equipment sends data via HTTP POST at configurable intervals
- Dashboard updates via WebSocket or polling for live data display
- Data refresh intervals configurable per equipment or globally
- Offline detection based on last-seen timestamp (e.g., no data received in 2x expected interval)
- Handling of intermittent connectivity from equipment

### 6.3 Data Storage

**Time-Series Data:**
- Temperature readings (timestamp, value)
- Pressure readings (timestamp, value)
- Component status over time (door, heater, compressor, fan)
- Optimized for range queries and aggregations
- Data retention policies (e.g., full resolution for 30 days, aggregated for 1 year)

**Relational Data:**
- Companies, branches, equipment, users
- Equipment configuration and metadata
- User permissions and branch access mappings
- Alert rules and thresholds per equipment

**Logs and History:**
- Alert history and acknowledgments
- Maintenance records
- User activity audit logs
- Data ingestion logs (for debugging)

### 6.4 Security

**User Authentication:**
- Authentication and authorization for web users
- Secure invitation token system
- Session management
- Audit logging for admin actions

**Equipment API Security:**
- Equipment authentication via API keys or tokens
- Per-equipment credentials for data ingestion endpoint
- Rate limiting to prevent abuse or DoS
- Input validation and sanitization
- Protection against data injection attacks

**Data Transmission:**
- HTTPS/TLS encryption for all communications
- Encrypted data transmission between equipment and server
- Secure storage of API credentials

### 6.5 Scalability

- Support for multiple companies
- Support for hundreds of equipment units per company
- Efficient data querying and aggregation

### 6.6 Backend Architecture

**Technology Stack:**
- **Framework**: Flask (Python 3.10+)
- **API Design**: RESTful API following OpenAPI 3.0 specification
- **Database**:
  - **PostgreSQL 14+** with **TimescaleDB extension**
  - **Relational tables**: companies, users, equipment, branches, alert rules
  - **Time-series hypertables**: telemetry data (temperature, pressure, component status)
  - **Benefits**:
    - Single database for both relational and time-series data
    - Standard SQL with seamless JOINs across data types
    - Automatic time-based partitioning (chunking)
    - Continuous aggregates for pre-computed statistics
    - Built-in compression for older data
    - Data retention policies
- **Authentication**:
  - JWT (JSON Web Tokens) via Flask-JWT-Extended
  - API Key authentication for equipment
- **Real-time Communication**: Flask-SocketIO for WebSocket support
- **Background Tasks**: Celery with Redis/RabbitMQ for async processing
  - Alert rule evaluation
  - Email notifications
  - Data aggregation jobs
- **API Documentation**:
  - Swagger/OpenAPI via flask-swagger-ui or flasgger
  - Auto-generated from code
- **Validation**: marshmallow or pydantic for request/response validation
- **Database ORM**: SQLAlchemy
- **Migrations**: Alembic for database schema migrations
- **Caching**: Redis for session management and caching
- **Logging**: Python logging with structured logs (JSON format)
- **Monitoring**:
  - Application metrics via Prometheus
  - Error tracking via Sentry (optional)

**Security:**
- CORS configuration for frontend access
- Rate limiting via Flask-Limiter
- Input validation and sanitization
- SQL injection prevention via ORM
- Password hashing with bcrypt
- Environment-based configuration (no hardcoded secrets)

**Testing:**
- Unit tests: pytest
- Integration tests: pytest with test database
- API tests: pytest with Flask test client
- Code coverage: pytest-cov

**Development Tools:**
- Virtual environment: venv or poetry
- Code formatting: black, isort
- Linting: pylint or flake8
- Type checking: mypy (optional)

**Deployment Considerations:**
- WSGI server: Gunicorn or uWSGI
- Reverse proxy: Nginx
- Container: Docker
- Orchestration: Docker Compose or Kubernetes
- Environment: Development, Staging, Production

### 6.7 Frontend Architecture

**Technology Stack:**
- **Framework**: React (latest stable version)
- **State Management**: Context API or Redux (TBD based on complexity)
- **API Integration**: Axios or Fetch API with JWT authentication
- **Real-time Updates**: WebSocket client or polling mechanism
- **UI Components**: Ant Design (antd)
  - Comprehensive component library
  - Built-in internationalization support (pt-BR and en-US)
  - Enterprise-grade design system
  - Table, Form, Modal, and Dashboard components
  - Responsive grid system
  - Theme customization support
- **Charts/Visualization**: Chart.js, Recharts, or D3.js for telemetry data
- **Routing**: React Router for SPA navigation

**Internationalization (i18n):**
- **Library**: react-i18next or react-intl
- **Supported Languages**:
  - Portuguese (Brazil) - Primary
  - English - Secondary
- **Translation Coverage**:
  - All UI text, labels, and messages
  - Error messages and validation feedback
  - Alert notifications and email templates
  - Dashboard titles and descriptions
  - Form placeholders and help text
- **Language Selection**:
  - User preference stored in profile
  - Browser language detection as default
  - Language switcher in user menu
  - Persisted across sessions
- **Number and Date Formatting**:
  - Locale-aware number formatting (decimals, thousands separators)
  - Date/time formatting based on user locale
  - Temperature units (°C/°F) based on region
  - Timezone handling for timestamps

**Responsive Design:**
- Desktop-first approach (primary use case)
- Tablet support for field technicians
- Mobile web view for basic monitoring
- Breakpoints: Desktop (1920px), Laptop (1366px), Tablet (768px)

**Performance Considerations:**
- Code splitting for faster initial load
- Lazy loading for route-based components
- Virtualization for large lists (equipment, alerts)
- Debounced search and filter operations
- Memoization for expensive calculations
- Service worker for offline capability (future)

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

## 8. Future Considerations

### 8.1 Smart Anomaly Detection Alerts (Phase 2)

**Overview:**
Implement machine learning-based anomaly detection to automatically identify unusual equipment behavior patterns without manual threshold configuration.

**Capabilities:**

**Pattern Learning:**
- System automatically learns normal operational patterns for each equipment
- Builds baseline profiles based on historical data (temperature cycles, compressor patterns, door usage)
- Adapts to seasonal variations, usage patterns, and time-of-day variations
- Per-equipment learning or equipment-type templates

**Anomaly Types Detected:**
1. **Temperature anomalies**
   - Gradual temperature drift indicating failing components
   - Unexpected temperature spikes or drops
   - Longer time to reach target temperature

2. **Component behavior anomalies**
   - Compressor cycling too frequently or irregularly
   - Fan running longer than typical
   - Heater activating at unusual times

3. **Usage pattern anomalies**
   - Door opening at unusual times or frequencies
   - Abnormal access patterns

4. **Performance degradation**
   - Equipment efficiency declining over time
   - Energy consumption increasing
   - Recovery time after door opening lengthening

5. **Multi-variable anomalies**
   - Unusual combinations of metrics (e.g., high temp + low compressor activity)
   - Correlated failures across multiple sensors

**Detection Methods:**
- **Statistical approaches**: Standard deviation from rolling baselines, z-scores
- **Machine learning models**:
  - Isolation Forest for outlier detection
  - Autoencoders for pattern reconstruction
  - LSTM networks for time-series predictions
  - One-class SVM for novelty detection
- **Time-series analysis**: Trend detection, seasonality breaks
- **Ensemble methods**: Combine multiple algorithms for higher accuracy

**Alert Generation:**
- Anomaly score/confidence level (0-100%)
- Explanation of what's unusual (e.g., "Temperature 2.3°C higher than typical for this time")
- Visualization comparing current vs expected patterns
- Suggested actions based on anomaly type
- Historical context (similar past anomalies and outcomes)

**Configuration by Global Admins:**
- Set sensitivity levels (how unusual before alerting)
- Define learning period duration (e.g., 30 days of data required)
- Enable/disable anomaly detection per company or equipment
- Review and approve ML model predictions before auto-alerting
- Override false positives to improve model

**Benefits:**
- **Early warning**: Detect issues days or weeks before failure
- **Reduced false alarms**: Context-aware alerts vs simple thresholds
- **Predictive maintenance**: Schedule repairs before breakdowns
- **Automatic adaptation**: No need to reconfigure as equipment ages
- **Unknown unknowns**: Catch issues you didn't think to configure

**Technical Requirements:**
- Historical data storage (minimum 30 days for baseline)
- ML model training pipeline
- Feature engineering from raw telemetry
- Model versioning and A/B testing
- Explainable AI for alert justification

**API Extensions:**
```
GET /v1/equipments/{equipment_id}/anomaly-detection/status
GET /v1/equipments/{equipment_id}/anomaly-detection/history
POST /v1/anomaly-detection/configure
GET /v1/anomaly-detection/insights
PATCH /v1/alerts/{alert_id}/feedback  (mark as false positive)
```

**Phases:**
- **Phase 2.1**: Statistical anomaly detection (baseline + std deviation)
- **Phase 2.2**: ML-based detection for single metrics
- **Phase 2.3**: Multi-variate pattern detection
- **Phase 2.4**: Predictive failure modeling

### 8.2 Other Future Enhancements

- Native mobile applications (iOS/Android) for on-the-go monitoring
- Integration with additional equipment IoT sensors
- Automated maintenance scheduling based on predictions
- Advanced custom reporting and analytics dashboards
- Public API for third-party integrations
- Equipment performance benchmarking across similar units
- Energy consumption tracking and optimization recommendations
- Voice alerts via phone calls for critical issues
- Integration with existing CMMS (Computerized Maintenance Management Systems)

## 9. Open Questions

**User Management:**
1. Should there be a super admin role above global admin?
2. Should company admins also have the option to be branch-restricted, or only viewers?
3. What happens when a branch is deleted - should users assigned to only that branch be automatically converted to full access or notified?
4. Should there be a bulk assignment feature to assign multiple viewers to the same branches at once?

**Monitoring Data:**
5. What are the default alert rule thresholds for different equipment types?
6. How frequently should equipment data be collected? (default interval and configurable per equipment?)
7. What are the acceptable pressure ranges for different equipment types?
8. What units should pressure be measured in?
9. How long should historical data be retained at full resolution vs aggregated?

**Alert Rules:**
10. Should Global Admins be able to create custom alert rule types beyond the predefined ones?
11. Should there be a notification when alert rules are modified or deleted?
12. Should Company Admins have read-only access to view their assigned alert rules?

**System Integration:**
13. What equipment types need to be supported initially?
14. What is the expected number of concurrent users?
15. What is the expected number of equipment units per company?
16. Should equipment maintenance be automatically logged or manually entered?
17. What integration points exist with existing Polo Sanca systems?

**Features:**
18. Should viewers be able to export reports?
19. Should the system support manual data entry if equipment goes offline?
20. Should Company Admins be able to temporarily disable alerts for their equipment during maintenance?

**Anomaly Detection (Phase 2):**
21. What is the minimum historical data required before enabling anomaly detection for equipment?
22. Should anomaly detection be opt-in or opt-out for companies?
23. How should the system handle learning periods when equipment behavior changes (e.g., after repairs)?
24. Should Company Admins see anomaly detection insights or only Global Admins?
25. What sensitivity level should be default for anomaly detection alerts?
26. Should the system automatically disable learning during maintenance periods?

**Backend:**
27. Should we use marshmallow or pydantic for API validation?
28. What message broker for Celery: Redis or RabbitMQ?
29. Should we implement database connection pooling (e.g., pgBouncer)?
30. What's the strategy for database backups and disaster recovery?
31. Should we use Docker Compose for development or full Kubernetes?
32. What retention policies for telemetry data? (e.g., raw data for 30 days, hourly aggregates for 1 year)
33. What compression policies for older TimescaleDB data?

**Frontend & Internationalization:**
34. Should state management use Context API or Redux?
35. What chart library should be used for telemetry visualization?
36. Should translation files be managed in-code or via a translation management platform (e.g., Lokalise, Crowdin)?
37. Who will be responsible for providing Portuguese and English translations?
38. Should the system support RTL (right-to-left) languages for future expansion?
39. How should we handle dynamic content translation (e.g., user-generated alert messages)?
40. Should Ant Design's built-in theme be customized to match Polo Sanca branding?

## 10. Non-Functional Requirements

### 10.1 Performance
- Dashboard load time < 2 seconds
- Real-time data refresh within 30 seconds
- Support 100+ concurrent users

### 10.2 Availability
- 99.9% uptime SLA
- Scheduled maintenance windows communicated in advance

### 10.3 Usability
- Intuitive interface requiring minimal training
- Responsive design for desktop and tablet
- Accessibility compliance (WCAG 2.1 Level AA)

### 10.4 Compliance
- Data privacy regulations (GDPR, LGPD if applicable)
- Data retention policies
- Audit trail for compliance reporting

## 11. API Specification

### 11.1 API Versioning Strategy

**Version Format:**
- Version included in URL path: `/v1/`, `/v2/`, etc.
- Current version: `v1`

**Versioning Policy:**
- **Major version changes** (v1 → v2): Breaking changes to existing endpoints
  - Changes to request/response structure
  - Removal of endpoints or fields
  - Changes to authentication methods
- **Minor updates within version**: Non-breaking changes
  - Adding new endpoints
  - Adding optional fields
  - Adding new query parameters

**Backwards Compatibility:**
- Previous major versions supported for minimum 12 months after new version release
- Deprecation warnings provided 6 months before sunset
- Version-specific documentation maintained

**Version Detection:**
- Clients must specify version in URL
- No default version redirect (missing version returns 404)

### 11.2 Base URL
```
Production: https://api.polosanca.com/v1
Staging: https://api-staging.polosanca.com/v1
```

### 11.3 Naming Conventions

**Endpoint Naming:**
- Use canonical plural nouns for collections: `/users`, `/companies`, `/branches`, `/alerts`
- Use lowercase with hyphens for multi-word resources: `/maintenance-records`
- Resources are nouns, not verbs
- Nested resources follow pattern: `/{resource}/{id}/{sub-resource}`

**Response Field Naming:**
- Use `snake_case` for JSON fields
- Use descriptive, unambiguous names
- Boolean fields prefixed with `is_`, `has_`, or `can_` when appropriate

### 11.4 Authentication

**User Authentication:**
- Method: JWT (JSON Web Tokens)
- Header: `Authorization: Bearer <token>`

**Equipment Authentication:**
- Method: API Key
- Header: `X-API-Key: <equipment_api_key>`

### 11.5 Equipment Data Ingestion

#### POST /v1/equipments/telemetry
Submit monitoring data from equipment.

**Authentication:** Equipment API Key

**Request Body:**
```json
{
  "serial": "EQ-12345",
  "temperature": 4.5,
  "pressure": 120.3,
  "door": 0,
  "heater": 1,
  "compressor": 1,
  "fan": 1
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Data received successfully",
  "timestamp": "2025-11-25T10:30:00Z",
  "record_id": "rec_abc123"
}
```

**Error Responses:**
- `400 Bad Request` - Invalid data format or missing fields
- `401 Unauthorized` - Invalid API key
- `404 Not Found` - Equipment serial not found
- `500 Internal Server Error` - Server processing error

### 11.6 Authentication Endpoints

#### POST /v1/auth/login
User login.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "usr_123",
    "name": "John Doe",
    "email": "user@example.com",
    "role": "company_admin",
    "company_id": "cmp_456"
  }
}
```

#### POST /v1/auth/logout
User logout.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### POST /v1/auth/refresh
Refresh authentication token.

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### 11.7 User Management

#### GET /v1/users
List users (filtered by permissions).

**Authentication:** JWT (Company Admin or Global Admin)

**Query Parameters:**
- `company_id` (optional, Global Admin only)
- `role` (optional): filter by role
- `page` (default: 1)
- `limit` (default: 20)

**Response (200 OK):**
```json
{
  "users": [
    {
      "id": "usr_123",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "company_viewer",
      "company_id": "cmp_456",
      "branch_access": {
        "type": "restricted",
        "branches": ["brn_001", "brn_002"]
      },
      "status": "active",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45
  }
}
```

#### POST /v1/users/invite
Invite a new user.

**Authentication:** JWT (Company Admin or Global Admin)

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "role": "company_viewer",
  "company_id": "cmp_456",
  "branch_access": {
    "type": "restricted",
    "branches": ["brn_001", "brn_002"]
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "user_id": "usr_789",
  "invitation_sent": true
}
```

#### PATCH /v1/users/{user_id}
Update user details or permissions.

**Request Body:**
```json
{
  "role": "company_admin",
  "branch_access": {
    "type": "full"
  }
}
```

#### DELETE /v1/users/{user_id}
Deactivate or remove user.

### 11.8 Company Management

#### GET /v1/companies
List all companies (Global Admin only).

**Response (200 OK):**
```json
{
  "companies": [
    {
      "id": "cmp_456",
      "name": "Acme Restaurants",
      "status": "active",
      "branches_count": 12,
      "equipment_count": 48,
      "created_at": "2024-06-01T00:00:00Z"
    }
  ]
}
```

#### POST /v1/companies
Create a new company (Global Admin only).

**Request Body:**
```json
{
  "name": "Acme Restaurants",
  "contact_email": "admin@acme.com",
  "contact_phone": "+1234567890"
}
```

#### GET /v1/companies/{company_id}
Get company details.

#### PATCH /v1/companies/{company_id}
Update company information.

### 11.9 Branch Management

#### GET /v1/branches
List branches for a company.

**Query Parameters:**
- `company_id` (required for Global Admin, automatic for Company users)

**Response (200 OK):**
```json
{
  "branches": [
    {
      "id": "brn_001",
      "name": "Downtown Branch",
      "address": "123 Main St, City, State 12345",
      "company_id": "cmp_456",
      "equipment_count": 4,
      "created_at": "2024-06-15T00:00:00Z"
    }
  ]
}
```

#### POST /v1/branches
Create a new branch.

**Request Body:**
```json
{
  "company_id": "cmp_456",
  "name": "Airport Branch",
  "address": "Airport Terminal, City, State"
}
```

#### PATCH /v1/branches/{branch_id}
Update branch information.

#### DELETE /v1/branches/{branch_id}
Delete a branch.

### 11.10 Equipment Management

#### GET /v1/equipments
List equipment (filtered by user permissions).

**Query Parameters:**
- `company_id` (optional, Global Admin only)
- `branch_id` (optional)
- `status` (optional): operational, warning, critical, offline
- `page` (default: 1)
- `limit` (default: 20)

**Response (200 OK):**
```json
{
  "equipment": [
    {
      "id": "eqp_001",
      "serial": "EQ-12345",
      "type": "freezer",
      "company_id": "cmp_456",
      "branch_id": "brn_001",
      "branch_name": "Downtown Branch",
      "status": "operational",
      "current_data": {
        "temperature": 4.5,
        "pressure": 120.3,
        "door": "closed",
        "heater": "on",
        "compressor": "on",
        "fan": "on",
        "last_update": "2025-11-25T10:30:00Z"
      },
      "manufacturer": "CoolTech",
      "model": "CT-500",
      "installed_at": "2024-08-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 48
  }
}
```

#### GET /v1/equipments/{equipment_id}
Get detailed equipment information.

#### POST /v1/equipments
Register new equipment.

**Request Body:**
```json
{
  "serial": "EQ-12345",
  "type": "freezer",
  "branch_id": "brn_001",
  "manufacturer": "CoolTech",
  "model": "CT-500",
  "api_key": "generated_or_provided"
}
```

#### PATCH /v1/equipments/{equipment_id}
Update equipment information.

#### DELETE /v1/equipments/{equipment_id}
Deactivate equipment.

### 11.11 Monitoring Data

#### GET /v1/equipments/{equipment_id}/telemetry
Get historical telemetry data for equipment.

**Query Parameters:**
- `start_date` (ISO 8601 format)
- `end_date` (ISO 8601 format)
- `interval` (optional): raw, 5min, 1hour, 1day (aggregation)
- `fields` (optional): temperature,pressure,door (comma-separated)

**Response (200 OK):**
```json
{
  "equipment_id": "eqp_001",
  "serial": "EQ-12345",
  "data": [
    {
      "timestamp": "2025-11-25T10:00:00Z",
      "temperature": 4.2,
      "pressure": 119.8,
      "door": 0,
      "heater": 1,
      "compressor": 1,
      "fan": 1
    },
    {
      "timestamp": "2025-11-25T10:15:00Z",
      "temperature": 4.5,
      "pressure": 120.3,
      "door": 0,
      "heater": 1,
      "compressor": 1,
      "fan": 1
    }
  ],
  "count": 96
}
```

#### GET /v1/telemetry/realtime
Get real-time data for all accessible equipment.

**Query Parameters:**
- `branch_id` (optional)
- `equipment_ids` (optional): comma-separated list

**Response (200 OK):**
```json
{
  "equipments": [
    {
      "equipment_id": "eqp_001",
      "serial": "EQ-12345",
      "branch_id": "brn_001",
      "temperature": 4.5,
      "pressure": 120.3,
      "door": "closed",
      "heater": "on",
      "compressor": "on",
      "fan": "on",
      "status": "operational",
      "last_update": "2025-11-25T10:30:00Z"
    }
  ]
}
```

### 11.12 Alerts

#### GET /v1/alerts
List alerts (filtered by user permissions).

**Query Parameters:**
- `equipment_id` (optional)
- `branch_id` (optional)
- `status` (optional): active, acknowledged, resolved
- `severity` (optional): warning, critical
- `start_date` (optional)
- `end_date` (optional)

**Response (200 OK):**
```json
{
  "alerts": [
    {
      "id": "alt_001",
      "equipment_id": "eqp_001",
      "serial": "EQ-12345",
      "branch_id": "brn_001",
      "type": "temperature_high",
      "severity": "critical",
      "message": "Temperature exceeded threshold: 12.5°C (max: 8°C)",
      "status": "active",
      "created_at": "2025-11-25T10:35:00Z",
      "acknowledged_at": null,
      "acknowledged_by": null
    }
  ]
}
```

#### PATCH /v1/alerts/{alert_id}/acknowledge
Acknowledge an alert.

**Request Body:**
```json
{
  "notes": "Technician dispatched to location"
}
```

#### GET /v1/alerts/statistics
Get alert statistics dashboard data.

**Response (200 OK):**
```json
{
  "total_active": 12,
  "by_severity": {
    "warning": 8,
    "critical": 4
  },
  "by_type": {
    "temperature_high": 5,
    "temperature_low": 2,
    "equipment_offline": 3,
    "door_open": 2
  }
}
```

### 11.13 Alert Rules

#### GET /v1/alert-rules
List all alert rules (Global Admin only).

**Query Parameters:**
- `scope` (optional): global, company, equipment
- `company_id` (optional): filter by company
- `equipment_id` (optional): filter by equipment
- `rule_type` (optional): temperature_high, temperature_low, etc.
- `is_active` (optional): true/false

**Response (200 OK):**
```json
{
  "alert_rules": [
    {
      "id": "rule_001",
      "name": "Freezer High Temperature Alert",
      "description": "Alert when freezer exceeds safe temperature",
      "rule_type": "temperature_high",
      "threshold_value": 8.0,
      "comparison_operator": ">",
      "duration_seconds": 300,
      "severity": "critical",
      "message_template": "Temperature exceeded {{threshold}}°C: Current {{value}}°C",
      "scope": "company",
      "scope_id": "cmp_456",
      "is_active": true,
      "created_by": "usr_global_admin",
      "created_at": "2025-01-15T00:00:00Z",
      "updated_at": "2025-03-10T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15
  }
}
```

#### POST /v1/alert-rules
Create a new alert rule (Global Admin only).

**Request Body:**
```json
{
  "name": "Freezer High Temperature Alert",
  "description": "Alert when freezer exceeds safe temperature",
  "rule_type": "temperature_high",
  "threshold_value": 8.0,
  "comparison_operator": ">",
  "duration_seconds": 300,
  "severity": "critical",
  "message_template": "Temperature exceeded {{threshold}}°C: Current {{value}}°C",
  "scope": "company",
  "scope_id": "cmp_456",
  "is_active": true
}
```

**Response (201 Created):**
```json
{
  "id": "rule_001",
  "message": "Alert rule created successfully"
}
```

#### GET /v1/alert-rules/{rule_id}
Get specific alert rule details (Global Admin only).

#### PATCH /v1/alert-rules/{rule_id}
Update an alert rule (Global Admin only).

**Request Body:**
```json
{
  "threshold_value": 10.0,
  "is_active": false
}
```

#### DELETE /v1/alert-rules/{rule_id}
Delete an alert rule (Global Admin only).

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Alert rule deleted successfully",
  "affected_equipments": 24
}
```

#### GET /v1/equipments/{equipment_id}/alert-rules
Get all alert rules applicable to specific equipment.

**Response (200 OK):**
```json
{
  "equipment_id": "eqp_001",
  "applicable_rules": [
    {
      "id": "rule_003",
      "name": "Equipment-Specific Rule",
      "rule_type": "temperature_high",
      "threshold_value": 7.0,
      "severity": "critical",
      "scope": "equipment",
      "priority": 1
    },
    {
      "id": "rule_001",
      "name": "Company Rule",
      "rule_type": "temperature_high",
      "threshold_value": 8.0,
      "severity": "critical",
      "scope": "company",
      "priority": 2
    },
    {
      "id": "rule_global",
      "name": "Global Default",
      "rule_type": "temperature_high",
      "threshold_value": 10.0,
      "severity": "warning",
      "scope": "global",
      "priority": 3
    }
  ]
}
```

#### GET /v1/alert-rules/{rule_id}/statistics
Get statistics for how often a rule has triggered.

**Response (200 OK):**
```json
{
  "rule_id": "rule_001",
  "total_triggers": 145,
  "triggers_last_30_days": 23,
  "affected_equipments": 12,
  "avg_triggers_per_equipment": 12.1
}
```

### 11.14 Maintenance

#### GET /v1/equipments/{equipment_id}/maintenance-records
Get maintenance history for equipment.

#### POST /v1/equipments/{equipment_id}/maintenance-records
Log maintenance activity.

**Request Body:**
```json
{
  "type": "routine_inspection",
  "description": "Monthly maintenance check",
  "performed_by": "John Smith",
  "notes": "All components functioning normally",
  "next_maintenance_date": "2025-12-25"
}
```

### 11.15 Common Response Codes

- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `204 No Content` - Request successful, no content to return
- `400 Bad Request` - Invalid request format or parameters
- `401 Unauthorized` - Authentication required or failed
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `422 Unprocessable Entity` - Validation errors
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

### 11.16 Rate Limiting

- **Equipment telemetry**: 1 request per minute per equipment
- **User API calls**: 100 requests per minute per user
- **Global Admin**: 1000 requests per minute

### 11.17 Webhooks (Future)

Companies can register webhook URLs to receive real-time notifications:
- Equipment goes offline
- Alert triggered
- Maintenance due
- Threshold exceeded
