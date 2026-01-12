# Backend API: Reverify Verification Endpoint

This document describes the backend API endpoint for reverifying (updating) existing verification data for invoice requests that are already in VERIFIED status.

## Endpoint

```
PUT /api/invoice-requests/:id/reverify
```

## Authentication

- **Required**: Yes
- **Method**: Bearer token (JWT)
- **Header**: `Authorization: Bearer <token>`

## Request Body

The request body should contain the updated verification data. The structure matches the verification object used in the initial verification, but this endpoint **updates** existing verification data instead of creating new verification.

### Required Fields

All fields that were required during initial verification should be included:

- `invoice_number`: string - Invoice number
- `tracking_code`: string - Tracking code/AWB
- `service_code`: string - Service code (e.g., "UAE_TO_PH", "PH_TO_UAE")
- `amount`: number | string - Calculated amount
- `actual_weight`: number | string - Actual weight in kg
- `volumetric_weight`: number | string - Volumetric weight in kg
- `receiver_address`: string - Receiver address
- `receiver_phone`: string - Receiver phone number
- `agents_name`: string - Agent name
- `shipment_classification`: string - Shipment classification (e.g., "GENERAL", "COMMERCIAL", "PERSONAL", "FLOMIC")
- `cargo_service`: string - Cargo service type (e.g., "AIR", "SEA")
- `number_of_boxes`: number | string - Number of boxes
- `total_kg`: number | string - Total kilograms (manual input)
- `sender_details_complete`: boolean - Sender details completion flag
- `receiver_details_complete`: boolean - Receiver details completion flag
- `verified_by_employee_id`: string (ObjectId) - ID of employee performing the reverification
- `verification_notes`: string (optional) - Verification notes

### Optional Fields

- `volumetric_weight`: number | string - Volumetric weight
- `volume_cbm`: number | string - Volume in CBM
- `weight_type`: string - Weight type ("ACTUAL" or "VOLUMETRIC")
- `chargeable_weight`: number | string - Chargeable weight (higher of actual or volumetric)
- `calculated_rate`: number | string - Calculated rate per kg
- `rate_bracket`: string - Rate bracket label
- `boxes`: array - Array of box objects with dimensions
- `total_vm`: number | string - Total volumetric weight
- `weight`: number | string - Weight
- `listed_commodities`: string - Listed commodities
- `declared_value`: number | string (optional) - Declared value for insurance (UAE_TO_PH only, if insured)
- `insured`: boolean (optional) - Insurance flag (UAE_TO_PH only)

## Behavior

1. **Status Check**: The endpoint should verify that the invoice request exists and is in `VERIFIED` status. If not, return an error.

2. **Update Verification**: Update the `verification` object in the invoice request document with the new data provided.

3. **Preserve Status**: Keep the status as `VERIFIED` (do NOT change back to `IN_PROGRESS`).

4. **Update Timestamps**: Update `verification.verified_at` to the current timestamp to track when the reverification occurred.

