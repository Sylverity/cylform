# Security Policy

## Supported Versions

The following versions of Cylform are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Cylform, please report it privately rather than opening a public issue.

**Preferred method:**
- Email **security@sylverity.com** with the subject line `[Cylform Security]`
- Include a detailed description of the vulnerability and steps to reproduce
- Allow up to 72 hours for an initial response

**What to expect:**
- Acknowledgment within 72 hours
- Assessment and regular updates on progress
- Credit in the advisory upon resolution (unless you prefer to remain anonymous)
- A fix released as soon as practicable, followed by a public disclosure

Cylform treats molecule files as inert data and does not execute embedded scripts. If you find a way to bypass this safety model or achieve code execution through a molecule file, that is considered a critical vulnerability.
