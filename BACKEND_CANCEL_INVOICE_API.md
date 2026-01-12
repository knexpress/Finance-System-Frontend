# Backend API: Cancel Invoice

## Overview
This document specifies the API endpoint and logic required to cancel an invoice. When an invoice is cancelled, it should cascade the cancellation to related entities (InvoiceRequests, Bookings, Delivery Assignments) and update statuses accordingly.

## Endpoint

### POST `/api/invoices/:invoiceId/cancel`

Cancels an invoice and all related entities.

## Request

### Path Parameters
- `invoiceId` (string, required) - The invoice ID (`_id` field from `invoices` collection)

### Request Body
```json
{
  "reason": "string (optional)" - Reason for cancellation
}
```

### Headers
- `Authorization: Bearer <token>` - Authentication token
- `Content-Type: application/json`

## Response

### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Invoice and related entities cancelled successfully",
  "data": {
    "invoice": {
      "_id": "invoice_id",
      "status": "CANCELLED",
      "cancelled_at": "2026-01-12T10:30:00.000Z",
      "cancellation_reason": "User requested cancellation"
    },
    "updatedEntities": {
      "invoice": true,
      "invoiceRequest": true,
      "booking": true,
      "deliveryAssignments": 2,
      "empost": false
    }
  }
}
```

### Error Response (400/404/500)
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Business Logic

### 1. Validation
- Verify invoice exists in `invoices` collection
- Check if invoice is already cancelled (`status === "CANCELLED"`)
- Check if invoice is already completed (`status === "COMPLETED"`) - if so, also update empost
- Check if invoice has a `request_id` (invoice_request exists) - if so, also update empost
- Verify user has permission to cancel invoices

### 2. Update Invoice Collection
- Update invoice document:
  ```javascript
  {
    status: "CANCELLED",
    cancelled_at: new Date(),
    cancellation_reason: request.body.reason || null,
    updatedAt: new Date()
  }
  ```

### 3. Update InvoiceRequests Collection
- Find invoice request using `invoice.request_id` (if exists)
- Update invoice request document:
  ```javascript
  {
    status: "CANCELLED",
    cancelled_at: new Date(),
    cancellation_reason: request.body.reason || null,
    updatedAt: new Date()
  }
  ```

### 4. Update Bookings Collection
- Find booking using `invoice.request_id` (if exists)
- Update booking document:
  ```javascript
  {
    status: "CANCELLED",
    cancelled_at: new Date(),
    cancellation_reason: request.body.reason || null,
    updatedAt: new Date()
  }
  ```

### 5. Cancel Delivery Assignments
- Find all delivery assignments related to the invoice/request:
  - Search in `delivery_assignments` collection (or equivalent)
  - Match by:
    - `request_id` === `invoice.request_id`
    - `invoice_id` === `invoice._id`
    - `awb_number` === `invoice.awb_number`
- Update all matching delivery assignments:
  ```javascript
  {
    status: "CANCELLED",
    cancelled_at: new Date(),
    cancellation_reason: request.body.reason || null,
    updatedAt: new Date()
  }
  ```

### 6. Update Empost (if invoice was COMPLETED OR invoice_request exists)
- **CRITICAL**: Update empost if:
  1. The invoice status was "COMPLETED" before cancellation, OR
  2. An invoice_request exists and is being cancelled (regardless of invoice status)
- Find empost record using:
  - `invoice.empost_uhawb` (if exists)
  - `invoice.awb_number`
  - `invoice.request_id`
- Update empost document:
  ```javascript
  {
    status: "CANCELLED",
    cancelled_at: new Date(),
    cancellation_reason: request.body.reason || null,
    updatedAt: new Date()
  }
  ```

## Database Collections to Update

### 1. `invoices` Collection
- **Filter**: `{ _id: invoiceId }`
- **Update**: 
  ```javascript
  {
    $set: {
      status: "CANCELLED",
      cancelled_at: new Date(),
      cancellation_reason: reason,
      updatedAt: new Date()
    }
  }
  ```

### 2. `invoice_requests` Collection (or `invoicerequests`)
- **Filter**: `{ _id: invoice.request_id }` (if `invoice.request_id` exists)
- **Update**:
  ```javascript
  {
    $set: {
      status: "CANCELLED",
      cancelled_at: new Date(),
      cancellation_reason: reason,
      updatedAt: new Date()
    }
  }
  ```

### 3. `bookings` Collection
- **Filter**: `{ _id: invoice.request_id }` OR `{ request_id: invoice.request_id }` (depending on schema)
- **Update**:
  ```javascript
  {
    $set: {
      status: "CANCELLED",
      cancelled_at: new Date(),
      cancellation_reason: reason,
      updatedAt: new Date()
    }
  }
  ```

### 4. `delivery_assignments` Collection (or equivalent)
- **Filter**: 
  ```javascript
  {
    $or: [
      { request_id: invoice.request_id },
      { invoice_id: invoice._id },
      { awb_number: invoice.awb_number }
    ]
  }
  ```
- **Update**:
  ```javascript
  {
    $set: {
      status: "CANCELLED",
      cancelled_at: new Date(),
      cancellation_reason: reason,
      updatedAt: new Date()
    }
  }
  ```

### 5. `empost` Collection (if invoice status was COMPLETED OR invoice_request exists)
- **Condition**: Update empost if:
  1. Invoice status was "COMPLETED" before cancellation, OR
  2. Invoice has a `request_id` (invoice_request exists)
- **Filter**:
  ```javascript
  {
    $or: [
      { uhawb: invoice.empost_uhawb },
      { awb_number: invoice.awb_number },
      { request_id: invoice.request_id }
    ]
  }
  ```
- **Update**:
  ```javascript
  {
    $set: {
      status: "CANCELLED",
      cancelled_at: new Date(),
      cancellation_reason: reason,
      updatedAt: new Date()
    }
  }
  ```

## Implementation Steps

### Step 1: Fetch Invoice
```javascript
const invoice = await Invoice.findById(invoiceId);
if (!invoice) {
  return res.status(404).json({ success: false, error: "Invoice not found" });
}

