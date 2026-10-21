# BookNest — REST API Specification & Design

This document details all REST endpoints provided by the BookNest backend service, including authentication, book catalogue, shopping cart, orders, optical scanner, AI recommendations, reviews, and administration.

---

## 1. Global Conventions

### 1.1 Base URL
All API routes are served under `/api`:
```text
http://localhost:5000/api
```

### 1.2 Authentication
Protected endpoints require an `Authorization` header containing a valid Bearer JSON Web Token:
```http
Authorization: Bearer <jwt_token>
```

### 1.3 Standard Response Format
Successful JSON responses return structured objects or arrays directly. Error responses strictly conform to:
```json
{
  "error": "Human-readable error description",
  "details": null
}
```

### 1.4 HTTP Status Codes
| Status Code | Meaning | Typical Usage |
|:---|:---|:---|
| **200 OK** | Request succeeded | Retrieval, successful updates |
| **201 Created** | Resource created | Registration, order placement, review posting |
| **400 Bad Request** | Validation failed | Missing required fields, malformed inputs |
| **401 Unauthorized** | Missing or invalid auth | Missing JWT, expired token, invalid credentials |
| **403 Forbidden** | Insufficient permissions | Student attempting to access admin routes |
| **404 Not Found** | Resource missing | Book ID not in database, route not found |
| **409 Conflict** | State collision | Idempotency key reused with mismatched payload |
| **413 Payload Too Large** | Request exceeds limit | JSON > 100KB, image upload > 15MB |
| **429 Too Many Requests** | Rate limit exceeded | Exceeded window quota, includes `Retry-After` header |
| **500 Internal Error** | Unhandled exception | Sanitized in production |

---

## 2. API Catalog & Endpoint Details

### 2.1 Health Check
- **`GET /api/health`**
  - **Auth**: None
  - **Response (200)**:
    ```json
    {
      "status": "ok",
      "service": "BookNest Academic Bookstore API",
      "version": "2.0.0",
      "database": "SQLite (WAL mode)",
      "timestamp": "2026-10-21T10:00:00.000Z"
    }
    ```

---

### 2.2 Authentication & User Session (`/api/auth`)
- **`POST /api/auth/register`**
  - **Payload**: `{ "email": string, "password": string, "fullName": string, "phone"?: string }`
  - **Response (201)**: `{ "user": { "id", "email", "fullName", "role" }, "token": string }`
- **`POST /api/auth/login`**
  - **Payload**: `{ "email": string, "password": string }`
  - **Response (200)**: `{ "user": { "id", "email", "fullName", "role" }, "token": string }`
- **`GET /api/auth/me`**
  - **Auth**: Required
  - **Response (200)**: `{ "user": { "id", "email", "fullName", "role" } }`
- **`GET /api/auth/google`** & **`GET /api/auth/google/callback`**
  - OAuth 2.0 flow for Google SSO authentication.

---

### 2.3 Books Catalogue (`/api/books`)
- **`GET /api/books`**
  - **Query Params**:
    - `category`: Category name filter
    - `search`: Title, author, or ISBN search query
    - `page`: Page number (default: 1)
    - `limit`: Items per page (default: 50, max: 100)
    - `sort`: `price_asc` | `price_desc` | `rating` | `newest`
  - **Response (200)**: `{ "books": [...], "total": number, "page": number, "totalPages": number }`
- **`GET /api/books/:id`**
  - **Response (200)**: Single book record with ratings and review count.
  - **Errors**: `404 Not Found` if book does not exist or is archived.
- **`GET /api/books/isbn/:isbn`**
  - **Response (200)**: Book record matching sanitized ISBN-10 or ISBN-13.

---

### 2.4 Shopping Cart (`/api/cart`)
- **`GET /api/cart`**
  - **Auth**: Optional (falls back to client guest cart)
  - **Response (200)**: `{ "items": [{ "bookId", "quantity", "book" }] }`
