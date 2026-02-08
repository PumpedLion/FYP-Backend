# YourTales API - Postman Testing Guide

## Base URL
```
http://localhost:8000
```

## Authentication
For protected routes, include the JWT token in the Authorization header:
```
Authorization: Bearer <your_token_here>
```

---

## 📋 API Endpoints

### 1. Welcome Endpoint
**GET** `/`
- **Description**: Welcome message
- **Auth Required**: No
- **Request Body**: None
- **Response**: 
```json
"Welcome to the YourTales API"
```

---

### 2. Register User
**POST** `/api/users/register`
- **Description**: Register a new user (sends OTP via email)
- **Auth Required**: No
- **Request Body** (JSON):
```json
{
  "fullName": "John Doe",
  "email": "john.doe@example.com",
  "password": "SecurePassword123",
  "role": "READER"
}
```
- **Fields**:
  - `fullName` (required): User's full name
  - `email` (required): User's email address
  - `password` (required): User's password
  - `role` (optional): User role - `ADMIN`, `AUTHOR`, `EDITOR`, `PUBLISHER`, or `READER` (default: `READER`)
- **Success Response** (201):
```json
{
  "message": "User registered successfully. Please verify your OTP.",
  "userId": 1
}
```
- **Error Response** (400):
```json
{
  "message": "Email already in use"
}
```

---

### 3. Verify OTP
**POST** `/api/users/verify-otp`
- **Description**: Verify user account with OTP sent via email
- **Auth Required**: No
- **Request Body** (JSON):
```json
{
  "email": "john.doe@example.com",
  "otp": "12345"
}
```
- **Fields**:
  - `email` (required): User's email address
  - `otp` (required): 5-digit OTP code received via email
- **Success Response** (200):
```json
{
  "message": "Account verified successfully. You may now login."
}
```
- **Error Response** (400):
```json
{
  "message": "Invalid OTP."
}
```

---

### 4. Login
**POST** `/api/users/login`
- **Description**: Login user and get JWT token
- **Auth Required**: No
- **Request Body** (JSON):
```json
{
  "email": "john.doe@example.com",
  "password": "SecurePassword123"
}
```
- **Fields**:
  - `email` (required): User's email address
  - `password` (required): User's password
- **Success Response** (200):
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "role": "READER"
  }
}
```
- **Error Response** (401):
```json
{
  "message": "Invalid email or password"
}
```
- **Error Response** (403):
```json
{
  "message": "Account not verified. Please verify OTP."
}
```

---

### 5. Get My Profile
**GET** `/api/users/myProfile`
- **Description**: Get logged-in user's profile
- **Auth Required**: Yes
- **Headers**:
```
Authorization: Bearer <token_from_login>
```
- **Request Body**: None
- **Success Response** (200):
```json
{
  "user": {
    "id": 1,
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "role": "READER",
    "bio": "My bio text",
    "avatarUrl": "https://example.com/avatar.jpg",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 6. Get All Users
**GET** `/api/users/allUsers`
- **Description**: Get list of all users
- **Auth Required**: Yes
- **Headers**:
```
Authorization: Bearer <token_from_login>
```
- **Request Body**: None
- **Success Response** (200):
```json
{
  "users": [
    {
      "id": 1,
      "fullName": "John Doe",
      "email": "john.doe@example.com",
      "role": "READER",
      "avatarUrl": "https://example.com/avatar.jpg"
    },
    {
      "id": 2,
      "fullName": "Jane Smith",
      "email": "jane.smith@example.com",
      "role": "AUTHOR",
      "avatarUrl": null
    }
  ]
}
```

---

### 7. Edit Profile
**PATCH** `/api/users/editProfile`
- **Description**: Update user profile
- **Auth Required**: Yes
- **Headers**:
```
Authorization: Bearer <token_from_login>
```
- **Request Body** (JSON):
```json
{
  "id": 1,
  "fullName": "John Updated Doe",
  "bio": "Updated bio text"
}
```
- **Fields**:
  - `id` (required): User ID
  - `fullName` (optional): Updated full name
  - `bio` (optional): Updated bio text
- **Success Response** (200):
```json
{
  "message": "Profile updated",
  "user": {
    "id": 1,
    "fullName": "John Updated Doe",
    "email": "john.doe@example.com",
    "passwordHash": "...",
    "bio": "Updated bio text",
    "avatarUrl": null,
    "role": "READER",
    "otpCode": null,
    "otpVerified": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T01:00:00.000Z"
  }
}
```

---

### 8. Delete User
**DELETE** `/api/users/deleteUser`
- **Description**: Delete a user account
- **Auth Required**: Yes
- **Headers**:
```
Authorization: Bearer <token_from_login>
```
- **Request Body** (JSON):
```json
{
  "id": 1
}
```
- **Fields**:
  - `id` (required): User ID to delete
- **Success Response** (200):
```json
{
  "message": "User deleted successfully"
}
```

---

## 🔐 Testing Flow

### Step-by-Step Testing:

1. **Register a new user**
   - POST `/api/users/register`
   - Check email for OTP code

2. **Verify OTP**
   - POST `/api/users/verify-otp`
   - Use OTP from email

3. **Login**
   - POST `/api/users/login`
   - **Save the token** from response

4. **Test Protected Routes**
   - Add token to Authorization header: `Bearer <token>`
   - GET `/api/users/myProfile`
   - GET `/api/users/allUsers`
   - PATCH `/api/users/editProfile`
   - DELETE `/api/users/deleteUser`

---

## 📝 Postman Collection Setup:

### Environment Variables (Optional but Recommended):
- `base_url`: `http://localhost:8000`
- `token`: (will be set after login)

### Pre-request Script (for Login endpoint):
After login, automatically save token:
```javascript
if (pm.response.code === 200) {
    const jsonData = pm.response.json();
    pm.environment.set("token", jsonData.token);
}
```

### Authorization Header (for Protected Routes):
In Postman, go to **Authorization** tab:
- Type: `Bearer Token`
- Token: `{{token}}` (uses environment variable)

---

## ⚠️ Important Notes:

1. **Server must be running**: Make sure `npm run dev` is running on port 8000
2. **Database must be connected**: Ensure PostgreSQL is running and `DATABASE_URL` is set
3. **Email Configuration**: For OTP to work, set `SMTP_USER` and `SMTP_PASS` in `.env`
4. **JWT Secret**: Set `JWT_SECRET` in `.env` (defaults to 'secret' if not set)
5. **User Roles**: Valid roles are: `ADMIN`, `AUTHOR`, `EDITOR`, `PUBLISHER`, `READER`

---

## 🧪 Sample Test Data:

### Register Request:
```json
{
  "fullName": "Test User",
  "email": "test@example.com",
  "password": "Test123456",
  "role": "READER"
}
```

### Login Request:
```json
{
  "email": "test@example.com",
  "password": "Test123456"
}
```

### Edit Profile Request:
```json
{
  "id": 1,
  "fullName": "Updated Test User",
  "bio": "This is my updated bio"
}
```





