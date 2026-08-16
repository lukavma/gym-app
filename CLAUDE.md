## Local environment

- OS: Windows
- Preferred shell: PowerShell
- Do not infer Windows tool availability from Git Bash / `/usr/bin/bash`.
- If a command is missing in Bash, retry the equivalent check in PowerShell before concluding the tool is unavailable.

### Python

- Use `py`, not `python3`.

### Node

- Node.js 24
- Package manager: pnpm

### Docker / local PostgreSQL

- Docker Desktop is available locally on Windows.
- Docker Compose is available.
- The repository's local PostgreSQL 16 development database runs in Docker.
- Compose project: `gym-app`
- Docker Compose service: `db`
- PostgreSQL is exposed on `localhost:5432`.
- Prefer PowerShell for Docker/PostgreSQL checks.
- Do not conclude Docker or PostgreSQL is unavailable merely because `docker` is missing from the inherited shell PATH.
- If `docker` is not found, retry using:

  `C:\Program Files\Docker\Docker\resources\bin\docker.exe`

Useful checks:

`docker ps`  
`docker compose ps`

Fallback if `docker` is not on PATH:

`& "C:\Program Files\Docker\Docker\resources\bin\docker.exe" ps`  
`& "C:\Program Files\Docker\Docker\resources\bin\docker.exe" compose ps`

`Test-NetConnection -ComputerName localhost -Port 5432`  
`pg_isready -h localhost -p 5432`

### Database environments

Local development / automated verification:

- Use the local Docker PostgreSQL instance on `localhost:5432`.
- Use it for local development, migration verification, integration tests, and review/remediation checks unless a task explicitly requires production access.
- Do not use production merely to verify code that can be verified locally.

Production:

- Production PostgreSQL runs in Azure Database for PostgreSQL Flexible Server.
- Production is not the local Docker database.
- Do not connect to, migrate, seed, modify, or otherwise operate on production unless the task explicitly requires production access.
- Never run destructive commands against production unless explicitly instructed.
