# Backend API: Sales Booking Creation Endpoint

## Overview
This document describes the API endpoint for creating bookings in the bookings collection by Sales department users. This endpoint is specifically for **UAE TO PINAS** (UAE TO PH) bookings.

## Endpoint
```
POST /api/bookings
```

## Authentication
- Requires authentication token in the request header
- User must belong to Sales department (or have appropriate permissions)

## Request Body

The request body should be a JSON object with the following structure:

```json
{
  "service": "uae-to-pinas",
  "service_code": "UAE_TO_PH",
  "source": "sales",
  "status": "pending",
  "review_status": "pending",
  "sender": {
    "firstName": "John",
    "lastName": "Doe",
    "fullName": "John Doe",
    "name": "John Doe",
    "country": "UNITED ARAB EMIRATES",
    "address": "Street 123, Dubai",
    "addressLine1": "Street 123, Dubai",
    "completeAddress": "Street 123, Dubai, United Arab Emirates",
    "deliveryOption": "pickup",
    "phone": "+971501234567",
    "phoneNumber": "+971501234567",
    "contactNo": "+971501234567",
    "email": "sender@example.com",
    "emailAddress": "sender@example.com",
    "agentName": "Agent Name (optional)"
  },
  "receiver": {
    "firstName": "Juan",
    "lastName": "Dela Cruz",
    "fullName": "Juan Dela Cruz",
    "name": "Juan Dela Cruz",
    "country": "PHILIPPINES",
    "address": "123 Main Street, Manila",
    "addressLine1": "123 Main Street, Manila",
    "completeAddress": "123 Main Street, Manila, Philippines",
    "deliveryOption": "pickup",
    "phone": "+639123456789",
    "phoneNumber": "+639123456789",
    "contactNo": "+639123456789",
    "email": "receiver@example.com",
    "emailAddress": "receiver@example.com"
  },
  "items": [
    {
      "commodity": "Electronics",
      "name": "Laptop",
      "description": "MacBook Pro",
      "qty": 1,
      "quantity": 1
    }
  ],
  "identityDocuments": {
    "eidFrontImage": "base64_encoded_image_string",
    "eidBackImage": "base64_encoded_image_string",
    "philippinesIdFront": "base64_encoded_image_string",
    "philippinesIdBack": "base64_encoded_image_string"
  },
  "insured": true,
  "declaredAmount": 1000.00,
  "created_by_employee_id": "employee_id_here"
}
```

## Field Descriptions

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `service` | string | Yes | Service type: "uae-to-pinas" |
| `service_code` | string | Yes | Service code: "UAE_TO_PH" |
| `source` | string | Yes | Source of booking: "sales" |
| `status` | string | Yes | Initial status: "pending" |
| `review_status` | string | Yes | Review status: "pending" |
| `sender` | object | Yes | Sender information (UAE) |
| `receiver` | object | Yes | Receiver information (Philippines) |
| `items` | array | Yes | Array of items being shipped |
| `identityDocuments` | object | Yes | Identity document images (base64 encoded) |
| `insured` | boolean | Yes | Whether shipment is insured |
| `declaredAmount` | number/null | Conditional | Declared value if insured, null otherwise |
| `created_by_employee_id` | string | Yes | ID of employee creating the booking |

### Sender Object (UAE)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `firstName` | string | Yes | Sender's first name |
| `lastName` | string | Yes | Sender's last name |
| `fullName` | string | Yes | Full name (firstName + lastName) |
| `name` | string | Yes | Full name (same as fullName) |
| `country` | string | Yes | Must be "UNITED ARAB EMIRATES" |
| `address` | string | Yes | Address line 1 |
| `addressLine1` | string | Yes | Address line 1 (same as address) |
| `completeAddress` | string | Yes | Complete address with country |
| `deliveryOption` | string | Yes | "pickup" or "warehouse" |
| `phone` | string | Yes | Phone number with country code |
| `phoneNumber` | string | Yes | Phone number (same as phone) |
| `contactNo` | string | Yes | Contact number (same as phone) |
| `email` | string | No | Email address (optional) |
| `emailAddress` | string | No | Email address (optional, same as email) |
| `agentName` | string | No | Agent name (optional) |

### Receiver Object (Philippines)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `firstName` | string | Yes | Receiver's first name |
| `lastName` | string | Yes | Receiver's last name |
| `fullName` | string | Yes | Full name (firstName + lastName) |
| `name` | string | Yes | Full name (same as fullName) |
| `country` | string | Yes | Must be "PHILIPPINES" |
| `address` | string | Yes | Address line 1 |
| `addressLine1` | string | Yes | Address line 1 (same as address) |
| `completeAddress` | string | Yes | Complete address with country |
| `deliveryOption` | string | Yes | "pickup" or "delivery" |
| `phone` | string | Yes | Phone number with country code |
| `phoneNumber` | string | Yes | Phone number (same as phone) |
| `contactNo` | string | Yes | Contact number (same as phone) |
| `email` | string | No | Email address (optional) |
| `emailAddress` | string | No | Email address (optional, same as email) |

### Items Array

Each item object should have:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `commodity` | string | Yes | Item commodity/category |
| `name` | string | Yes | Item name |
| `description` | string | No | Item description (optional) |
| `qty` | number | Yes | Quantity |
| `quantity` | number | Yes | Quantity (same as qty) |

### Identity Documents Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `eidFrontImage` | string | Yes | Base64 encoded UAE ID front image |
| `eidBackImage` | string | Yes | Base64 encoded UAE ID back image |
| `philippinesIdFront` | string | Yes | Base64 encoded Philippines ID front image |
| `philippinesIdBack` | string | Yes | Base64 encoded Philippines ID back image |

