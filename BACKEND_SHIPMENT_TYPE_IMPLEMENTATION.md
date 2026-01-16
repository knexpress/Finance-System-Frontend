# Backend Implementation: Shipment Type for Sales Booking

## Overview
The frontend now includes a **Shipment Type** field in the sales booking form with two options:
- **Document**: Insurance disabled, declared value automatically set to 0
- **Non Document**: Insurance enabled, declared value required from user

## Frontend Changes

### 1. New Field Added
- **Field Name**: `shipmentType`
- **Type**: `'document' | 'non_document'`
- **Location**: Above "Box Items List" section in the booking form
- **Required**: Yes

### 2. Business Logic
- **Document shipments**:
  - `insured` = `false` (automatically)
  - `declaredAmount` = `0` (automatically)
  - Insurance checkbox is disabled
  - Declared value input is in the Shipment Type section, shows "0" and is disabled
  - User cannot modify declared value for document shipments

- **Non Document shipments**:
  - `insured` = `true` (automatically)
  - `declaredAmount` = User input (required, must be > 0)
  - Insurance checkbox is enabled (checked by default)
  - Declared value input is in the Shipment Type section, required and editable
  - User must enter a declared value greater than 0

### 3. UI Layout
The Shipment Type section now contains:
- **Shipment Type dropdown** (left column): Select between "Document" or "Non Document"
- **Declared Value input** (right column): 
  - For Document: Disabled, shows "0"
  - For Non Document: Required, user must enter value > 0

### 4. Data Sent to Backend
The booking payload now includes:
```json
{
  "shipmentType": "document" | "non_document",
  "insured": boolean,  // false for document, true for non_document
  "declaredAmount": number  // 0 for document, user input (required > 0) for non_document
}
```

**Important Notes**:
- The frontend enforces that `declaredAmount` is always `0` for document shipments
- The frontend requires `declaredAmount > 0` for non-document shipments
- The backend should validate and enforce these same rules

## Frontend Validation Rules

### Declared Value Validation
- **Document shipments**: 
  - Frontend automatically sets `declaredAmount = 0`
  - Input field is disabled
  - No user input allowed
  
- **Non Document shipments**:
  - Frontend requires `declaredAmount > 0`
  - Input field is required and enabled
  - Validation error shown if value is missing or <= 0

## Backend Requirements

### 1. Database Schema Update

#### Bookings Collection
Add the following field to the `bookings` schema:

```javascript
{
  shipmentType: {
    type: String,
    enum: ['document', 'non_document'],
    required: true,
    default: 'non_document'
  }
}
```

**Note**: If you want to maintain backward compatibility with existing bookings, make this field optional initially, then migrate existing records.

### 2. API Endpoint Updates

#### POST `/api/bookings` (Create Booking)
- Accept `shipmentType` in the request body
- Validate that `shipmentType` is either `'document'` or `'non_document'`
- Store `shipmentType` in the booking document
- Enforce business rules:
  - If `shipmentType === 'document'`: Ensure `insured === false` and `declaredAmount === 0`
  - If `shipmentType === 'non_document'`: Ensure `insured === true` and `declaredAmount > 0`

#### Validation Logic
```javascript
// Pseudo-code for validation
if (shipmentType === 'document') {
  // Override any user input - enforce document rules
  booking.insured = false;
  booking.declaredAmount = 0;
  
  // Reject if user tries to send non-zero declared amount
  if (booking.declaredAmount && booking.declaredAmount !== 0) {
    return error: 'Declared amount must be 0 for document shipments';
  }
  
  // Reject if user tries to enable insurance
  if (booking.insured === true) {
    return error: 'Insurance cannot be enabled for document shipments';
  }
  
} else if (shipmentType === 'non_document') {
  // Ensure insurance is enabled
  if (!booking.insured) {
    booking.insured = true;
  }
  
  // Validate declared amount is provided and > 0
  if (!booking.declaredAmount || booking.declaredAmount <= 0) {
    return error: 'Declared amount is required and must be greater than 0 for non-document shipments';
  }
  
  // Ensure declared amount is a valid number
  if (isNaN(booking.declaredAmount) || !isFinite(booking.declaredAmount)) {
    return error: 'Declared amount must be a valid number';
  }
}
```

### 3. Response Format
Include `shipmentType` in all booking responses:

```json
{
  "_id": "...",
  "shipmentType": "document" | "non_document",
  "insured": boolean,
  "declaredAmount": number,
  // ... other fields
}
```

### 4. Update Existing Endpoints

#### GET `/api/bookings/:id`
- Include `shipmentType` in the response

#### GET `/api/bookings`
- Include `shipmentType` in the list response

#### PUT `/api/bookings/:id` (Update Booking)
- Accept `shipmentType` in update payload
- Apply same validation rules as create endpoint
- If `shipmentType` is changed:
  - If changed to `'document'`: Set `insured = false`, `declaredAmount = 0`
  - If changed to `'non_document'`: Set `insured = true`, validate `declaredAmount > 0`

### 5. Invoice Generation Logic
When generating invoices from bookings:
- Use `shipmentType` to determine insurance charges
- For `'document'` shipments: Insurance charge should be 0
- For `'non_document'` shipments: Calculate insurance based on `declaredAmount`

### 6. Migration Script (Optional)
If you have existing bookings without `shipmentType`:

```javascript
// Migration script to set default shipmentType for existing bookings
db.bookings.updateMany(
  { shipmentType: { $exists: false } },
  { 
    $set: { 
      shipmentType: 'non_document'  // Default to non_document
    } 
  }
);
```

## Testing Checklist

- [ ] Create booking with `shipmentType: 'document'` → Verify `insured: false`, `declaredAmount: 0`
- [ ] Create booking with `shipmentType: 'non_document'` → Verify `insured: true`, `declaredAmount` is provided
- [ ] Try to create document booking with `insured: true` → Should be overridden to `false`
- [ ] Try to create non-document booking without `declaredAmount` → Should return validation error
- [ ] Update booking from `'document'` to `'non_document'` → Should set `insured: true` and require `declaredAmount`
- [ ] Update booking from `'non_document'` to `'document'` → Should set `insured: false` and `declaredAmount: 0`
- [ ] Verify invoice generation respects `shipmentType` for insurance calculations
- [ ] Verify all GET endpoints return `shipmentType` field

## Example Request/Response

### Create Document Booking
```json
POST /api/bookings
{
  "shipmentType": "document",
  "sender": { ... },
  "receiver": { ... },
  "items": [ ... ],
  "insured": false,  // Will be enforced by backend
  "declaredAmount": 0  // Will be enforced by backend
}

Response:
{
  "_id": "...",
  "shipmentType": "document",
  "insured": false,
  "declaredAmount": 0,
  ...
}
```

### Create Non-Document Booking
```json
POST /api/bookings
{
  "shipmentType": "non_document",
  "sender": { ... },
  "receiver": { ... },
  "items": [ ... ],
  "insured": true,  // Will be enforced by backend
  "declaredAmount": 1000  // Required, must be > 0
}

Response:
{
  "_id": "...",
  "shipmentType": "non_document",
  "insured": true,
  "declaredAmount": 1000,
  ...
}
```

## Notes
- The frontend handles the UI logic (disabling fields, setting defaults)
- The backend should enforce these rules as well to prevent API abuse
- Consider adding `shipmentType` to booking search/filter capabilities if needed
- Update any reporting/analytics queries to include `shipmentType` if relevant

