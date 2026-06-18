# Security Policy

## Supported Versions

Ousia Desktop is currently pre-release. Security fixes are applied to the
default branch unless a release branch is announced.

## Reporting a Vulnerability

Please report security issues through GitHub Security Advisories when available,
or open an issue with enough detail for maintainers to reproduce and assess the
problem. Do not include private API keys, tokens, or credentials in public
reports.

## Local Secrets

Model provider keys entered in the app are stored in the local Electron app data
state. Treat that directory as sensitive. Future releases may move provider
keys into the operating system credential store.
