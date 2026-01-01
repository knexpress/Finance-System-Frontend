# Backend Implementation: COD Delivery Charge Field

## Overview
This document describes the backend changes required to implement a separate `cod_delivery_charge` field for PH TO UAE COD invoices, ensuring independence between COD and Tax invoice delivery charges.

## Problem Statement
Currently, COD invoice delivery charges are stored in `delivery_base_amount`, which can cause issues when editing. We need a dedicated `cod_delivery_charge` field that is:
1. Separate from Tax invoice `delivery_charge`
2. Persisted to the database when editing COD invoices
3. Independent from Tax invoice edits

## Database Schema Changes

### Invoice Model
Add a new field to the Invoice schema:

```javascript
{
  cod_delivery_charge: {
    type: Number,
    default: null,
    // Optional: Decimal128 if using MongoDB Decimal128 for precision
  }
}
```

### Migration Strategy
1. Keep `delivery_base_amount` field for backward compatibility (existing invoices may still use it)
2. When reading invoices, prioritize `cod_delivery_charge` if available, otherwise fall back to `delivery_base_amount`
3. New COD invoice edits should use `cod_delivery_charge`

## API Endpoint Changes

### Update Invoice Unified Endpoint (`PUT /api/invoices/unified/:id`)

#### Request Payload
When `invoice_type: 'COD'` is provided in the payload, accept and update:

```javascript
{
  invoice_type: 'COD',
  cod_delivery_charge: Number, // New field for COD delivery charge
  amount: Number,              // Shipping charge (preserved for COD calculations)
  pickup_charge: Number,       // Pickup charge
  total_amount_cod: Number,    // Total COD amount
  receiver_name: String,
  receiver_address: String,
  receiver_phone: String,
  notes: String,
  // ... other COD-specific fields
}
```

#### Implementation Details

1. **Field Independence**:
   - When `invoice_type: 'COD'` is provided, update `cod_delivery_charge` field
   - Do NOT update `delivery_charge` field (this is for Tax invoices only)
   - Do NOT update `amount` field (this is shipping charge, must be preserved)

2. **When `invoice_type: 'TAX'` is provided**:
   - Update `delivery_charge` field (Tax invoice delivery charge)
   - Do NOT update `cod_delivery_charge` field (preserve COD delivery charge)
   - Do NOT update `amount` field (preserve shipping charge for COD)

3. **Validation**:
   - Ensure `cod_delivery_charge` is a valid number (>= 0)
   - If provided, validate it's not negative
   - Allow null/undefined (for backward compatibility)

4. **Response**:
   - Return updated invoice with `cod_delivery_charge` field included
   - Ensure the field is properly serialized (handle Decimal128 if used)

### Invoice Creation/Generation
When generating PH TO UAE invoices:
- Set `cod_delivery_charge` based on delivery base amount (if weight < 15kg)
- Set `delivery_charge` for Tax invoice calculations
- Keep both fields independent

## Backend Code Example

### Invoice Model (Mongoose Schema)
```javascript
const invoiceSchema = new Schema({
  // ... existing fields
  delivery_charge: {
    type: Number,
    default: 0
  },
  cod_delivery_charge: {
    type: Number,
    default: null  // New field for COD invoices
  },
  delivery_base_amount: {
    type: Number,
    default: null  // Keep for backward compatibility
  },
  // ... other fields
});
```

### Update Invoice Handler
```javascript
async function updateInvoiceUnified(req, res) {
  const { id } = req.params;
  const { invoice_type, cod_delivery_charge, delivery_charge, ...otherFields } = req.body;
  
  const updatePayload = { ...otherFields };
  
  if (invoice_type === 'COD') {
    // COD invoice update
    if (cod_delivery_charge !== undefined) {
      updatePayload.cod_delivery_charge = parseFloat(cod_delivery_charge);
    }
    // Explicitly do NOT update delivery_charge
    // Explicitly do NOT update amount (shipping charge must be preserved)
  } else if (invoice_type === 'TAX') {
    // Tax invoice update
    if (delivery_charge !== undefined) {
      updatePayload.delivery_charge = parseFloat(delivery_charge);
    }
    // Explicitly do NOT update cod_delivery_charge
    // Explicitly do NOT update amount (shipping charge must be preserved)
  }
  
  const updatedInvoice = await Invoice.findByIdAndUpdate(
    id,
    updatePayload,
    { new: true, runValidators: true }
  );
  
  return res.json({
    success: true,
    data: updatedInvoice
  });
}
```

### Invoice Retrieval (Read)
```javascript
// When reading invoices, prioritize cod_delivery_charge
// Frontend will handle fallback to delivery_base_amount for backward compatibility
// But backend should always return cod_delivery_charge if it exists
```

## Frontend Expectations

The frontend expects:
1. `cod_delivery_charge` field in the invoice response
2. When saving COD invoice edits, the field is sent as `cod_delivery_charge` in the payload
3. When saving Tax invoice edits, `delivery_charge` is sent (not `cod_delivery_charge`)
4. The field persists after page refresh (saved to database)
5. COD and Tax invoice delivery charges remain independent

## Testing Checklist

- [ ] Create new PH TO UAE invoice - verify `cod_delivery_charge` is set correctly
- [ ] Edit COD invoice delivery charge - verify `cod_delivery_charge` is updated
- [ ] Edit Tax invoice delivery charge - verify `cod_delivery_charge` is NOT affected
- [ ] Verify `delivery_charge` (Tax) and `cod_delivery_charge` (COD) remain independent
- [ ] Verify `amount` (shipping) is preserved when editing either invoice type
- [ ] Verify backward compatibility with existing invoices using `delivery_base_amount`
- [ ] Verify weight >= 15kg free delivery logic still works (cod_delivery_charge stored but displayed as 0)

## Migration Notes

1. **Existing Invoices**: Existing invoices may not have `cod_delivery_charge`. Frontend handles fallback to `delivery_base_amount` for backward compatibility.

2. **Data Migration (Optional)**: If you want to migrate existing `delivery_base_amount` values to `cod_delivery_charge`:
   ```javascript
   // One-time migration script
   await Invoice.updateMany(
     { 
       service_code: 'PH_TO_UAE',
       delivery_base_amount: { $exists: true, $ne: null },
       cod_delivery_charge: null
     },
     { 
       $set: { 
         cod_delivery_charge: '$delivery_base_amount' 
       } 
     }
   );
   ```

3. **Field Naming**: The field is named `cod_delivery_charge` (not `codDeliveryCharge`) to match frontend expectations. Adjust if your backend uses camelCase.

## Summary

- Add `cod_delivery_charge` field to Invoice model
- Update invoice update endpoint to handle `cod_delivery_charge` when `invoice_type: 'COD'`
- Ensure COD and Tax invoice delivery charges remain independent
- Preserve `amount` (shipping charge) when editing either invoice type
- Maintain backward compatibility with `delivery_base_amount`

