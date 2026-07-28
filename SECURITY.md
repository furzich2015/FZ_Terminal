# Security

## Reporting a vulnerability

Please report vulnerabilities through GitHub Private Vulnerability Reporting:

https://github.com/furzich2015/FZ_Terminal/security/advisories/new

Do not include credentials, terminal output, SSH host details, or other
personal data in a public issue.

## Local data

FZ Terminal stores its profile under the current operating-system user
account. On Linux, the default location is `~/.config/fz-terminal`.
Development profiles, terminal command-block history, build artifacts, local
environment files, signing keys, and credentials are excluded from Git.

Run the local confidentiality scan before every public release:

```bash
npm run security:scan
```