if (invoice.status === "CANCELLED") {
  return res.status(400).json({ success: false, error: "Invoice is already cancelled" });
}

const wasCompleted = invoice.status === "COMPLETED";
const hasInvoiceRequest = !!invoice.request_id;
```

### Step 2: Update Invoice
```javascript
await Invoice.findByIdAndUpdate(invoiceId, {
  $set: {
    status: "CANCELLED",
    cancelled_at: new Date(),
    cancellation_reason: req.body.reason || null,
    updatedAt: new Date()
  }
});
```

### Step 3: Update InvoiceRequest (if request_id exists)
```javascript
if (invoice.request_id) {
  await InvoiceRequest.findByIdAndUpdate(invoice.request_id, {
    $set: {
      status: "CANCELLED",
      cancelled_at: new Date(),
      cancellation_reason: req.body.reason || null,
      updatedAt: new Date()
    }
  });
}
```

### Step 4: Update Booking (if request_id exists)
```javascript
if (invoice.request_id) {
  await Booking.findByIdAndUpdate(invoice.request_id, {
    $set: {
      status: "CANCELLED",
      cancelled_at: new Date(),
      cancellation_reason: req.body.reason || null,
      updatedAt: new Date()
    }
  });
}
```

### Step 5: Cancel Delivery Assignments
```javascript
const deliveryAssignmentsResult = await DeliveryAssignment.updateMany(
  {
    $or: [
      { request_id: invoice.request_id },
      { invoice_id: invoice._id },
      { awb_number: invoice.awb_number }
    ]
  },
  {
    $set: {
      status: "CANCELLED",
      cancelled_at: new Date(),
      cancellation_reason: req.body.reason || null,
      updatedAt: new Date()
    }
  }
);
```

### Step 6: Update Empost (if was COMPLETED OR invoice_request exists)
```javascript
let empostUpdated = false;
// Update empost if:
// 1. Invoice was COMPLETED, OR
// 2. Invoice request exists (regardless of invoice status)
const shouldUpdateEmpost = wasCompleted || !!invoice.request_id;

