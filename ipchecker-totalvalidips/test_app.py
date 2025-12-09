import pytest
from app import app


@pytest.fixture
def client():
    app.testing = True
    with app.test_client() as c:
        yield c


def test_valid_and_invalid(client):
    # 172.217.23.206 -> valid IPv4
    # 172.217.23.206.100 -> invalid (5 groups)
    # 2:145:40 -> valid IPv6 (3 groups)
    resp = client.get("/?items=172.217.23.206,172.217.23.206.100,2:145:40")
    assert resp.status_code == 200
    data = resp.get_json()

    assert data["error"] is False
    assert data["items"] == "172.217.23.206,172.217.23.206.100,2:145:40"

    # Two valid: one IPv4 + one IPv6
    assert data["total_valid_ips"] == 2
    assert "172.217.23.206" in data["valid_ips"]
    assert "2:145:40" in data["valid_ips"]

    # One invalid
    assert "172.217.23.206.100" in data["invalid_ips"]


def test_missing_items(client):
    resp = client.get("/")
    assert resp.status_code == 400

    data = resp.get_json()
    assert data["error"] is True
    assert data["items"] == ""
    assert data["total_valid_ips"] == 0
    assert data["valid_ips"] == []
    assert data["invalid_ips"] == []


def test_empty_entries_are_invalid(client):
    # Includes empty entries between commas and at the end
    resp = client.get("/?items=1.1.1.1,,2:3::4,")
    assert resp.status_code == 200
    data = resp.get_json()

    # 1.1.1.1 -> valid IPv4
    # "" (between commas) -> invalid
    # "2:3::4" -> valid IPv6 in our loose rules
    # "" (trailing) -> invalid
    assert data["total_valid_ips"] == 2
    assert "1.1.1.1" in data["valid_ips"]
    assert "2:3::4" in data["valid_ips"]
    assert len(data["invalid_ips"]) >= 2
