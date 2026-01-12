# Backend API: Update Declared Amount in Invoice Request Collection

## Overview
When the verification form updates the insurance declared value, the backend should also update the `declaredAmount` field in the invoice request collection (top-level, not just in the verification subdocument).

## API Endpoints Affected

### 1. PUT `/api/invoice-requests/:id/verification`
**Purpose**: Update verification details (normal verification flow)

**Current Behavior**: Updates the `verification` subdocument with `declared_value`

**Required Change**: Also update the top-level `declaredAmount` field in the invoice request document

**Request Body** (partial):
```json
{
  "declared_value": 100,
  "declaredAmount": 100,  // NEW: Also include this field
  "insured": true,
  // ... other verification fields
}
```

**Backend Implementation**:
- When `declaredAmount` is present in the request body, update BOTH:
  1. `verification.declared_value` (in verification subdocument)
  2. `declaredAmount` (top-level field in invoice request document)

**Example Update Query** (MongoDB):
```javascript
await InvoiceRequest.findByIdAndUpdate(requestId, {
  $set: {
    'verification.declared_value': declaredAmountValue,
    'declaredAmount': declaredAmountValue,  // Top-level field
    'verification.insured': true,
    // ... other fields
  }
}, { new: true });
```

---

### 2. PUT `/api/invoice-requests/:id/reverify`
**Purpose**: Reverify/update existing verification data (reverify flow)

**Current Behavior**: Updates the `verification` subdocument

**Required Change**: Also update the top-level `declaredAmount` field in the invoice request document

**Request Body** (partial):
```json
{
  "declared_value": 150,
  "declaredAmount": 150,  // NEW: Also include this field
  "insured": true,
  // ... other verification fields
}
```

**Backend Implementation**:
- Same as above: Update both `verification.declared_value` and top-level `declaredAmount`

**Example Update Query** (MongoDB):
```javascript
await InvoiceRequest.findByIdAndUpdate(requestId, {
  $set: {
    'verification.declared_value': declaredAmountValue,
    'declaredAmount': declaredAmountValue,  // Top-level field
    'verification.insured': true,
    'verification.updatedAt': new Date(),
    // ... other fields
  }
}, { new: true });
```

---

### 3. PUT `/api/invoice-requests/:id/complete-verification`
**Purpose**: Complete verification and change status to VERIFIED

**Current Behavior**: Updates verification and changes status

**Required Change**: Also update the top-level `declaredAmount` field if `declared_value` is being updated

**Note**: This endpoint may receive verification data, so ensure `declaredAmount` is updated if present

---

## Data Flow

### Frontend → Backend
1. User edits declared value in Verification form
2. Frontend sends update request with:
   ```json
   {
     "declared_value": 100,
     "declaredAmount": 100,  // Frontend includes both
     "insured": true
   }
   ```
3. Backend receives request and updates:
   - `verification.declared_value` = 100
   - `declaredAmount` = 100 (top-level)
   - `verification.insured` = true

### Database Structure
```javascript
{
  _id: ObjectId("..."),
  // ... other fields
  declaredAmount: 100,  // Top-level field (NEW/UPDATED)
  verification: {
    declared_value: 100,  // In verification subdocument
    insured: true,
    // ... other verification fields
  }
}
```

---

## Validation Rules

1. **If `declaredAmount` is provided**:
   - Must be a positive number (>= 0)
   - Should be a valid decimal number
   - Update both `verification.declared_value` and top-level `declaredAmount`

2. **If `declaredAmount` is NOT provided but `declared_value` is**:
   - Use `declared_value` value for both fields (for backward compatibility)

3. **If both `declaredAmount` and `declared_value` are provided**:
   - Use `declaredAmount` value (prioritize top-level field name)
   - Update both fields with the same value

---

## Testing Checklist

- [ ] Update verification with declared value → Both `verification.declared_value` and `declaredAmount` are updated
- [ ] Reverify with new declared value → Both fields are updated
- [ ] Complete verification with declared value → Both fields are updated
- [ ] Verify that existing invoice requests without `declaredAmount` are not broken
- [ ] Verify that invoice requests with existing `declaredAmount` are updated correctly
- [ ] Test with different declared values (0, 100, 1000, 10000)
- [ ] Test that validation errors are returned for invalid values (negative numbers, non-numeric)

---

## Notes

1. **Backward Compatibility**: The backend should handle cases where only `declared_value` is sent (without `declaredAmount`). In such cases, update both fields with the same value.

2. **Data Consistency**: Ensure that `verification.declared_value` and top-level `declaredAmount` always have the same value to maintain data consistency.

3. **Field Location**: The `declaredAmount` field should be at the top level of the invoice request document, not nested in the `verification` subdocument.

4. **Invoice Generation**: The invoice generation logic should prioritize the top-level `declaredAmount` field, with `verification.declared_value` as a fallback for backward compatibility.


