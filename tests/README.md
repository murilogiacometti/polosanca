# End-to-End API Test Suite

Comprehensive test suite for all user flows documented in the PRD.

## Test Files

### ✅ Completed Test Suites

1. **test_01_auth_flow.py** - User Login and Authentication Flow (PRD 5.1)
   - Valid/invalid login
   - Token refresh
   - Logout
   - Protected resource access
   - Multiple user roles
   - Inactive user handling

2. **test_02_company_onboarding_flow.py** - Company Onboarding Flow (PRD 5.2)
   - Company creation
   - Company admin invitation
   - Branch addition
   - Equipment registration
   - Additional user invitations
   - Complete end-to-end onboarding

3. **test_03_equipment_registration_flow.py** - Equipment Registration Flow (PRD 5.3)
   - Equipment registration with details
   - API key generation
   - Serial number uniqueness
   - Equipment listing and details
   - Authorization checks
   - Multiple equipment types

4. **test_05_user_invitation_flow.py** - User Invitation Flow (PRD 5.5)
   - User invitation by admin
   - Invitation with branch restrictions
   - Pending user status
   - Duplicate email validation
   - Authorization checks
   - Email format validation

5. **test_06_branch_access_restriction_flow.py** - Branch Access Restriction Flow (PRD 5.6)
   - Restricting viewers to specific branches
   - Viewing only assigned branches
   - Equipment filtering by branch access
   - Full vs restricted access
   - Modifying branch access
   - Multiple branch assignment

6. **test_09_equipment_data_ingestion_flow.py** - Equipment Data Ingestion Flow (PRD 5.9)
   - Telemetry data submission
   - Invalid serial handling
   - Missing fields validation
   - API key authentication
   - Equipment status updates
   - Multiple submissions
   - Historical data retrieval
   - Form-urlencoded support

7. **test_10_branch_management_flow.py** - Branch Management Flow (PRD 5.10)
   - Branch creation
   - Branch listing
   - Branch updates
   - Branch details
   - Branch name uniqueness
   - Branch deletion with equipment check
   - Equipment filtering by branch
   - Authorization checks

## Running the Tests

### Prerequisites

```bash
# Install dependencies
pip install -r requirements.txt

# Create test database
psql -U murilog -d postgres -c "CREATE DATABASE polosanca_test"

# Set up environment variable (required for all test runs)
export TEST_DATABASE_URL="postgresql://murilog@localhost:5432/polosanca_test"
```

### Run All Tests

```bash
# IMPORTANT: Always export TEST_DATABASE_URL before running tests
export TEST_DATABASE_URL="postgresql://murilog@localhost:5432/polosanca_test"
source venv/bin/activate

# Run all tests
pytest tests/

# Run with coverage
pytest --cov=app tests/

# Run specific test file
pytest tests/test_01_auth_flow.py

# Run specific test
pytest tests/test_01_auth_flow.py::test_01_user_login_with_valid_credentials

# Run with verbose output
pytest -v tests/
```

### Test Configuration

Test configuration is managed in `tests/conftest.py`:
- Test database initialization
- Test data fixtures
- Helper functions for login and authentication
- Reusable test utilities

## Test Data

Each test uses a clean database with the following initial data:
- 1 Test Company with 2 branches
- 4 Users:
  - Global Admin (admin@polosanca.com)
  - Company Admin (admin@testcompany.com)
  - Company Viewer with full access (viewer@testcompany.com)
  - Company Viewer with restricted access (restricted@testcompany.com)
- 2 Equipment units (one in each branch)

## Current Test Results

**Last Run: 67 tests total**
- ✅ **26 tests PASSING** (endpoints implemented)
- ⚠️ **41 tests FAILING** (endpoints not yet implemented - expected)

### What's Working:
- ✅ Authentication flow (login, logout, token refresh) - 11/12 passing
- ✅ User invitation endpoint with branch access restrictions - 10/10 passing
- ✅ Branch access management (update user permissions) - 6/10 passing
- ✅ Company creation and viewing - 2/8 passing
- ✅ Branch updates - 3/10 passing
- ✅ User role authorization checks

