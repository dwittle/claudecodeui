#!/usr/bin/env python3
"""
Test environment variable configuration for PAN-OS client
"""

import os
import sys
import pytest

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from panos_client import PanosClient, PanosError


def test_username_from_env(monkeypatch):
    """Test that username can be loaded from environment"""
    monkeypatch.setenv('PANOS_USERNAME', 'testuser')
    monkeypatch.setenv('PANOS_PASSWORD', 'testpass')

    client = PanosClient(hostname='test.example.com')
    assert client.username == 'testuser'
    assert client.password == 'testpass'


def test_password_from_env(monkeypatch):
    """Test that password can be loaded from environment"""
    monkeypatch.setenv('PANOS_USERNAME', 'admin')
    monkeypatch.setenv('PANOS_PASSWORD', 'secret123')

    client = PanosClient(hostname='test.example.com')
    assert client.username == 'admin'
    assert client.password == 'secret123'


def test_env_overrides_explicit_credentials(monkeypatch):
    """Test that environment variables override explicit credentials"""
    monkeypatch.setenv('PANOS_USERNAME', 'envuser')
    monkeypatch.setenv('PANOS_PASSWORD', 'envpass')

    client = PanosClient(
        hostname='test.example.com',
        username='explicituser',
        password='explicitpass'
    )
    # Environment variables take precedence
    assert client.username == 'envuser'
    assert client.password == 'envpass'


def test_missing_username_raises_error(monkeypatch):
    """Test that missing username raises an error"""
    monkeypatch.delenv('PANOS_USERNAME', raising=False)
    monkeypatch.setenv('PANOS_PASSWORD', 'testpass')

    with pytest.raises(PanosError, match='Username required'):
        PanosClient(hostname='test.example.com')


def test_missing_password_raises_error(monkeypatch):
    """Test that missing password raises an error"""
    monkeypatch.setenv('PANOS_USERNAME', 'testuser')
    monkeypatch.delenv('PANOS_PASSWORD', raising=False)

    with pytest.raises(PanosError, match='Password required'):
        PanosClient(hostname='test.example.com')


def test_bastion_host_from_env(monkeypatch):
    """Test that bastion host can be loaded from environment"""
    monkeypatch.setenv('PANOS_USERNAME', 'testuser')
    monkeypatch.setenv('PANOS_PASSWORD', 'testpass')
    monkeypatch.setenv('PANOS_BASTION_HOST', 'bastion.example.com')
    monkeypatch.setenv('NETSWITCH_USERNAME', 'bastionuser')
    monkeypatch.setenv('NETSWITCH_PASSWORD', 'bastionpass')

    client = PanosClient(hostname='test.example.com')
    assert client.bastion_host == 'bastion.example.com'
    assert client.bastion_username == 'bastionuser'
    assert client.bastion_password == 'bastionpass'


def test_bastion_credentials_netswitch_fallback(monkeypatch):
    """Test that NETSWITCH credentials are tried before PANOS_BASTION"""
    monkeypatch.setenv('PANOS_USERNAME', 'testuser')
    monkeypatch.setenv('PANOS_PASSWORD', 'testpass')
    monkeypatch.setenv('PANOS_BASTION_HOST', 'bastion.example.com')
    monkeypatch.setenv('NETSWITCH_USERNAME', 'netswitch_user')
    monkeypatch.setenv('NETSWITCH_PASSWORD', 'netswitch_pass')
    monkeypatch.setenv('PANOS_BASTION_USERNAME', 'bastion_user')
    monkeypatch.setenv('PANOS_BASTION_PASSWORD', 'bastion_pass')

    client = PanosClient(hostname='test.example.com')
    # Should prefer NETSWITCH credentials
    assert client.bastion_username == 'netswitch_user'
    assert client.bastion_password == 'netswitch_pass'


