# Backend API: Comprehensive Invoice Update

This document describes the backend API endpoint for updating all invoice details from the Finance Dashboard's "Edit Invoice" dialog.

## Endpoint

```
PUT /api/invoices-unified/:id
```

## Authentication

Requires authentication. The user must be authenticated and have appropriate permissions (typically Finance department).

## Request Body

The request body should accept a JSON object with **all editable invoice fields**. The backend should update **only** the fields that are present in the request body (partial update pattern).

### Regeneration Flag

- `regenerate` (boolean, optional) - When set to `true`, the backend should **regenerate the entire invoice** based on the provided data. This means:
  - Recalculate all charges (shipping, pickup, delivery, insurance) based on updated shipment details
  - Recalculate taxes based on updated tax rate and charges
  - Recalculate subtotal and total
  - Update all related fields in the database
  - Replace the existing invoice data with the regenerated invoice

When `regenerate: true` is present, the backend should treat this as a complete invoice regeneration, not just a field update.

### Complete Field List

#### Invoice Header Fields
- `invoice_id` (string, optional) - Invoice number/identifier
- `batch_number` (string, optional) - Batch number
- `awb_number` (string, optional) - Air Waybill number
- `issue_date` (Date/ISO string, optional) - Invoice issue date
- `due_date` (Date/ISO string, optional) - Invoice due date

#### Sender Information Fields
- `customer_name` (string, optional) - Sender/customer name
- `customer_phone` (string, optional) - Sender phone number
- `customer_email` (string, optional) - Sender email address
- `origin_place` (string, optional) - Origin place/sender address

#### Receiver Information Fields
- `receiver_name` (string, required) - Receiver name
- `receiver_address` (string, required) - Receiver address
- `receiver_phone` (string, required) - Receiver phone number
- `customer_trn` (string, optional) - Receiver TRN (Tax Registration Number)

#### Shipment Details Fields
- `number_of_boxes` (number/integer, optional) - Number of boxes
- `weight_kg` (number, optional) - Weight in kilograms (CRITICAL: Must be updated in direct invoice field, not just nested fields)
- `weight_type` (string, optional) - Weight type: "ACTUAL" or "VOLUMETRIC" (CRITICAL: Must be updated in direct invoice field, not just nested fields)
- `base_rate` (number, optional) - Base rate per kilogram (CRITICAL: Must be updated in direct invoice field - this is what displays as "Rate" in the invoice template)
- `service_code` (string, optional) - Service code (e.g., "UAE_TO_PH", "PH_TO_UAE")

#### Charges Fields
- `amount` (number, optional) - Shipping charge
- `pickup_charge` (number, optional) - Pickup charge
- `delivery_charge` (number, optional) - Delivery charge
- `insurance_charge` (number, optional) - Insurance charge (can be 0)
- `tax_rate` (number, optional) - Tax rate percentage (e.g., 0, 5)
- `tax_amount` (number, optional) - Tax amount (**MANUAL FIELD** - use the provided value directly, do NOT auto-calculate)
- `subtotal` (number, optional) - Subtotal (may be calculated for reference: shipping + pickup + delivery + insurance)
- `total` (number, optional) - Total amount (**MANUAL FIELD** - use the provided value directly, do NOT auto-calculate)

#### Agent Information Fields
- `agent_name` (string, optional) - Agent name (for tracking which agent created/verified the invoice)

#### Notes Fields
- `notes` (string, optional) - Additional notes or remarks

## Important Notes for PH TO UAE Invoices

PH TO UAE invoices have **two separate invoice types** (COD and Tax) that share the same invoice document but have different charge structures. The frontend sends an `invoice_type` field to distinguish between COD and Tax invoice edits.

### PH TO UAE COD Invoice Edits