### Recently Implemented:
- 🎉 **User Invitation endpoint** (`POST /v1/users/invite`)
  - Role-based authorization (global admin, company admin)
  - Email validation and duplicate checking
  - Branch access restriction support
  - Invitation token generation
  - All 10 tests passing!

### What Still Needs Implementation:
- Equipment registration endpoint (`POST /v1/equipments`)
- Telemetry ingestion endpoint (`POST /v1/equipments/telemetry`)
- Branch creation endpoint (`POST /v1/branches`)
- Branch filtering for restricted viewers (4 tests)
- Equipment filtering by branch access
- And other endpoints documented in the PRD

**Note:** Test failures are expected until the corresponding API endpoints are implemented. As you build each endpoint, the tests will begin passing automatically.

## Test Coverage

### Coverage by User Flow

| Flow | PRD Section | Tests | Test Status | API Status |
|------|-------------|-------|-------------|------------|
| User Login and Authentication | 5.1 | 12 | ✅ Complete | 🟡 Partial (11/12 passing) |
| Company Onboarding | 5.2 | 8 | ✅ Complete | 🟡 Partial (2/8 passing) |
| Equipment Registration | 5.3 | 7 | ✅ Complete | 🔴 Not Implemented |
| User Invitation | 5.5 | 10 | ✅ Complete | 🟢 **Implemented (10/10 passing)** |
| Branch Access Restriction | 5.6 | 10 | ✅ Complete | 🟡 Partial (6/10 passing) |
| Equipment Data Ingestion | 5.9 | 10 | ✅ Complete | 🔴 Not Implemented |
| Branch Management | 5.10 | 10 | ✅ Complete | 🟡 Partial (3/10 passing) |
| Equipment Monitoring | 5.4 | - | ⏳ To be implemented | - |
| Alert Management | 5.7 | - | ⏳ To be implemented | - |
| Alert Rule Configuration | 5.8 | - | ⏳ To be implemented | - |
| Maintenance Logging | 5.11 | - | ⏳ To be implemented | - |

## Test Patterns

### Authentication Pattern

```python
from tests.conftest import login_user, get_auth_headers

# Login and get token
access_token, refresh_token = login_user(client, 'user@example.com', 'password')

# Use token in request
response = client.get(
    '/v1/endpoint',
    headers=get_auth_headers(access_token)
)
```

### Database Initialization Pattern

```python
def test_something(client, init_database):
    # init_database fixture provides clean database with test data
    # Your test code here
    pass
```

## Continuous Integration

These tests are designed to run in CI/CD pipelines:
- Fast execution (< 5 minutes for full suite)
- Isolated test database
- No external dependencies
- Clear pass/fail indicators

## Development Workflow

### Test-Driven Development
Use these tests to guide your API implementation:

1. **Pick an endpoint to implement** (e.g., `POST /v1/users/invite`)
2. **Run the related tests** to see what's expected:
   ```bash
   export TEST_DATABASE_URL="postgresql://murilog@localhost:5432/polosanca_test"
   pytest tests/test_05_user_invitation_flow.py -v
   ```
3. **Implement the endpoint** following the test requirements
4. **Re-run tests** to verify your implementation
5. **Tests pass** = Feature complete! ✅

### Quick Feedback Loop
```bash
# Watch mode - auto-run tests on file changes (requires pytest-watch)
export TEST_DATABASE_URL="postgresql://murilog@localhost:5432/polosanca_test"
ptw tests/test_01_auth_flow.py
```

### Debugging Failed Tests
```bash
# Run with full traceback
pytest tests/test_name.py -vvs --tb=long

# Run single test with debugging
pytest tests/test_file.py::test_function_name -vvs

# Print all variables on failure
pytest tests/ -vv --showlocals
```

## Notes

- Tests follow the exact flows documented in the PRD
- Each test is independent and can run in isolation
- Tests use descriptive names matching PRD scenarios
- Authorization and validation checks are comprehensively tested
- Error scenarios are covered alongside happy paths
- Tests serve as both specification and acceptance criteria
- 67 tests covering 7 major user flows from the PRD