- **`POST /api/cart`**
  - **Auth**: Optional
  - **Payload**: `{ "bookId": number, "quantity": number }`
  - **Response (200)**: Updated cart items.
- **`DELETE /api/cart/:bookId`**
  - **Response (200)**: Updated cart.

---

### 2.5 Wishlist (`/api/wishlist`)
- **`GET /api/wishlist`**
  - **Auth**: Required
  - **Response (200)**: `{ "bookIds": [number] }`
- **`POST /api/wishlist/toggle`**
  - **Auth**: Required
  - **Payload**: `{ "bookId": number }`
  - **Response (200)**: `{ "wishlisted": boolean, "bookIds": [number] }`

---

### 2.6 Orders & Checkout (`/api/orders`)
- **`POST /api/orders`**
  - **Auth**: Required
  - **Headers**: `Idempotency-Key: <unique_uuid>` (recommended)
  - **Payload**:
    ```json
    {
      "items": [{ "bookId": 1, "quantity": 2 }],
      "shippingAddress": "Campus Dorm Hall B, Room 304",
      "paymentMethod": "Credit Card",
      "couponCode": "WELCOME10"
    }
    ```
  - **Response (201)**: Created order object with order number and item breakdown.
  - **Response (200 - Idempotent Replay)**: Cached order with header `Idempotent-Replayed: true`.
  - **Errors**:
    - `400 Bad Request`: Out of stock item, invalid address, non-catalog item.
    - `409 Conflict`: Reused idempotency key with modified payload.
- **`GET /api/orders`**
  - **Auth**: Required
  - **Response (200)**: List of orders belonging to the authenticated user.
- **`GET /api/orders/:id`**
  - **Auth**: Required (Owner or Admin only)
  - **Response (200)**: Complete order details with line items.

---

### 2.7 AI Reading Advisor (`/api/recommendations`)
- **`POST /api/recommendations`**
  - **Auth**: Required
  - **Payload**: `{ "prompt": string, "interests"?: string[] }`
  - **Rate Limit**: 20 requests per 15 minutes.
  - **Response (200)**:
    ```json
    {
      "message": "Based on your interest in algorithms, here are top faculty-recommended titles:",
      "recommendedBooks": [
        {
          "id": 12,
          "title": "Introduction to Algorithms",
          "author": "Thomas H. Cormen",
          "price": 89.99,
          "rating": 4.9,
          "coverImage": "https://..."
        }
      ],
      "source": "gemini" // or "catalog_fallback"
    }
    ```

---

### 2.8 Optical Scanner & Vision Lookup (`/api/scanner`)
- **`POST /api/scanner/lookup`**
  - **Auth**: None (Public storefront allowed)
  - **Payload**: `{ "isbn": string }`
  - **Response (200)**:
    ```json
    {
      "found": true,
      "book": { ... },
      "isLocalCatalog": true
    }
    ```
- **`POST /api/scanner/vision`**
  - **Auth**: None
  - **Payload (up to 15MB)**: `{ "imageBase64": "data:image/jpeg;base64,..." }`
  - **Response (200)**: Matched book record or detected metadata.

---

### 2.9 Administrator API (`/api/admin`)
- **`GET /api/admin/metrics`**
  - **Auth**: Required (`role="admin"`)
  - **Response (200)**: Total revenue, order count, registered students, inventory summary.
- **`GET /api/admin/orders`**
  - **Auth**: Required (`role="admin"`)
  - **Response (200)**: All customer orders with fulfillment controls.
- **`PATCH /api/admin/orders/:id/status`**
  - **Auth**: Required (`role="admin"`)
  - **Payload**: `{ "status": "Processing" | "Shipped" | "Delivered" | "Cancelled" }`
  - **Response (200)**: Updated order record. Restores inventory on `Cancelled`.
- **`POST /api/admin/books`** & **`PUT /api/admin/books/:id`**
  - **Auth**: Required (`role="admin"`)
  - **Capabilities**: Add new books, update stock and prices, archive/unarchive books.
