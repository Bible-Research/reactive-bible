# Creating a Test User for Authentication

## Problem

The Bible Research API has **auto-authentication middleware** that creates users automatically based on device and browser language. However, these auto-created users **do not have passwords** and cannot be used for login.

Example auto-created username:
```
fil Macintosh; Intel Mac OS X 10_15_7
```

When you try to login with an auto-created account, you'll get a **400 Bad Request** error because the user has no password set.

## Solution

You need to create a **real user account with a password** via the Django admin panel.

---

## Option 1: Create User via Django Admin (Recommended)

### Step 1: Access Django Admin
Navigate to the Django admin panel:
```
https://bibleresearchapi.vercel.app/admin/
```

Or if running locally:
```
http://localhost:8000/admin/
```

### Step 2: Login as Superuser
You'll need superuser credentials. If you don't have them, see Option 2 below.

### Step 3: Create a New User
1. Click on **"Users"** under the **Authentication and Authorization** section
2. Click **"Add User"** button (top right)
3. Enter:
   - **Username:** `testuser` (or any username you prefer)
   - **Password:** Enter a secure password
   - **Password confirmation:** Re-enter the same password
4. Click **"Save"**

### Step 4: (Optional) Set Additional Details
After creating the user, you can set:
- First name
- Last name
- Email address
- Staff status (if needed)
- Superuser status (if needed)

### Step 5: Test Login
Now you can login to the React app with:
- **Username:** `testuser`
- **Password:** The password you set

---

## Option 2: Create Superuser via Command Line

If you have access to the backend server, you can create a superuser:

```bash
# Navigate to the backend project directory
cd /path/to/bible-research

# Run the createsuperuser command
python manage.py createsuperuser

# Follow the prompts:
# Username: admin
# Email address: admin@example.com
# Password: ********
# Password (again): ********
```

Then use this superuser to:
1. Login to Django admin
2. Create regular users for testing

---

## Option 3: Create User via Django Shell

If you have backend access but prefer the shell:

```bash
python manage.py shell
```

Then in the Python shell:

```python
from django.contrib.auth.models import User

# Create a new user
user = User.objects.create_user(
    username='testuser',
    email='test@example.com',
    password='your_secure_password'
)

# Verify the user was created
print(f"User created: {user.username}")

# Exit the shell
exit()
```

---

## Troubleshooting

### Error: "Invalid credentials. Please ensure you have a valid account..."

This means:
1. The username doesn't exist, OR
2. The user exists but has no password set (auto-created account)

**Solution:** Create a new user with a password via Django admin.

### Error: "Invalid username or password"

This means:
1. The username exists but the password is wrong, OR
2. The username doesn't exist

**Solution:** Double-check your credentials or create a new user.

### Auto-Created Accounts

If you see users like:
- `fil Macintosh; Intel Mac OS X 10_15_7`
- `en Android 12; Mobile`

These are **auto-created by the middleware** and have **no passwords**. You cannot use them for login.

**Solution:** Create a proper user account as described above.

---

## Backend Middleware Explanation

The backend has a `DeviceAndCountryMiddleware` that:

1. Extracts device info from User-Agent header
2. Detects primary language from Accept-Language header
3. Auto-creates users with format: `{language} {device}`
4. These users have **no password** and are for tracking purposes only

For actual authentication, you must create users with passwords.

---

## Quick Test User

For quick testing, create a user with:
- **Username:** `testuser`
- **Password:** `Test123!@#`

Then login to the React app at:
```
http://localhost:5174/login
```

---

## Security Note

⚠️ **Never use weak passwords in production!**

For production:
- Use strong, unique passwords
- Enable 2FA if available
- Limit user permissions appropriately
- Regularly audit user accounts
