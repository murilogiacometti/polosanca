"""
Test Suite: Equipment Data Ingestion Flow (PRD 5.9)

Tests the telemetry data ingestion process:
1. Equipment collects sensor readings
2. Equipment sends POST request with monitoring data
3. Server validates equipment serial number
4. Server captures timestamp and stores data
5. Server evaluates alert rules
6. Server returns success response
7. Dashboard updates with new data
"""
import pytest
from tests.conftest import get_auth_headers


def test_01_equipment_sends_telemetry_data_successfully(client, init_database):
    """
    Test: Equipment successfully sends telemetry data to server

    Flow:
    1. Equipment sends POST with all required fields
    2. Server validates serial number
    3. Server stores data with timestamp
    4. Server returns success response
    """
    response = client.post(
        '/v1/equipments/telemetry',
        headers={'X-API-Key': 'test_api_key_001'},
        json={
            'serial': 'EQ-TEST-001',
            'temperature': 4.5,
            'pressure': 120.3,
            'door': 0,
            'heater': 1,
            'compressor': 1,
            'fan': 1
        }
    )

    assert response.status_code == 200
    data = response.get_json()

    assert data['success'] is True
    assert 'message' in data
    assert 'timestamp' in data
    assert 'record_id' in data


def test_02_equipment_data_with_invalid_serial(client, init_database):
    """
    Test: Server rejects data from unknown equipment serial

    Error Scenario: Unknown serial number
    """
    response = client.post(
        '/v1/equipments/telemetry',
        headers={'X-API-Key': 'some_api_key'},
        json={
            'serial': 'EQ-UNKNOWN-999',
            'temperature': 5.0,
            'pressure': 120.0,
            'door': 0,
            'heater': 1,
            'compressor': 1,
            'fan': 1
        }
    )

    assert response.status_code == 404
    data = response.get_json()
    assert 'error' in data or 'message' in data


def test_03_equipment_data_with_missing_fields(client, init_database):
    """
    Test: Server validates required fields in telemetry data

    Error Scenario: Missing required fields
    """
    # Missing temperature
    response = client.post(
        '/v1/equipments/telemetry',
        headers={'X-API-Key': 'test_api_key_001'},
        json={
            'serial': 'EQ-TEST-001',
            'pressure': 120.0,
            'door': 0,
            'heater': 1,
            'compressor': 1,
            'fan': 1
        }
    )
    assert response.status_code == 400

    # Missing serial
    response = client.post(
        '/v1/equipments/telemetry',
        headers={'X-API-Key': 'test_api_key_001'},
        json={
            'temperature': 4.5,
            'pressure': 120.0,
            'door': 0,
            'heater': 1,
            'compressor': 1,
            'fan': 1
        }
    )
    assert response.status_code == 400


def test_04_equipment_data_without_api_key(client, init_database):
    """
    Test: Server requires API key authentication for telemetry
    """
    response = client.post(
        '/v1/equipments/telemetry',
        json={
            'serial': 'EQ-TEST-001',
            'temperature': 4.5,
            'pressure': 120.3,
            'door': 0,
            'heater': 1,
            'compressor': 1,
            'fan': 1
        }
    )

    assert response.status_code == 401


def test_05_equipment_status_updates_after_data_ingestion(client, init_database):
    """
    Test: Equipment status changes from offline to operational after receiving data

    Flow:
    1. Equipment initially has offline status
    2. Equipment sends telemetry data
    3. Equipment status updates to operational
    4. last_seen_at timestamp is updated
    """
    from tests.conftest import login_user

    # Send telemetry data
    client.post(
        '/v1/equipments/telemetry',
        headers={'X-API-Key': 'test_api_key_001'},
        json={
            'serial': 'EQ-TEST-001',
            'temperature': 4.5,
            'pressure': 120.3,
            'door': 0,
            'heater': 1,
            'compressor': 1,
            'fan': 1
        }
    )

    # Check equipment status via API
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    equipment_list = client.get(
        '/v1/equipments',
        headers=get_auth_headers(access_token)
    ).get_json()['equipment']

    eq_test_001 = next((eq for eq in equipment_list if eq['serial'] == 'EQ-TEST-001'), None)
    assert eq_test_001 is not None
    assert eq_test_001['status'] in ['operational', 'warning', 'critical']  # No longer offline
    assert eq_test_001['current_data'] is not None
    assert eq_test_001['current_data']['temperature'] == 4.5


