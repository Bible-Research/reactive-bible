# User Authentication Implementation Plan

## Executive Summary

This document outlines a comprehensive plan to implement user 
authentication in the reactive-bible React application using the Bible 
Research API's token-based authentication system.

**Current State**: The app currently makes unauthenticated API calls. 
Some endpoints (notes, tags) require authentication but the app doesn't 
handle login/logout flows.

**Goal**: Implement a complete authentication system with login, 
registration, token management, protected routes, and proper error 
handling.

---

## 1. Backend API Analysis

### Authentication Endpoint

**POST `/api/token/`**
- **Purpose**: Obtain authentication token
- **Request Body** (JSON/form-data):
  ```json
  {
    "username": "string",
    "password": "string"
  }
  ```
- **Response** (200 OK):
  ```json
  {
    "token": "string"
  }
  ```
- **Authentication Type**: Token-based (Django REST Framework Token)
- **Header Format**: `Authorization: Token <token_value>`

### Protected Endpoints

The following endpoints require authentication (tokenAuth):

1. **Bible Endpoints**:
   - `GET /api/v1/bible/` - Retrieve Bible passages
   - `GET /api/v1/bible/translations/` - List translations

2. **Notes Endpoints** (user-specific):
   - `GET /api/v1/notes/` - List user's notes (or public notes if 
     unauthenticated)
   - `POST /api/v1/notes/` - Create note (requires auth)
   - `GET /api/v1/notes/{id}/` - Retrieve note
   - `PUT /api/v1/notes/{id}/` - Update note (requires auth)
   - `PATCH /api/v1/notes/{id}/` - Partial update (requires auth)
   - `DELETE /api/v1/notes/{id}/` - Delete note (requires auth)

3. **Tags Endpoints** (user-specific):
   - `GET /api/v1/tags/` - List user's tags (requires auth)
   - `POST /api/v1/tags/` - Create tag (requires auth)
   - `GET /api/v1/tags/{id}/` - Retrieve tag
   - `PUT /api/v1/tags/{id}/` - Update tag (requires auth)
   - `PATCH /api/v1/tags/{id}/` - Partial update (requires auth)
   - `DELETE /api/v1/tags/{id}/` - Delete tag (requires auth)

### Important Notes

- **No Registration Endpoint**: The API schema doesn't expose a user 
  registration endpoint. Users must be created via Django admin or a 
  separate registration system.
- **Token Format**: Must use `Token <token>` prefix (not `Bearer`)
- **Public Access**: Unauthenticated users can view public notes but 
  cannot create/edit/delete

---

## 2. Current Application State

### Existing Code Analysis

**API Layer** (`src/api.tsx`):
- ✅ All API functions defined (getNotes, getTags, addTagNote, etc.)
- ❌ No authentication headers added to fetch calls
- ❌ No token management
- ❌ No error handling for 401/403 responses

**State Management** (`src/store.tsx`):
- ✅ Zustand store with localStorage persistence
- ✅ Notes and tags state management
- ❌ No user/auth state
- ❌ No token storage

**Routing** (`src/routes/index.tsx`):
- ✅ React Router v7 implemented
- ✅ Bible, Notes, and Tag routes defined
- ❌ No protected routes
- ❌ No login/logout routes

**Environment**:
- ❌ No `.env` file for API URL configuration
- ❌ API URL hardcoded in multiple places

---

## 3. Implementation Plan

### Phase 1: Core Authentication Infrastructure (4-6 hours)

#### 1.1 Create Auth Store (1 hour)

**File**: `src/stores/authStore.tsx`

Create a new Zustand store for authentication state:

```typescript
interface AuthState {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  setToken: (token: string, username: string) => void;
}
```

**Features**:
- Persist token in localStorage
- Auto-logout on token expiration (optional)
- Loading states for async operations
- Error handling

#### 1.2 Create Auth API Functions (1 hour)

**File**: `src/api/auth.ts`

```typescript
// Login function
export const login = async (
  username: string, 
  password: string
): Promise<{ token: string }> => {
  // POST to /api/token/
}

// Validate token (optional - check if token is still valid)
export const validateToken = async (
  token: string
): Promise<boolean> => {
  // Try a simple authenticated request
}
```