def test_bastion_credentials_panos_bastion_only(monkeypatch):
    """Test that PANOS_BASTION credentials work when NETSWITCH not set"""
    monkeypatch.setenv('PANOS_USERNAME', 'testuser')
    monkeypatch.setenv('PANOS_PASSWORD', 'testpass')
    monkeypatch.setenv('PANOS_BASTION_HOST', 'bastion.example.com')
    monkeypatch.delenv('NETSWITCH_USERNAME', raising=False)
    monkeypatch.delenv('NETSWITCH_PASSWORD', raising=False)
    monkeypatch.setenv('PANOS_BASTION_USERNAME', 'bastion_user')
    monkeypatch.setenv('PANOS_BASTION_PASSWORD', 'bastion_pass')

    client = PanosClient(hostname='test.example.com')
    assert client.bastion_username == 'bastion_user'
    assert client.bastion_password == 'bastion_pass'


def test_bastion_missing_credentials_raises_error(monkeypatch):
    """Test that bastion host without credentials raises an error"""
    monkeypatch.setenv('PANOS_USERNAME', 'testuser')
    monkeypatch.setenv('PANOS_PASSWORD', 'testpass')
    monkeypatch.setenv('PANOS_BASTION_HOST', 'bastion.example.com')
    monkeypatch.delenv('NETSWITCH_USERNAME', raising=False)
    monkeypatch.delenv('NETSWITCH_PASSWORD', raising=False)
    monkeypatch.delenv('PANOS_BASTION_USERNAME', raising=False)
    monkeypatch.delenv('PANOS_BASTION_PASSWORD', raising=False)

    with pytest.raises(PanosError, match='Bastion credentials required'):
        PanosClient(hostname='test.example.com')


def test_env_overrides_explicit_bastion(monkeypatch):
    """Test that environment overrides explicit bastion config"""
    monkeypatch.setenv('PANOS_USERNAME', 'testuser')
    monkeypatch.setenv('PANOS_PASSWORD', 'testpass')
    monkeypatch.setenv('PANOS_BASTION_HOST', 'env-bastion.example.com')
    monkeypatch.setenv('NETSWITCH_USERNAME', 'envuser')
    monkeypatch.setenv('NETSWITCH_PASSWORD', 'envpass')

    client = PanosClient(
        hostname='test.example.com',
        bastion_host='explicit-bastion.example.com',
        bastion_username='explicituser',
        bastion_password='explicitpass'
    )
    # Environment variables take precedence
    assert client.bastion_host == 'env-bastion.example.com'
    assert client.bastion_username == 'envuser'
    assert client.bastion_password == 'envpass'


def test_explicit_params_as_fallback(monkeypatch):
    """Test that explicit parameters work as fallback when env not set"""
    monkeypatch.delenv('PANOS_USERNAME', raising=False)
    monkeypatch.delenv('PANOS_PASSWORD', raising=False)

    client = PanosClient(
        hostname='test.example.com',
        username='explicituser',
        password='explicitpass'
    )
    assert client.username == 'explicituser'
    assert client.password == 'explicitpass'


def test_explicit_bastion_as_fallback(monkeypatch):
    """Test that explicit bastion params work as fallback when env not set"""
    monkeypatch.setenv('PANOS_USERNAME', 'testuser')
    monkeypatch.setenv('PANOS_PASSWORD', 'testpass')
    monkeypatch.delenv('PANOS_BASTION_HOST', raising=False)
    monkeypatch.delenv('NETSWITCH_USERNAME', raising=False)
    monkeypatch.delenv('NETSWITCH_PASSWORD', raising=False)
    monkeypatch.delenv('PANOS_BASTION_USERNAME', raising=False)
    monkeypatch.delenv('PANOS_BASTION_PASSWORD', raising=False)

    client = PanosClient(
        hostname='test.example.com',
        bastion_host='explicit-bastion.example.com',
        bastion_username='explicituser',
        bastion_password='explicitpass'
    )
    assert client.bastion_host == 'explicit-bastion.example.com'
    assert client.bastion_username == 'explicituser'
    assert client.bastion_password == 'explicitpass'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
