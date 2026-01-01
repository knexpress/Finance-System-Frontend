# Backend Implementation: Pickup Charge for PH TO UAE

## Overview
The frontend now sends `pickup_base_amount` to the backend when generating invoices for PH TO UAE shipments where the sender delivery option is "pickup" (pickup in Philippines).

## Frontend Changes
- Frontend sends `pickup_base_amount` in the `createInvoiceUnified` API call
- Only sent for PH TO UAE shipments when `sender_delivery_option === 'pickup'`
- Value comes from user input in the invoice generation dialog

## Backend Requirements

### 1. API Endpoint: `POST /api/invoices/unified`

**Request Body:**
```json
{
  "request_id": "...",
  "client_id": "...",
  "amount": 684,
  "line_items": [...],
  "tax_rate": 5,
  "service_code": "PH_TO_UAE",
  "has_delivery": true,
  "delivery_base_amount": 20,
  "pickup_base_amount": 15,  // NEW FIELD - Only for PH TO UAE when sender_delivery_option is "pickup"
  "customer_trn": "...",
  "batch_number": "...",
  ...
}
```

### 2. Database Schema Update

Add `pickup_base_amount` field to the Invoice model/schema:

```javascript
{
  // ... existing fields
  delivery_base_amount: {
    type: Decimal128,
    default: null
  },
  pickup_base_amount: {  // NEW FIELD
    type: Decimal128,
    default: null
  },
  pickup_charge: {  // This should be calculated/derived from pickup_base_amount
    type: Decimal128,
    default: null
  },
  // ... rest of fields
}
```

### 3. Backend Logic

#### A. Accept and Save `pickup_base_amount`
- Accept `pickup_base_amount` from the request body
- Save it directly to the invoice document
- Only accept if `service_code === 'PH_TO_UAE'` and `sender_delivery_option === 'pickup'`

#### B. Calculate `pickup_charge` (if needed)
- If `pickup_base_amount` is provided, set `pickup_charge = pickup_base_amount`
- This ensures consistency with existing `pickup_charge` field usage

#### C. Include in COD Invoice Total Calculation
For PH TO UAE COD invoices, the total should include pickup charge:
```
total_amount_cod = amount (shipping) + pickup_base_amount + delivery_base_amount (if weight < 15kg)
                 = amount (shipping) + pickup_base_amount + 0 (if weight >= 15kg, free delivery)
```

**Example:**
- Shipping: 684 AED
- Pickup: 15 AED (from pickup_base_amount)
- Delivery: 20 AED (if weight < 15kg) or 0 AED (if weight >= 15kg)
- Total COD: 684 + 15 + 20 = 719 AED (if weight < 15kg)
- Total COD: 684 + 15 + 0 = 699 AED (if weight >= 15kg)

#### D. Tax Invoice Handling
- For PH TO UAE Tax invoices, pickup charge should NOT be included
- Tax invoice total = delivery charge + tax on delivery only
- Pickup charge is only for COD invoices

### 4. Validation

```javascript
// Validate pickup_base_amount
if (service_code === 'PH_TO_UAE' && sender_delivery_option === 'pickup') {
  if (!pickup_base_amount || pickup_base_amount < 0) {
    return res.status(400).json({
      error: 'pickup_base_amount is required and must be >= 0 for PH TO UAE shipments with pickup option'
    });
  }
}
```

### 5. Response

The backend should return the invoice with:
- `pickup_base_amount`: The saved value
- `pickup_charge`: Should equal `pickup_base_amount` (for consistency)

### 6. Example Implementation (Node.js/Express)

```javascript
// In your invoice creation endpoint
const createInvoiceUnified = async (req, res) => {
  try {
    const {
      request_id,
      client_id,
      amount,
      line_items,
      service_code,
      has_delivery,
      delivery_base_amount,
      pickup_base_amount,  // NEW
      // ... other fields
    } = req.body;

    // Validate pickup_base_amount for PH TO UAE
    if (service_code === 'PH_TO_UAE') {
      // Get sender_delivery_option from request
      const request = await InvoiceRequest.findById(request_id);
      const senderDeliveryOption = request?.sender_delivery_option || 
                                   request?.request_id?.sender_delivery_option;
      
      if (senderDeliveryOption === 'pickup') {
        if (pickup_base_amount === undefined || pickup_base_amount === null) {
          return res.status(400).json({
            error: 'pickup_base_amount is required for PH TO UAE shipments with pickup option'
          });
        }
        if (pickup_base_amount < 0) {
          return res.status(400).json({
            error: 'pickup_base_amount must be >= 0'
          });
        }
      }
    }

    // Calculate total_amount_cod for PH TO UAE
    let totalAmountCod = 0;
    if (service_code === 'PH_TO_UAE' && tax_rate === 0) {
      // Get weight from verification
      const request = await InvoiceRequest.findById(request_id);
      const weight = request?.verification?.total_kg || 0;
      const isWeight15kgOrMore = weight >= 15;
      
      // COD Invoice: shipping + pickup + delivery (if weight < 15kg)
      const deliveryCharge = isWeight15kgOrMore ? 0 : (delivery_base_amount || 0);
      const pickupCharge = pickup_base_amount || 0;
      totalAmountCod = amount + pickupCharge + deliveryCharge;
    }

    // Create invoice
    const invoice = new Invoice({
      request_id,
      client_id,
      amount,
      line_items,
      service_code,
      has_delivery,
      delivery_base_amount,
      pickup_base_amount,  // NEW - Save to database
      pickup_charge: pickup_base_amount || 0,  // Set pickup_charge = pickup_base_amount
      total_amount_cod: totalAmountCod,
      // ... other fields
    });

    await invoice.save();

    res.json({
      success: true,
      data: invoice
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
```

## Summary

1. **Accept** `pickup_base_amount` in the API request
2. **Validate** it's provided for PH TO UAE with pickup option
3. **Save** it to the invoice document
4. **Calculate** `total_amount_cod` including pickup charge: `shipping + pickup + delivery (if weight < 15kg)`
5. **Return** the invoice with `pickup_base_amount` and `pickup_charge` fields

The frontend will automatically display the pickup charge in COD invoices for PH TO UAE shipments.