#### 1.3 Create HTTP Interceptor/Wrapper (1.5 hours)

**File**: `src/utils/apiClient.ts`

Create a fetch wrapper that:
- Automatically adds `Authorization: Token <token>` header
- Handles 401 responses (auto-logout)
- Handles 403 responses (permission denied)
- Provides consistent error handling

```typescript
export const authenticatedFetch = async (
  url: string,
  options?: RequestInit
): Promise<Response> => {
  const token = useAuthStore.getState().token;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Token ${token}` }),
    ...options?.headers,
  };
  
  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 401) {
    // Token invalid/expired - logout
    useAuthStore.getState().logout();
    throw new Error('Authentication required');
  }
  
  return response;
};
```

#### 1.4 Update Existing API Functions (1.5 hours)

**Files**: `src/api.tsx`

Replace all `fetch()` calls with `authenticatedFetch()`:

- `getVersesFromApi()`
- `addTagNote()`
- `editNote()`
- `deleteNote()`
- `getTags()`
- `getNotes()`
- `getAvailableTranslations()`
- `getBibleAudioUrl()`

**Example**:
```typescript
// Before
const response = await fetch(url);

// After
const response = await authenticatedFetch(url);
```

---

### Phase 2: UI Components (3-4 hours)

#### 2.1 Login Page Component (1.5 hours)

**File**: `src/components/LoginPage.tsx`

Create a full-page login form using Mantine components:

```typescript
export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error } = useAuthStore();
  const navigate = useNavigate();
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await login(username, password);
    if (useAuthStore.getState().isAuthenticated) {
      navigate('/bible');
    }
  };
  
  return (
    <Container size={420} my={40}>
      <Title align="center">Welcome to Bible Research</Title>
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={handleSubmit}>
          <TextInput
            label="Username"
            placeholder="Your username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <PasswordInput
            label="Password"
            placeholder="Your password"
            required
            mt="md"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <Text color="red" size="sm" mt="sm">
              {error}
            </Text>
          )}
          <Button 
            fullWidth 
            mt="xl" 
            type="submit" 
            loading={isLoading}
          >
            Sign in
          </Button>
        </form>
      </Paper>
    </Container>
  );
}
```

**Features**:
- Username/password inputs
- Form validation
- Loading state during login
- Error display
- Mantine UI components (Paper, TextInput, PasswordInput, Button)

#### 2.2 User Menu Component (1 hour)

**File**: `src/components/UserMenu.tsx`

Create a user menu for the header/main menu:

```typescript
export function UserMenu() {
  const { username, logout, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  
  if (!isAuthenticated) {
    return (
      <Button onClick={() => navigate('/login')}>
        Sign In
      </Button>
    );
  }
  
  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <Button variant="subtle">
          <IconUser size={18} />
          <Text ml={8}>{username}</Text>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Account</Menu.Label>
        <Menu.Item icon={<IconUser size={14} />}>
          Profile
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item 
          icon={<IconLogout size={14} />}
          onClick={logout}
        >
          Logout
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
```

#### 2.3 Protected Route Component (0.5 hours)

**File**: `src/components/ProtectedRoute.tsx`

```typescript
export function ProtectedRoute({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  
  if (!isAuthenticated) {
    return (
      <Navigate 
        to="/login" 
        state={{ from: location }} 
        replace 
      />
    );
  }
  
  return <>{children}</>;
}
```

#### 2.4 Update MainMenu Component (1 hour)

**File**: `src/components/MainMenu.tsx`

Add UserMenu to the main menu:

```typescript
// Add to MainMenu
<UserMenu />
```

---

### Phase 3: Routing & Navigation (2-3 hours)

#### 3.1 Add Login Route (0.5 hours)

**File**: `src/routes/index.tsx`

```typescript
import { LoginPage } from '../components/LoginPage';

export function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/bible" replace />} />
      
      {/* Bible routes (public - can view, but can't create notes) */}
      <Route path="/bible" element={<BibleRoute />} />
      <Route path="/bible/:book/:chapter" element={<BibleRoute />} />
      
      {/* Protected routes - require authentication */}
      <Route 
        path="/notes" 
        element={
          <ProtectedRoute>
            <NotesRoute />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/notes/tag/:tagId" 
        element={
          <ProtectedRoute>
            <TagNotesRoute />
          </ProtectedRoute>
        } 
      />
      
      <Route path="*" element={<Navigate to="/bible" replace />} />
    </Routes>
  );
}
```

#### 3.2 Update Navigation Guards (1 hour)

Add conditional rendering based on auth state:

**Files to update**:
- `src/components/MainMenu.tsx` - Show/hide Notes button
- `src/components/SubHeader.tsx` - Show/hide Notes toggle
- `src/components/Passage.tsx` - Show/hide "Add Note" button

```typescript
// Example in Passage.tsx
const { isAuthenticated } = useAuthStore();

{isAuthenticated && (
  <Button onClick={handleAddNote}>
    Add Note
  </Button>
)}
```

#### 3.3 Redirect After Login (0.5 hours)

Update LoginPage to redirect to previous location:

```typescript
const location = useLocation();
const from = location.state?.from?.pathname || '/bible';

// After successful login
navigate(from, { replace: true });
```

---

### Phase 4: Environment & Configuration (1 hour)

#### 4.1 Create Environment Variables (0.5 hours)

**File**: `.env`

```bash
VITE_API_BASE_URL=https://bibleresearchapi.vercel.app
```

**File**: `.env.example`

```bash
# Bible Research API Base URL
VITE_API_BASE_URL=https://bibleresearchapi.vercel.app
```

**Update `.gitignore`**:
```
.env
.env.local
```

#### 4.2 Create API Config (0.5 hours)

**File**: `src/config/api.ts`

```typescript
export const API_BASE_URL = 
  import.meta.env.VITE_API_BASE_URL || 
  'https://bibleresearchapi.vercel.app';

export const API_ENDPOINTS = {
  token: `${API_BASE_URL}/api/token/`,
  bible: `${API_BASE_URL}/api/v1/bible/`,
  translations: `${API_BASE_URL}/api/v1/bible/translations/`,
  notes: `${API_BASE_URL}/api/v1/notes/`,
  tags: `${API_BASE_URL}/api/v1/tags/`,
};
```

**Update all API functions** to use `API_ENDPOINTS` instead of 
hardcoded URLs.

---

### Phase 5: Error Handling & UX (2-3 hours)

#### 5.1 Global Error Boundary (1 hour)

**File**: `src/components/ErrorBoundary.tsx`

```typescript
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container>
          <Title order={2}>Something went wrong</Title>
          <Text>{this.state.error?.message}</Text>
          <Button onClick={() => this.setState({ hasError: false })}>
            Try again
          </Button>
        </Container>
      );
    }

    return this.props.children;
  }
}
```

#### 5.2 API Error Notifications (1 hour)

**File**: `src/utils/notifications.ts`

Use Mantine notifications for user feedback:

```typescript
import { notifications } from '@mantine/notifications';