When `invoice_type: 'COD'` is present in the request:
- **Update these fields**: `receiver_name`, `receiver_address`, `receiver_phone`, `amount`, `pickup_charge`, `cod_delivery_charge`, `total_amount_cod`, `notes`
- **DO NOT update**: `delivery_charge`, `tax_amount`, `total_amount_tax_invoice`, `tax_rate`
- **Preserve**: Tax invoice fields must remain unchanged

### PH TO UAE Tax Invoice Edits

When `invoice_type: 'TAX'` is present in the request:
- **Update these fields**: `receiver_name`, `receiver_address`, `receiver_phone`, `delivery_charge`, `tax_amount`, `total_amount_tax_invoice`, `tax_rate`, `notes`
- **DO NOT update**: `amount`, `pickup_charge`, `cod_delivery_charge`, `total_amount_cod`
- **Preserve**: COD invoice fields (especially `amount` - shipping charge) must remain unchanged for COD invoice calculations

### Regular Invoice Edits (Non-PH TO UAE)

When `invoice_type` is **NOT present** or the service is NOT PH_TO_UAE:
- Update **all** fields provided in the request
- Standard invoice update behavior

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "_id": "invoice_id",
    "invoice_id": "INV-000123",
    "batch_number": "BATCH-001",
    "awb_number": "AEU3UN3NE52AY6O",
    "issue_date": "2026-01-06T00:00:00.000Z",
    "due_date": "2026-01-13T00:00:00.000Z",
    "customer_name": "John Doe",
    "customer_phone": "+971501234567",
    "customer_email": "john@example.com",
    "origin_place": "Dubai, UAE",
    "receiver_name": "Jane Smith",
    "receiver_address": "123 Main St, Manila, Philippines",
    "receiver_phone": "+639123456789",
    "customer_trn": "123456789",
    "number_of_boxes": 3,
    "weight_kg": 15.5,
    "weight_type": "ACTUAL",
    "base_rate": 38.00,
    "service_code": "UAE_TO_PH",
    "amount": 589.00,
    "pickup_charge": 50.00,
    "delivery_charge": 100.00,
    "insurance_charge": 10.00,
    "tax_rate": 0,
    "subtotal": 749.00,
    "tax_amount": 0,
    "total": 749.00,
    "agent_name": "Agent Name",
    "notes": "Additional notes",
    "updatedAt": "2026-01-06T12:00:00.000Z"
  }
}
```

### Error Response (400/404/500)

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

## Validation Rules

1. **Required Fields for Regular Invoices**:
   - `receiver_name` (if provided, must be non-empty string)
   - `receiver_address` (if provided, must be non-empty string)
   - `receiver_phone` (if provided, must be non-empty string)

2. **Numeric Fields**:
   - All charge fields (`amount`, `pickup_charge`, `delivery_charge`, `insurance_charge`, `tax_rate`) must be non-negative numbers if provided
   - `tax_rate` should be between 0 and 100 if provided
   - `number_of_boxes` must be a positive integer if provided
   - `weight_kg` must be a positive number if provided

3. **Date Fields**:
   - `issue_date` and `due_date` must be valid ISO date strings if provided
   - `due_date` should be after `issue_date` if both are provided

4. **Email Fields**:
   - `customer_email` must be a valid email format if provided

5. **Weight Type**:
   - `weight_type` must be either "ACTUAL" or "VOLUMETRIC" if provided

6. **Service Code**:
   - `service_code` should be a valid service code (e.g., "UAE_TO_PH", "PH_TO_UAE", "UAE_TO_PINAS") if provided

## Database Schema Updates

The backend should update the invoice document in the database with the provided fields. The update should:

1. **Preserve existing values** for fields not included in the request (partial update)
2. **Update `updatedAt` timestamp** automatically
3. **For PH TO UAE invoices**: Ensure that COD and Tax invoice fields are updated independently based on `invoice_type`
4. **Direct Invoice Fields Priority**: When updating fields like `weight_kg`, `weight_type`, and `base_rate`, update them in the **direct invoice document fields** (not just in nested `request_id` fields). The frontend reads from direct invoice fields first, then falls back to nested fields.

## Special Handling

### Agent Name Field

The `agent_name` field may need special handling depending on your schema:
- If the invoice schema stores agent information in `created_by.full_name` or `verification.agents_name`, you may need to update those fields
- Alternatively, if there's a direct `agent_name` field in the invoice schema, update that directly
- The frontend sends `agent_name` as a string

### Manual Fields (No Auto-Calculation)

**CRITICAL**: The frontend sends **all values manually**. The backend must:
- **Use `tax_amount` value directly** from the request (DO NOT calculate it)
- **Use `total` value directly** from the request (DO NOT calculate it)
- **Store them exactly as provided** in the invoice collection

The backend may calculate `subtotal = shipping + pickup + delivery + insurance` for reference or validation, but:
- **DO NOT override** `tax_amount` or `total` with calculated values
- **DO NOT calculate** `tax_amount` from `tax_rate` and charges
- **DO NOT calculate** `total` from `subtotal + tax_amount`

**All fields are manual** - the frontend handles all calculations and sends the final values.

### Insurance Charge

The `insurance_charge` field can be `0` (zero), which is valid. If it's `0`, it should be stored as `0`, not `null` or `undefined`.

## Important: Manual Fields (No Auto-Calculation)

**CRITICAL**: The frontend now sends **all values manually**. The backend should:
- **NOT auto-calculate** `tax_amount` or `total` from other fields
- **Use the provided values directly** from the request body
- **Update the fields as-is** in the invoice collection
- **Only validate** that values are numbers and non-negative (if applicable)

The frontend handles all calculations on the client side. The backend's role is to **store the values exactly as provided**.

## Invoice Regeneration Logic

**NOTE**: When `regenerate: true` is present, the backend should still respect the manual values provided. However, if certain fields are missing and regeneration is requested, the backend may calculate them based on business rules (e.g., `amount = weight_kg * base_rate`).

When `regenerate: true` is present in the request, the backend should:

1. **Shipping Charge (amount)**:
   - **If `amount` is provided**: Use the provided value directly (manual override)
   - **If `amount` is NOT provided AND `regenerate: true` AND both `weight_kg` and `base_rate` are provided**: Calculate `amount = weight_kg * base_rate`
   - **Otherwise**: Keep existing value or use provided value
   - **Important**: Update `amount` in the direct invoice document field

2. **Recalculate Pickup Charge**:
   - Use `sender_delivery_option` or delivery option from request
   - Apply pickup charge rules based on service type and location
   - If `pickup_charge` is provided, use it directly (manual override)

3. **Recalculate Delivery Charge**:
   - Use `receiver_delivery_option` or delivery option from request
   - Apply delivery charge rules based on service type, location, and weight
   - For PH TO UAE: Consider weight thresholds (e.g., free delivery for >= 15kg)
   - If `delivery_charge` is provided, use it directly (manual override)

4. **Recalculate Insurance Charge**:
   - If `insured` is true and `declaredAmount` is provided:
     - Calculate: `insurance_charge = declaredAmount * 0.01` (1% of declared value)
   - If `insurance_charge` is provided, use it directly (manual override)

5. **Recalculate Subtotal**:
   - `subtotal = shipping_charge + pickup_charge + delivery_charge + insurance_charge`

6. **Recalculate Tax**:
   - If `tax_rate` > 0:
     - For regular invoices: `tax_amount = subtotal * (tax_rate / 100)`
     - For PH TO UAE Tax invoices: `tax_amount = delivery_charge * (tax_rate / 100)`
   - If `tax_rate` is 0: `tax_amount = 0`

7. **Recalculate Total**:
   - `total = subtotal + tax_amount`

8. **Update All Related Fields**:
   - Update invoice document with all recalculated values
   - Update `line_items` array with recalculated charges
   - Update `updatedAt` timestamp
   - For PH TO UAE invoices: Update both COD and Tax invoice totals if applicable

### Regeneration Priority

When `regenerate: true`:
- **Manual overrides take precedence**: If a charge field (e.g., `amount`, `pickup_charge`, `delivery_charge`, `insurance_charge`) is provided in the request, use that value instead of recalculating
- **Recalculate dependent fields**: Even if a charge is manually overridden, still recalculate `subtotal`, `tax_amount`, and `total` based on all charges
- **Use provided shipment details**: Use `weight_kg`, `base_rate`, `number_of_boxes`, `weight_type`, `service_code` from the request for calculations

## Example Requests

### Example 1: Regular Invoice Update (UAE TO PH)

```json
PUT /api/invoices-unified/507f1f77bcf86cd799439011

