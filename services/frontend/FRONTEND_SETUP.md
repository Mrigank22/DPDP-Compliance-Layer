# DataSent inel Frontend - Complete Setup & Build Guide

## Overview

This is the Next.js 15 frontend for the DataSentinel DPDP compliance platform. It provides a comprehensive dashboard for managing DPDP compliance, data governance, and security policies.

## Prerequisites

- Node.js 18+ and npm 9+
- Access to the control-plane backend API
- Environment variables configured (see below)

## Installation

```bash
cd datasentinel/services/frontend
npm install
```

## Environment Configuration

Create a `.env.local` file in the frontend directory with:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1

# Optional: For production deployments
NEXT_PUBLIC_ANALYTICS_ID=your-analytics-id
```

## Running Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Demo Credentials:**
- Email: `admin@acme.com`
- Password: `Acme@123!`

## Building for Production

```bash
npm run build
npm start
```

## Linting

```bash
npm run lint
npm run type-check
```

## Project Structure

```
frontend/
├── app/
│   ├── (auth)/              # Authentication routes (login, signup)
│   ├── (dashboard)/         # Protected dashboard routes
│   │   ├── assets/          # Asset management
│   │   ├── policies/        # Policy builder & management
│   │   ├── findings/        # Security findings
│   │   ├── gateway/         # Gateway configuration & live feed
│   │   ├── reports/         # Report generation & download
│   │   ├── rights/          # Data subject rights requests (DSR)
│   │   ├── alerts/          # Alert management
│   │   ├── settings/        # Team, API keys, integrations
│   │   └── page.tsx         # Main dashboard
│   ├── layout.tsx           # Root layout
│   ├── page.tsx            # Redirect to auth/dashboard
│   └── providers.tsx        # React Query & other providers
├── components/
│   ├── ui/                  # shadcn/ui components
│   ├── layout/              # Layout components
│   ├── dashboard/           # Dashboard widgets
│   │   ├── stats-cards.tsx
│   │   ├── risk-score-gauge.tsx
│   │   ├── pii-distribution-chart.tsx
│   │   ├── recent-violations.tsx
│   │   └── data-flow-map.tsx
│   ├── policy/              # Policy builder components
│   ├── assets/              # Asset components
│   └── findings/            # Finding components
├── lib/
│   ├── api-client.ts        # Axios API client
│   ├── api/                 # API endpoint helpers
│   │   ├── auth.ts
│   │   ├── assets.ts
│   │   ├── policies.ts
│   │   ├── findings.ts
│   │   ├── gateway.ts
│   │   ├── reports.ts
│   │   ├── rights.ts
│   │   ├── alerts.ts
│   │   ├── scans.ts
│   │   └── dashboard.ts
│   ├── store/               # Zustand global state
│   │   ├── auth.store.ts
│   │   └── ui.store.ts
│   └── utils/               # Helper functions
├── types/
│   └── api.ts               # TypeScript API types
├── public/                  # Static assets
├── package.json
├── tailwind.config.ts       # Tailwind CSS configuration
├── next.config.ts
└── tsconfig.json
```

## Key Features

### Authentication
- Login with email/password
- JWT token-based auth with 15-min access tokens
- Refresh token rotation (7-day tokens)
- Remember me functionality
- Forgot password recovery
- MFA (TOTP) support
- Team member invitations

### Dashboard
- Risk score gauge (0-100 scale)
- PII exposure summary
- Compliance score & DPDP status
- Finding trends (30-day history)
- Policy effectiveness metrics
- Data flow visualization
- Rights request status tracking

### Asset Management
- Connect S3, RDS, GCS, Azure Blob, PostgreSQL, API endpoints, LLM endpoints
- Trigger full/incremental/targeted scans
- View scan history & findings per asset
- Risk scoring per asset
- Real-time status tracking

### Policy Builder
- No-code policy creation UI
- Visual condition builder
- 7 policy types supported:
  - Data masking
  - Transfer control
  - Retention enforcement
  - Consent management
  - Access control
  - LLM guard
  - Breach response
- 20 built-in policy templates
- Version control & rollback
- Enforcement modes: alert, enforce, audit-only

### Gateway Configuration
- Real-time event feed (SSE)
- Rule builder for request/response inspection
- Action types: mask, redact, block, tokenize, alert, allow
- Live statistics: requests/sec, block rate, PII types detected
- Data flow approval workflows

### Findings & Compliance
- Severity filtering: critical, high, medium, low, info
- Finding types: PII exposure, misc configs, policy violations, cross-border transfers, LLM leaks, retention violations
- Mark as resolved with notes
- False positive marking
- Evidence & location tracking

### Reports
- 6 report types:
  - DPDP Compliance Summary
  - Executive Summary
  - Asset Inventory
  - Incident Report
  - DPIA (Data Protection Impact Assessment)
  - Audit Evidence Pack
- Date range filtering
- Asset-specific filtering
- PDF download

### Rights Requests (DSRs)
- 5 request types: access, correction, erasure, portability, nomination
- Status tracking: received, in-progress, completed, rejected
- 90-day deadline management
- Assignment to team members
- Search for data principal's data

### Alerts
- Real-time alert system
- 6 alert types: policy violations, breaches, anomalies, rights deadlines, retention due, cross-border
- Acknowledgment tracking
- Notification channels: email, Slack, PagerDuty, JIRA

### Team & Settings
- Role-based access control: owner, admin, analyst, viewer
- API key management with scopes
- Team member invitations with role assignment
- Webhook configuration
- Notification preferences
- Private deployment instructions

## API Integration

### Authentication Flow

1. User logs in with email/password
2. Backend returns `access_token` (15-min JWT) and `refresh_token` (7-day JWT)
3. Frontend stores tokens in httpOnly cookies
4. Axios interceptor automatically includes `Authorization: Bearer <token>` header
5. If 401 response, refresh token is used to get new access token
6. If refresh fails, user is redirected to login

### Error Handling

- All errors include `request_id` for debugging
- Validation errors include field-level details
- Sensitive data errors don't leak internal details
- Stack traces logged on server (not returned to client)

### Rate Limiting

- Auth endpoints: 10 requests/minute per IP
- API endpoints: 100 requests/minute per tenant
- Returns `X-RateLimit-*` headers

## Development

### Adding a New Page

1. Create folder under `app/(dashboard)/[feature]/`
2. Create `page.tsx` with client component
3. Add navigation link to sidebar in `layout.tsx`
4. Implement data fetching with React Query
5. Create API helpers in `lib/api/[feature].ts`
6. Create TypeScript types in `types/api.ts`

### Creating Components

```typescript
// components/ui/my-component.tsx
import React from 'react'
import { cn } from '@/lib/cn'