export const showErrorNotification = (message: string) => {
  notifications.show({
    title: 'Error',
    message,
    color: 'red',
    icon: <IconX size={18} />,
  });
};

export const showSuccessNotification = (message: string) => {
  notifications.show({
    title: 'Success',
    message,
    color: 'green',
    icon: <IconCheck size={18} />,
  });
};
```

Update API functions to show notifications on error/success.

#### 5.3 Loading States (1 hour)

Add loading indicators for:
- Login form (already in LoginPage)
- Notes fetching
- Tags fetching
- Bible content loading

Use Mantine's `Loader` or `LoadingOverlay` components.

---

### Phase 6: Testing (3-4 hours)

#### 6.1 Auth Store Tests (1 hour)

**File**: `src/stores/authStore.test.ts`

Test:
- ✅ Login success
- ✅ Login failure
- ✅ Logout
- ✅ Token persistence
- ✅ Auto-logout on 401

#### 6.2 Protected Route Tests (1 hour)

**File**: `src/components/ProtectedRoute.test.tsx`

Test:
- ✅ Redirects to login when not authenticated
- ✅ Renders children when authenticated
- ✅ Preserves redirect location

#### 6.3 API Integration Tests (1-2 hours)

**File**: `src/api/auth.test.ts`

Use MSW (Mock Service Worker) to test:
- ✅ Login API call
- ✅ Authenticated requests include token
- ✅ 401 response triggers logout
- ✅ Error handling

#### 6.4 Component Tests (1 hour)

Test:
- ✅ LoginPage form submission
- ✅ UserMenu rendering (authenticated/unauthenticated)
- ✅ Conditional rendering in Passage, MainMenu, etc.

---

### Phase 7: Documentation & Polish (1-2 hours)

#### 7.1 Update DEVELOPER_GUIDE.md (0.5 hours)

Add sections:
- Authentication flow
- How to obtain a token
- Protected routes
- Environment variables

#### 7.2 Update README.md (0.5 hours)

Add:
- Setup instructions (`.env` file)
- Login credentials (for development)
- Authentication requirements

#### 7.3 Code Cleanup (1 hour)

- Remove console.logs
- Add TypeScript types
- Format code
- Run linter

---

## 4. File Structure

```
src/
├── api/
│   ├── auth.ts              # NEW: Auth API functions
│   └── index.ts             # Re-export all API functions
├── api.tsx                  # MODIFIED: Add auth headers
├── components/
│   ├── ErrorBoundary.tsx    # NEW: Global error handling
│   ├── LoginPage.tsx        # NEW: Login form
│   ├── MainMenu.tsx         # MODIFIED: Add UserMenu
│   ├── Passage.tsx          # MODIFIED: Conditional note buttons
│   ├── ProtectedRoute.tsx   # NEW: Route guard
│   ├── SubHeader.tsx        # MODIFIED: Conditional notes toggle
│   └── UserMenu.tsx         # NEW: User dropdown menu
├── config/
│   └── api.ts               # NEW: API configuration
├── routes/
│   └── index.tsx            # MODIFIED: Add login route, protected 
│                            #          routes
├── stores/
│   ├── authStore.tsx        # NEW: Auth state management
│   └── bibleStore.tsx       # RENAMED from store.tsx
├── utils/
│   ├── apiClient.ts         # NEW: Authenticated fetch wrapper
│   └── notifications.ts     # NEW: Notification helpers
├── App.tsx                  # MODIFIED: Add ErrorBoundary
└── main.tsx                 # MODIFIED: Add Notifications provider
```

---

## 5. Implementation Timeline

| Phase | Task | Estimated Time |
|-------|------|----------------|
| 1 | Core Auth Infrastructure | 4-6 hours |
| 2 | UI Components | 3-4 hours |
| 3 | Routing & Navigation | 2-3 hours |
| 4 | Environment & Config | 1 hour |
| 5 | Error Handling & UX | 2-3 hours |
| 6 | Testing | 3-4 hours |
| 7 | Documentation & Polish | 1-2 hours |
| **Total** | | **16-23 hours** |

---

## 6. User Registration Strategy

Since the API doesn't expose a registration endpoint, consider these 
options:

### Option A: Admin-Created Accounts (Recommended for MVP)
- Users contact admin to create accounts
- Admin creates users via Django admin panel
- Simple, secure, no additional code needed

### Option B: Future Registration Endpoint
- Request backend team to add `/api/register/` endpoint
- Implement registration form in React app
- Add email verification (optional)

### Option C: Social Auth (Advanced)
- Integrate OAuth (Google, GitHub, etc.)
- Requires backend support for social auth
- Better UX but more complex

**Recommendation**: Start with Option A, plan for Option B in future.

---

## 7. Security Considerations

### 7.1 Token Storage
- ✅ Store in localStorage (current plan)
- ⚠️ Vulnerable to XSS attacks
- 🔒 Alternative: httpOnly cookies (requires backend changes)

### 7.2 Token Expiration
- ❓ API doesn't specify token expiration
- 📝 Implement token refresh if API supports it
- 🔄 Or: Force re-login after X days

### 7.3 HTTPS
- ✅ API uses HTTPS (bibleresearchapi.vercel.app)
- ✅ Tokens encrypted in transit

### 7.4 Input Validation
- ✅ Validate username/password format
- ✅ Sanitize user inputs
- ✅ Use Mantine's built-in validation

---

## 8. Testing Strategy

### 8.1 Unit Tests
- Auth store actions
- API functions
- Utility functions

### 8.2 Integration Tests
- Login flow (form → API → store → redirect)
- Protected routes
- Auto-logout on 401

### 8.3 E2E Tests (Optional)
- Full user journey: login → create note → logout
- Use Playwright or Cypress

### 8.4 Manual Testing Checklist
- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Logout
- [ ] Access protected route while logged out (should redirect)
- [ ] Access protected route while logged in (should work)
- [ ] Create/edit/delete note (authenticated)
- [ ] View public notes (unauthenticated)
- [ ] Token persists after page refresh
- [ ] Auto-logout on 401 response
- [ ] Browser back/forward with auth state

---

## 9. Migration Path

### Step 1: Backward Compatibility
- Keep existing functionality working
- Auth is optional initially
- Unauthenticated users can still view Bible and public notes

### Step 2: Gradual Rollout
1. Deploy auth infrastructure (no UI changes)
2. Add login page (accessible but not required)
3. Add "Sign In" button to header
4. Make notes/tags require auth
5. Show "Sign in to create notes" message

### Step 3: Full Migration
- All users encouraged to create accounts
- Public notes still accessible
- Private notes require auth

---

## 10. Known Limitations & Future Enhancements

### Current Limitations
- ❌ No user registration (admin-only)
- ❌ No password reset
- ❌ No email verification
- ❌ No token refresh
- ❌ No role-based permissions

### Future Enhancements
- ✨ User profile page
- ✨ Account settings
- ✨ Password change
- ✨ Email notifications
- ✨ Social auth (Google, GitHub)
- ✨ Two-factor authentication
- ✨ API rate limiting awareness
- ✨ Offline mode with sync

---

## 11. Success Criteria

The authentication implementation is complete when:

1. ✅ Users can log in with username/password
2. ✅ Token is stored and persisted across sessions
3. ✅ All API requests include auth token when available
4. ✅ Protected routes redirect to login
5. ✅ Users can log out
6. ✅ 401 responses trigger auto-logout
7. ✅ UI shows user's logged-in state
8. ✅ Notes/tags are user-specific
9. ✅ Public notes viewable without auth
10. ✅ All tests pass
11. ✅ Documentation updated
12. ✅ No breaking changes to existing functionality

---

## 12. Rollback Plan

If issues arise during implementation:

1. **Revert to previous branch**: 
   `git checkout feature/notes-tag-route`
2. **Keep auth optional**: Don't enforce login immediately
3. **Feature flag**: Add `VITE_ENABLE_AUTH=true` to toggle auth on/off
4. **Gradual rollout**: Deploy to staging first, test thoroughly

---

## 13. Next Steps

1. **Review this plan** with team/stakeholders
2. **Create GitHub issues** for each phase
3. **Set up development environment** (`.env` file)
4. **Obtain test credentials** from backend admin
5. **Start Phase 1**: Core Auth Infrastructure
6. **Test incrementally** after each phase
7. **Deploy to staging** before production

---

## Appendix A: API Examples

### Login Request
```bash
curl -X POST https://bibleresearchapi.vercel.app/api/token/ \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "testpass123"}'
```

**Response**:
```json
{
  "token": "9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b"
}
```

### Authenticated Request
```bash
curl -X GET https://bibleresearchapi.vercel.app/api/v1/notes/ \
  -H "Authorization: Token 9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b"
```

---

## Appendix B: TypeScript Interfaces

```typescript
// Auth types
export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthToken {
  token: string;
}

export interface User {
  username: string;
  // Add more fields if API provides them
}

export interface AuthState {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

// API Error types
export interface ApiError {
  message: string;
  status: number;
  details?: Record<string, string[]>;
}
```

---

## Appendix C: Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `VITE_API_BASE_URL` | Bible Research API base URL | 
`https://bibleresearchapi.vercel.app` | No |
| `VITE_ENABLE_AUTH` | Enable/disable auth (feature flag) | `true` | 
No |

---

**Document Version**: 1.0  
**Created**: 2026-02-28  
**Author**: AI Assistant  
**Status**: Draft - Pending Review