5. **Audit Trail**: Consider logging the reverification action with:
   - `verified_by_employee_id`: ID of employee performing reverification
   - `reverified_at`: Timestamp of reverification
   - Original verification data (for audit purposes)

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "_id": "invoice_request_id",
    "status": "VERIFIED",
    "verification": {
      // Updated verification data
      "invoice_number": "...",
      "tracking_code": "...",
      "service_code": "...",
      "amount": 1000,
      "actual_weight": 10,
      "volumetric_weight": 12,
      // ... other verification fields
      "verified_by_employee_id": "employee_id",
      "verified_at": "2026-01-06T12:00:00.000Z",
      "reverified_at": "2026-01-06T13:00:00.000Z" // Optional: Track reverification timestamp
    },
    // ... other invoice request fields
  }
}
```

### Error Responses

#### 400 Bad Request - Invalid Data
```json
{
  "success": false,
  "error": "Missing required field: invoice_number"
}
```

#### 404 Not Found - Invoice Request Not Found
```json
{
  "success": false,
  "error": "Invoice request not found"
}
```

#### 400 Bad Request - Invalid Status
```json
{
  "success": false,
  "error": "Invoice request is not in VERIFIED status. Current status: IN_PROGRESS"
}
```

#### 403 Forbidden - Unauthorized
```json
{
  "success": false,
  "error": "Unauthorized: Only Operations department can reverify verifications"
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error"
}
```

## Validation Rules

1. **Status Validation**: 
   - Invoice request must exist
   - Invoice request must be in `VERIFIED` status
   - If status is not `VERIFIED`, return error

2. **Department Validation** (if applicable):
   - Only Operations department users should be able to reverify
   - Validate user's department from JWT token

3. **Required Fields Validation**:
   - All required verification fields must be present and valid
   - Validate field types (numbers should be numbers, strings should be strings, etc.)

4. **Data Validation**:
   - Weights should be positive numbers
   - Amounts should be positive numbers
   - Service code should be a valid service code
   - Classification should be valid (GENERAL, COMMERCIAL, PERSONAL, FLOMIC)
   - Cargo service should be valid (AIR, SEA)

5. **Insurance Validation** (for UAE_TO_PH):
   - If `insured` is `true`, `declared_value` must be provided and > 0
   - If `insured` is `false`, `declared_value` should be omitted or set to null

## Database Schema Update

The invoice request document structure:

```javascript
{
  _id: ObjectId,
  status: "VERIFIED", // Should remain VERIFIED
  verification: {
    // All verification fields (updated with new data)
    invoice_number: String,
    tracking_code: String,
    service_code: String,
    amount: Number,
    actual_weight: Number,
    volumetric_weight: Number,
    // ... other fields
    verified_by_employee_id: ObjectId,
    verified_at: Date, // Original verification timestamp
    reverified_at: Date, // NEW: Timestamp of reverification (optional but recommended)
    reverified_by_employee_id: ObjectId, // NEW: ID of employee who reverified (optional but recommended)
    // ... other verification fields
  },
  // ... other invoice request fields
}
```

## Implementation Notes

1. **Idempotency**: The endpoint should be idempotent - calling it multiple times with the same data should result in the same state.

2. **Atomic Update**: Use MongoDB's `findOneAndUpdate` or similar atomic operations to ensure data consistency.

3. **Validation**: Validate all incoming data before updating the database.

4. **Error Handling**: Return clear, actionable error messages for validation failures.

5. **Logging**: Log reverification actions for audit purposes.

6. **Permissions**: Ensure only authorized users (Operations department) can access this endpoint.

7. **Performance**: Consider indexing the `status` and `verification.verified_at` fields for faster queries.

## Example Request

```javascript
PUT /api/invoice-requests/507f1f77bcf86cd799439011/reverify
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "invoice_number": "INV-000123",
  "tracking_code": "ABC123XYZ",
  "service_code": "UAE_TO_PH",
  "amount": "1200.50",
  "actual_weight": "15.5",
  "volumetric_weight": "16.2",
  "receiver_address": "123 Main Street, Manila, Philippines",
  "receiver_phone": "+639123456789",
  "agents_name": "John Doe",
  "shipment_classification": "GENERAL",
  "cargo_service": "AIR",
  "number_of_boxes": "2",
  "total_kg": "16.2",
  "sender_details_complete": true,
  "receiver_details_complete": true,
  "verified_by_employee_id": "68f38205941695ddb6a193b1",
  "verification_notes": "Updated weight information",
  "weight_type": "VOLUMETRIC",
  "chargeable_weight": "16.2",
  "calculated_rate": "38.00",
  "rate_bracket": "16-29 KG"
}
```

## Testing Checklist

- [ ] Test reverification with valid data
- [ ] Test reverification with missing required fields
- [ ] Test reverification with invalid status (e.g., IN_PROGRESS, COMPLETED)
- [ ] Test reverification with non-existent invoice request ID
- [ ] Test reverification with unauthorized user (non-Operations department)
- [ ] Test reverification preserves VERIFIED status
- [ ] Test reverification updates verification data correctly
- [ ] Test reverification updates timestamps
- [ ] Test reverification with insurance fields (UAE_TO_PH, insured = true)
- [ ] Test reverification with invalid data types
- [ ] Test reverification audit logging
- [ ] Test reverification idempotency

## Related Endpoints

- `PUT /api/invoice-requests/:id/verification` - Initial verification update
- `PUT /api/invoice-requests/:id/complete-verification` - Complete verification (sets status to VERIFIED)
- `GET /api/invoice-requests/:id` - Get invoice request details


