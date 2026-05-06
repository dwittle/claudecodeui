# Changelog

All notable changes to the PAN-OS skill will be documented in this file.

## [Unreleased]

### Added
- Environment variable support for configuration (2024-05-05)
  - `PANOS_USERNAME` - Firewall SSH username
  - `PANOS_PASSWORD` - Firewall SSH password
  - `PANOS_BASTION_HOST` - Bastion/jump host hostname
  - `NETSWITCH_USERNAME` - Bastion username (tried first)
  - `NETSWITCH_PASSWORD` - Bastion password (tried first)
  - `PANOS_BASTION_USERNAME` - Bastion username (fallback)
  - `PANOS_BASTION_PASSWORD` - Bastion password (fallback)
- Comprehensive test suite for environment variable configuration
- Documentation for environment variable usage
- Example script demonstrating environment variable configuration
- Automatic fallback from explicit parameters to environment variables

### Changed
- `PanosClient.__init__()` now accepts optional `username` and `password` parameters
- Credentials are loaded from environment variables when not explicitly provided
- Updated `credentials.template` with documentation for all environment variables
- Enhanced CLI help text to document all supported environment variables
- Updated README with environment variable configuration section

### Security
- Credentials still required but can now be provided via environment variables
- Maintains all existing security validations and restrictions
- No changes to command validation or execution security

## Previous Versions

See git history for changes prior to this changelog.