if (shouldUpdateEmpost) {
  const empostResult = await Empost.updateMany(
    {
      $or: [
        { uhawb: invoice.empost_uhawb },
        { awb_number: invoice.awb_number },
        { request_id: invoice.request_id }
      ]
    },
    {
      $set: {
        status: "CANCELLED",
        cancelled_at: new Date(),
        cancellation_reason: req.body.reason || null,
        updatedAt: new Date()
      }
    }
  );
  empostUpdated = empostResult.modifiedCount > 0;
}
```

### Step 7: Return Response
```javascript
res.json({
  success: true,
  message: "Invoice and related entities cancelled successfully",
  data: {
    invoice: updatedInvoice,
    updatedEntities: {
      invoice: true,
      invoiceRequest: !!invoice.request_id,
      booking: !!invoice.request_id,
      deliveryAssignments: deliveryAssignmentsResult.modifiedCount,
      empost: empostUpdated
    }
  }
});
```

## Error Handling

### Error Cases
1. **Invoice not found** (404)
   - Return: `{ success: false, error: "Invoice not found" }`

2. **Invoice already cancelled** (400)
   - Return: `{ success: false, error: "Invoice is already cancelled" }`

3. **Database error** (500)
   - Return: `{ success: false, error: "Failed to cancel invoice", details: error.message }`

4. **Permission denied** (403)
   - Return: `{ success: false, error: "You do not have permission to cancel invoices" }`

## Transaction Support (Recommended)

If using MongoDB transactions, wrap all updates in a transaction to ensure atomicity:

```javascript
const session = await mongoose.startSession();
session.startTransaction();

try {
  // All update operations here
  
  await session.commitTransaction();
  session.endSession();
  
  // Return success response
} catch (error) {
  await session.abortTransaction();
  session.endSession();
  
  // Return error response
}
```

## Testing Checklist

- [ ] Cancel invoice with valid ID
- [ ] Cancel invoice that doesn't exist (404)
- [ ] Cancel invoice that's already cancelled (400)
- [ ] Verify invoice status updated to CANCELLED
- [ ] Verify invoice request status updated (if exists)
- [ ] Verify booking status updated (if exists)
- [ ] Verify delivery assignments cancelled (if exist)
- [ ] Verify empost updated when invoice was COMPLETED
- [ ] Verify empost updated when invoice_request exists (regardless of invoice status)
- [ ] Verify empost NOT updated when invoice was not COMPLETED AND no invoice_request exists
- [ ] Test with invoice that has no related entities
- [ ] Test with invoice that has all related entities
- [ ] Verify cancellation_reason is saved
- [ ] Verify cancelled_at timestamp is saved
- [ ] Test transaction rollback on error

## Notes

1. **Status Values**: Ensure all collections use consistent status values. If your system uses different status values (e.g., "CANCELED" vs "CANCELLED"), adjust accordingly.

2. **Collection Names**: Adjust collection names based on your actual schema:
   - `invoice_requests` vs `invoicerequests`
   - `delivery_assignments` vs `deliveryassignments` vs `deliveries`

3. **Field Names**: Adjust field names based on your schema:
   - `request_id` vs `requestId`
   - `cancelled_at` vs `cancelledAt`
   - `cancellation_reason` vs `cancellationReason`

4. **Empost Update Logic**: The empost update should happen if:
   - The invoice status was "COMPLETED" before cancellation, OR
   - An invoice_request exists (has `request_id` field)
   
   This ensures that when an invoice_request is cancelled, the related empost record is also cancelled, regardless of the invoice's previous status.

5. **Audit Trail**: Consider adding audit log entries for cancellation actions.

6. **Notifications**: Consider sending notifications to relevant users when an invoice is cancelled.