{
  "invoice_id": "INV-000123",
  "batch_number": "BATCH-001",
  "awb_number": "AEU3UN3NE52AY6O",
  "issue_date": "2026-01-06T00:00:00.000Z",
  "due_date": "2026-01-13T00:00:00.000Z",
  "customer_name": "John Doe",
  "customer_phone": "+971501234567",
  "customer_email": "john@example.com",
  "origin_place": "Dubai, UAE",
  "receiver_name": "Jane Smith",
  "receiver_address": "123 Main St, Manila, Philippines",
  "receiver_phone": "+639123456789",
  "customer_trn": "123456789",
  "number_of_boxes": 3,
  "weight_kg": 15.5,
  "weight_type": "ACTUAL",
  "base_rate": 38.00,
  "service_code": "UAE_TO_PH",
  "amount": 589.00,
  "pickup_charge": 50.00,
  "delivery_charge": 100.00,
  "insurance_charge": 10.00,
  "tax_rate": 0,
  "subtotal": 749.00,
  "tax_amount": 0,
  "total": 749.00,
  "agent_name": "Agent Name",
  "notes": "Updated invoice details",
  "regenerate": true
}
```

**Backend Action**: When `regenerate: true` is present, the backend should:
1. Recalculate `amount` based on `weight_kg` (15.5) * `base_rate` (38.00) = 589.00 (already provided, but verify)
2. Recalculate `pickup_charge` based on delivery option (if not manually overridden)
3. Recalculate `delivery_charge` based on delivery option and weight (if not manually overridden)
4. Recalculate `insurance_charge` based on `declaredAmount` if insured
5. Recalculate `subtotal` = 589.00 + 50.00 + 100.00 + 10.00 = 749.00
6. Recalculate `tax_amount` = 0 (tax_rate is 0)
7. Recalculate `total` = 749.00 + 0 = 749.00
8. Update all fields in the database with regenerated values

### Example 2: PH TO UAE COD Invoice Update

```json
PUT /api/invoices-unified/507f1f77bcf86cd799439011