**Note**: All images should be base64 encoded strings (without the `data:image/...;base64,` prefix).

## Delivery Options

### Sender Delivery Options
- `"pickup"`: Pickup from home
- `"warehouse"`: Deliver to warehouse

### Receiver Delivery Options
- `"pickup"`: Pickup from warehouse
- `"delivery"`: Deliver to address

## Insurance

- If `insured` is `true`, `declaredAmount` must be provided and must be a positive number
- If `insured` is `false`, `declaredAmount` should be `null`

## Response

### Success Response (201 Created)

```json
{
  "success": true,
  "data": {
    "_id": "booking_id_here",
    "service": "uae-to-pinas",
    "service_code": "UAE_TO_PH",
    "status": "pending",
    "review_status": "pending",
    "sender": { ... },
    "receiver": { ... },
    "items": [ ... ],
    "identityDocuments": { ... },
    "insured": true,
    "declaredAmount": 1000.00,
    "created_by_employee_id": "employee_id_here",
    "createdAt": "2026-01-06T12:00:00.000Z",
    "updatedAt": "2026-01-06T12:00:00.000Z"
  }
}
```

### Error Response (400 Bad Request)

```json
{
  "success": false,
  "error": "Validation error message"
}
```

### Error Response (401 Unauthorized)

```json
{
  "success": false,
  "error": "Unauthorized"
}
```

### Error Response (500 Internal Server Error)

```json
{
  "success": false,
  "error": "Internal server error message"
}
```

## Validation Rules

1. **Required Fields**: All required fields must be provided
2. **Service Code**: Must be "UAE_TO_PH" for UAE to Philippines bookings
3. **Countries**: 
   - Sender country must be "UNITED ARAB EMIRATES"
   - Receiver country must be "PHILIPPINES"
4. **Phone Numbers**: Should include country code (e.g., +971 for UAE, +63 for Philippines)
5. **Email**: Must be valid email format if provided (optional)
6. **Items**: At least one item is required
7. **Identity Documents**: All four images (UAE ID front/back, Philippines ID front/back) are required
8. **Insurance**: If `insured` is true, `declaredAmount` must be a positive number
9. **Delivery Options**: Must be one of the valid options for sender/receiver

## Database Schema

The booking should be saved to the `bookings` collection with the following structure:

```javascript
{
  _id: ObjectId,
  service: "uae-to-pinas",
  service_code: "UAE_TO_PH",
  source: "sales",
  status: "pending",
  review_status: "pending",
  sender: {
    firstName: String,
    lastName: String,
    fullName: String,
    name: String,
    country: "UNITED ARAB EMIRATES",
    address: String,
    addressLine1: String,
    completeAddress: String,
    deliveryOption: "pickup" | "warehouse",
    phone: String,
    phoneNumber: String,
    contactNo: String,
    email: String (optional),
    emailAddress: String (optional),
    agentName: String (optional)
  },
  receiver: {
    firstName: String,
    lastName: String,
    fullName: String,
    name: String,
    country: "PHILIPPINES",
    address: String,
    addressLine1: String,
    completeAddress: String,
    deliveryOption: "pickup" | "delivery",
    phone: String,
    phoneNumber: String,
    contactNo: String,
    email: String (optional),
    emailAddress: String (optional)
  },
  items: [
    {
      commodity: String,
      name: String,
      description: String (optional),
      qty: Number,
      quantity: Number
    }
  ],
  identityDocuments: {
    eidFrontImage: String (base64),
    eidBackImage: String (base64),
    philippinesIdFront: String (base64),
    philippinesIdBack: String (base64)
  },
  insured: Boolean,
  declaredAmount: Number (if insured) | null,
  created_by_employee_id: String,
  createdAt: Date,
  updatedAt: Date
}
```

## Implementation Notes

1. **Image Storage**: Consider storing images in a file storage service (e.g., S3, Google Cloud Storage) instead of storing base64 strings directly in MongoDB. Update the schema to store image URLs instead.

2. **Reference Number Generation**: The backend should generate a unique reference number (e.g., "KNX-XXXXXX-XXX") for the booking.

3. **AWB Generation**: An AWB (Air Waybill) number should be generated automatically after the booking is reviewed/approved.

4. **Audit Logging**: Log the booking creation event for audit purposes.

5. **Validation**: Implement comprehensive validation on the backend side, even though the frontend also validates.

6. **Error Handling**: Provide clear, user-friendly error messages for validation failures.

7. **Security**: 
   - Validate that the user has permission to create bookings
   - Sanitize all input data
   - Validate image formats and sizes
   - Implement rate limiting to prevent abuse

## Testing

Test cases to consider:

1. ✅ Valid booking creation with all required fields
2. ✅ Booking creation with optional fields (email, agentName)
3. ✅ Booking creation with insurance
4. ✅ Booking creation without insurance
5. ✅ Validation: Missing required fields
6. ✅ Validation: Invalid email format
7. ✅ Validation: Invalid delivery option
8. ✅ Validation: Missing identity documents
9. ✅ Validation: Insurance true but no declaredAmount
10. ✅ Validation: Invalid service code
11. ✅ Validation: Invalid country values
12. ✅ Authorization: Unauthorized user
13. ✅ Multiple items in items array
14. ✅ Base64 image encoding/decoding

## Related Endpoints

- `GET /api/bookings` - Get all bookings
- `GET /api/bookings/:id` - Get booking by ID
- `POST /api/bookings/:id/review` - Review and approve booking
- `PUT /api/bookings/:id/status` - Update booking status