def test_06_multiple_telemetry_submissions(client, init_database):
    """
    Test: Equipment can send multiple telemetry readings over time

    Flow:
    1. Equipment sends first reading
    2. Equipment sends second reading with different values
    3. Equipment sends third reading
    4. All readings are stored
    5. Latest reading is reflected in equipment status
    """
    from tests.conftest import login_user

    # Send multiple readings
    for i in range(3):
        response = client.post(
            '/v1/equipments/telemetry',
            headers={'X-API-Key': 'test_api_key_001'},
            json={
                'serial': 'EQ-TEST-001',
                'temperature': 4.0 + (i * 0.5),
                'pressure': 120.0 + i,
                'door': i % 2,
                'heater': 1,
                'compressor': 1,
                'fan': 1
            }
        )
        assert response.status_code == 200

    # Verify latest reading is shown
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    equipment_list = client.get(
        '/v1/equipments',
        headers=get_auth_headers(access_token)
    ).get_json()['equipment']

    eq_test_001 = next((eq for eq in equipment_list if eq['serial'] == 'EQ-TEST-001'), None)
    assert eq_test_001 is not None
    # Should show latest reading
    assert eq_test_001['current_data']['temperature'] == 5.0
    assert eq_test_001['current_data']['pressure'] == 122.0


def test_07_telemetry_data_retrievable_via_api(client, init_database):
    """
    Test: Historical telemetry data can be retrieved

    Flow:
    1. Equipment sends telemetry data
    2. User queries historical data via API
    3. System returns time-series data
    """
    from tests.conftest import login_user

    # Send telemetry
    client.post(
        '/v1/equipments/telemetry',
        headers={'X-API-Key': 'test_api_key_001'},
        json={
            'serial': 'EQ-TEST-001',
            'temperature': 4.5,
            'pressure': 120.3,
            'door': 0,
            'heater': 1,
            'compressor': 1,
            'fan': 1
        }
    )

    # Retrieve via API
    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    equipment_list = client.get(
        '/v1/equipments',
        headers=get_auth_headers(access_token)
    ).get_json()['equipment']

    eq_test_001 = next((eq for eq in equipment_list if eq['serial'] == 'EQ-TEST-001'), None)
    equipment_id = eq_test_001['id']

    # Get telemetry history
    response = client.get(
        f'/v1/equipments/{equipment_id}/telemetry',
        headers=get_auth_headers(access_token)
    )

    assert response.status_code == 200
    data = response.get_json()
    assert 'data' in data
    assert len(data['data']) > 0
    assert data['data'][0]['temperature'] is not None


def test_08_form_urlencoded_telemetry_submission(client, init_database):
    """
    Test: Equipment can send data as application/x-www-form-urlencoded

    The API should support both JSON and form-encoded data
    """
    response = client.post(
        '/v1/equipments/telemetry',
        headers={
            'X-API-Key': 'test_api_key_001',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data={
            'serial': 'EQ-TEST-001',
            'temperature': '4.5',
            'pressure': '120.3',
            'door': '0',
            'heater': '1',
            'compressor': '1',
            'fan': '1'
        }
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True


def test_09_telemetry_with_different_door_states(client, init_database):
    """
    Test: System correctly handles door open/closed states
    """
    # Door closed
    response_closed = client.post(
        '/v1/equipments/telemetry',
        headers={'X-API-Key': 'test_api_key_001'},
        json={
            'serial': 'EQ-TEST-001',
            'temperature': 4.5,
            'pressure': 120.3,
            'door': 0,  # Closed
            'heater': 1,
            'compressor': 1,
            'fan': 1
        }
    )
    assert response_closed.status_code == 200

    # Door open
    response_open = client.post(
        '/v1/equipments/telemetry',
        headers={'X-API-Key': 'test_api_key_001'},
        json={
            'serial': 'EQ-TEST-001',
            'temperature': 5.5,
            'pressure': 118.0,
            'door': 1,  # Open
            'heater': 1,
            'compressor': 1,
            'fan': 1
        }
    )
    assert response_open.status_code == 200


def test_10_high_frequency_telemetry_submissions(client, init_database):
    """
    Test: System handles multiple rapid telemetry submissions

    Flow:
    1. Equipment sends 10 rapid telemetry readings
    2. All are accepted and stored
    3. System processes without errors
    """
    for i in range(10):
        response = client.post(
            '/v1/equipments/telemetry',
            headers={'X-API-Key': 'test_api_key_001'},
            json={
                'serial': 'EQ-TEST-001',
                'temperature': 4.0 + (i * 0.1),
                'pressure': 120.0 + i,
                'door': 0,
                'heater': 1,
                'compressor': 1,
                'fan': 1
            }
        )
        assert response.status_code == 200

    # Verify all data was stored (check via telemetry endpoint)
    from tests.conftest import login_user

    access_token, _ = login_user(client, 'admin@testcompany.com', 'password123')

    equipment_list = client.get(
        '/v1/equipments',
        headers=get_auth_headers(access_token)
    ).get_json()['equipment']

    eq_test_001 = next((eq for eq in equipment_list if eq['serial'] == 'EQ-TEST-001'), None)
    equipment_id = eq_test_001['id']

    telemetry = client.get(
        f'/v1/equipments/{equipment_id}/telemetry',
        headers=get_auth_headers(access_token)
    ).get_json()

    assert telemetry['count'] >= 10