interface MyComponentProps {
  className?: string
}

const MyComponent = React.forwardRef<HTMLDivElement, MyComponentProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('base-classes', className)} {...props} />
  )
)

MyComponent.displayName = 'MyComponent'
export { MyComponent }
```

### Using API Helpers

```typescript
import { assetsAPI } from '@/lib/api/assets'

const { data } = useQuery({
  queryKey: ['assets'],
  queryFn: () => assetsAPI.list()
})
```

### Global State

```typescript
import { useAuthStore } from '@/lib/store/auth.store'

const { user, logout } = useAuthStore()
```

## Testing

Run linter and type check:
```bash
npm run lint
npm run type-check
```

## Deployment

### Docker

```bash
# Build image
docker build -t datasentinel-frontend .

# Run container
docker run -d -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=https://api.example.com \
  datasentinel-frontend
```

### Kubernetes (Helm)

See `helm/datasentinel/values.yaml` for configuration options.

## Troubleshooting

### API Connection Issues

1. Check `NEXT_PUBLIC_API_URL` environment variable
2. Ensure backend is running on the configured port
3. Check CORS settings in backend configuration
4. Look for 401 errors in console (expired tokens)

### Build Failures

```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

### TypeScript Errors

```bash
# Check for type errors
npm run type-check

# Update types from API
npx openapi-typescript http://localhost:3001/api/v1/docs -o types/api.ts
```

## Performance Optimization

- Code splitting enabled by default
- Image optimization with Next.js Image component
- React Query for server state caching
- Zustand for lightweight global state
- Framer Motion for smooth animations
- TailwindCSS v4 with JIT compilation

## Security

- JWT tokens stored in httpOnly cookies (not localStorage)
- CSRF protection on all state-changing requests
- XSS protection via React's built-in escaping
- Sensitive data values masked by default in UI
- Click-to-reveal for masked data (with audit logging)

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

Proprietary - DataSentinel Inc.

---

**For backend documentation**, see `./control-plane/README.md`
**For gateway documentation**, see `./gateway/README.md`
**For workers documentation**, see `./workers/README.md`

