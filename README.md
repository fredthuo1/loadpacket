# LoadPacket

**A modern logistics management platform for carriers, fleet owners, dispatchers, and drivers.**

LoadPacket simplifies freight operations by bringing load management, document processing, driver coordination, finance, and operational visibility into one platform.

The goal is simple: **Less paperwork. More miles. Better business.**

---

## Overview

LoadPacket is a web and mobile logistics platform designed to help transportation businesses manage their daily operations efficiently.

The platform brings together load intake, dispatching, document management, driver workflows, financial tracking, and reporting.

### Key Features

- **Smart Load Intake:** Upload Rate Confirmations, extract relevant information, review details, and create loads.
- **Load Management:** Create, assign, update, and monitor freight loads.
- **Driver Management:** Manage drivers, assignments, and operational statuses.
- **Document Vault:** Organize Rate Confirmations, Bills of Lading (BOL), Proof of Delivery (POD), and invoices.
- **Driver Mobile Application:** Give drivers access to assigned loads, delivery workflows, and documents.
- **Finance and Settlements:** Track revenue, charges, invoices, expenses, and driver settlements.
- **Organization Management:** Support company accounts, permissions, and subscription workflows.
- **Dashboard:** View operational information through an organized interface.

Some advanced capabilities and third-party integrations remain subject to testing and release configuration.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Web Frontend | Next.js, React, TypeScript |
| Backend API | NestJS, Node.js |
| Mobile Application | React Native, Expo |
| Database | PostgreSQL |
| Authentication | Supabase |
| Testing | Playwright, automated API and unit tests |
| Containers | Docker |
| Package Manager | pnpm |
| CI/CD | GitHub Actions (planned) |
| Deployment | Render, GitHub Container Registry |

---

## Project Structure

```text
loadpacket/
├── apps/
│   ├── api/                # NestJS backend
│   ├── web/                # Next.js web application
│   ├── mobile/             # Expo mobile application
│   └── worker/             # Background processing
│
├── packages/
│   ├── api-contracts/
│   ├── database/
│   ├── document-schemas/
│   ├── domain/
│   ├── shared-types/
│   └── validation/
│
├── infrastructure/
│   ├── docker/
│   └── terraform/
│
├── scripts/                # Development and testing utilities
├── docs/                   # Architecture and project documentation
└── package.json
```

---

## Prerequisites

Install the following tools:

- Node.js 24
- pnpm
- Git
- Docker Desktop
- PostgreSQL (if using a local database installation)

Verify your installation:

```bash
node --version
pnpm --version
git --version
docker --version
```

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/fredthuo1/loadpacket.git
cd loadpacket
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment Variables

Configure the required environment variables for the API, web application, database, and authentication provider.

Use existing environment examples and development documentation where available.

Never commit `.env` files containing real credentials.

### 4. Start Required Database Services

If using Docker, check which services are running:

```bash
docker ps
```

Start the project's configured development database before launching services that require it.

### 5. Start the Backend API

```bash
pnpm --filter api dev
```

API base URL:

http://localhost:3001/api/v1

### 6. Start the Web Application

Open another terminal:

```bash
pnpm --filter web dev
```

Web application:

http://localhost:3000

### 7. Start the Mobile Application

Open another terminal:

```bash
pnpm --filter mobile start
```

Verify mobile package scripts and Expo device configuration if the command differs.

---

## Application Pages

| Page | Local URL |
|---|---|
| Dashboard | http://localhost:3000 |
| Welcome / Landing | http://localhost:3000/welcome |
| Login | http://localhost:3000/login |
| Create Load | http://localhost:3000/loads/new |
| Drivers | http://localhost:3000/drivers |
| Documents | http://localhost:3000/documents |
| Driver Portal | http://localhost:3000/driver |

Some pages require authentication and appropriate organization permissions.

---

## End-to-End Testing

LoadPacket uses Playwright for web browser testing.

Tests cover supported workflows including navigation, load management, document operations, access permissions, and user-interface behavior.

### Run Browser Tests

```bash
pnpm --filter web exec playwright test
```

### Run Tests with Browser Visible

```bash
pnpm --filter web exec playwright test --headed
```

### Open Test Reports

```bash
pnpm --filter web exec playwright show-report
```

### List Available Tests

```bash
pnpm --filter web exec playwright test --list
```

Some tests require running development services, authentication fixtures, or isolated test databases.

### Testing Goals

- Validate core business workflows.
- Prevent regressions.
- Verify authentication and authorization.
- Test desktop and mobile viewport layouts.
- Capture screenshots and traces for debugging.
- Validate frontend, API, and database interactions.
- Prevent production data from being used during testing.

---

## Security

LoadPacket follows security-focused engineering practices, including:

- Authentication and authorization
- Organization-level data isolation
- Secure document handling
- Environment-based configuration
- API validation
- Controlled access to business records
- Protection of customer and financial data

Production security readiness must be verified through testing and deployment reviews.

Do not commit API keys, passwords, production credentials, or sensitive customer information.

---

## Deployment

The project supports container-based deployment using Docker and GitHub Container Registry.

Deployment configuration and operational documentation are maintained in the repository.

Web deployment:

https://loadpacket-web.onrender.com

Production readiness, external integrations, and environment configurations must be validated before public release.

---

## Development Workflow

Create a development branch:

```bash
git checkout -b feature/my-feature
```

Implement and test your changes.

Review the modifications:

```bash
git status
git diff
```

Commit:

```bash
git add .
git commit -m "feat: describe feature"
```

Push:

```bash
git push -u origin feature/my-feature
```

Open a pull request to merge approved changes into `main`.

---

## Roadmap

### Phase 1 — Core Platform

- Load intake and management
- Driver operations
- Document vault
- Organization accounts
- Dashboard and navigation
- Core finance workflows

### Phase 2 — Production Readiness

- Comprehensive regression testing
- Security validation
- Performance improvements
- Mobile acceptance testing
- Subscription validation
- Operational monitoring

### Phase 3 — Intelligent Automation

- Enhanced document intelligence
- AI-assisted logistics workflows
- Financial insights and analytics
- Automated operational recommendations
- Additional integrations

Features listed in the roadmap are not necessarily production-ready.

---

## Contributing

LoadPacket is currently a founder-led project.

Development should follow existing architecture and coding conventions.

All changes should be reviewed and tested before merging into the main branch.

---

## License

Proprietary software. All rights reserved.

No permission to copy, redistribute, or commercially use the source code is granted without authorization.

---

**LoadPacket — Less paperwork. More miles. Better business.**