{
  "invoice_type": "COD",
  "receiver_name": "Mohammed Al-Rashid",
  "receiver_address": "Villa 21, Jumeirah, Dubai, United Arab Emirates",
  "receiver_phone": "501234021",
  "amount": 500.00,
  "pickup_charge": 50.00,
  "cod_delivery_charge": 100.00,
  "total_amount_cod": 650.00,
  "notes": "Updated COD invoice details"
}
```

**Important**: This request should **NOT** update `delivery_charge`, `tax_amount`, `total_amount_tax_invoice`, or `tax_rate` fields.

### Example 3: PH TO UAE Tax Invoice Update

```json
PUT /api/invoices-unified/507f1f77bcf86cd799439011

{
  "invoice_type": "TAX",
  "receiver_name": "Mohammed Al-Rashid",
  "receiver_address": "Villa 21, Jumeirah, Dubai, United Arab Emirates",
  "receiver_phone": "501234021",
  "delivery_charge": 100.00,
  "tax_rate": 5,
  "tax_amount": 5.00,
  "total_amount_tax_invoice": 105.00,
  "total": 105.00,
  "subtotal": 100.00,
  "notes": "Updated Tax invoice details"
}
```

**Important**: This request should **NOT** update `amount`, `pickup_charge`, `cod_delivery_charge`, or `total_amount_cod` fields. The `amount` field (shipping charge) must be preserved for COD invoice calculations.

## Error Handling

The backend should return appropriate error responses for:
- **400 Bad Request**: Invalid field values, validation errors
- **404 Not Found**: Invoice ID not found
- **500 Internal Server Error**: Database errors, unexpected server errors

Error responses should include a descriptive error message in the `error` field.

## Testing Recommendations

1. Test updating all fields for a regular invoice (UAE TO PH)
2. Test partial updates (only some fields provided)
3. Test PH TO UAE COD invoice updates (verify Tax invoice fields are not changed)
4. Test PH TO UAE Tax invoice updates (verify COD invoice fields are not changed)
5. Test validation errors (invalid email, negative numbers, etc.)
6. Test date validation (due_date before issue_date)
7. Test numeric field validation (tax_rate > 100, negative charges, etc.)

## Database Update Requirements

**CRITICAL**: When updating the invoice, update fields in the **direct invoice document** in the `invoices` collection (not just in nested `request_id` fields). The frontend reads from direct fields first.

### Fields to Update in Invoice Document

Update these fields **directly in the invoice document**:
- `weight_kg` (if provided) - Weight in kilograms
- `weight_type` (if provided) - "ACTUAL" or "VOLUMETRIC"
- `base_rate` (if provided) - Rate per kilogram (displays as "Rate" in invoice)
- `amount` (if provided) - Shipping charge
- `pickup_charge` (if provided) - Pickup charge
- `delivery_charge` (if provided) - Delivery charge
- `insurance_charge` (if provided) - Insurance charge
- `tax_rate` (if provided) - Tax rate percentage
- `tax_amount` (if provided) - Tax amount (**MANUAL - use provided value**)
- `total` (if provided) - Total amount (**MANUAL - use provided value**)
- `subtotal` (optional - may calculate for reference)
- `number_of_boxes` (if provided)
- `customer_name`, `customer_phone`, `customer_email`, `origin_place` (if provided)
- `receiver_name`, `receiver_address`, `receiver_phone`, `customer_trn` (if provided)
- `invoice_id`, `batch_number`, `awb_number`, `issue_date`, `due_date` (if provided)
- `notes` (if provided)
- `agent_name` (if provided - may need to map to appropriate field in your schema)

## Notes

1. **Manual Fields**: The frontend sends all values manually. The backend should **NOT auto-calculate** `tax_amount` or `total`. Use the provided values directly.

2. **Invoice Regeneration**: When `regenerate: true` is present, the backend may recalculate `amount` from `weight_kg * base_rate` **only if `amount` is not provided**. However, `tax_amount` and `total` are **always manual** and should be used as provided.

3. **CRITICAL - Rate (base_rate) Field**: The `base_rate` field **MUST be updated** in the direct invoice document if provided in the request. This field displays as "Rate" in the invoice template. The frontend sends this value manually, and it must be stored in the invoice document's direct `base_rate` field (not nested fields). The frontend reads `invoice.base_rate` first, so this field must be updated in the direct invoice document for changes to be visible.

4. **Field Preservation**: For PH TO UAE invoices, it's critical that COD and Tax invoice fields are updated independently. When editing one invoice type, the other type's fields must be preserved.

5. **Direct Invoice Fields**: Update fields in the **direct invoice document** (not nested `request_id` fields), as the frontend reads from these fields first. This is especially critical for: `weight_kg`, `weight_type`, `base_rate`, `tax_amount`, and `total`.

6. **Backward Compatibility**: The endpoint should handle requests that don't include `invoice_type` (treat as regular invoice update).

7. **Audit Trail**: Consider logging invoice updates for audit purposes, including which fields were changed and by whom.

8. **Concurrent Updates**: Consider implementing optimistic locking or version checks to prevent concurrent update conflicts.

