# Backend Implementation: PH TO UAE Invoice Edit Support

## Overview
The frontend now supports separate editing for PH TO UAE COD and Tax invoices. The backend needs to handle these separate edit operations and update the appropriate fields.

## API Endpoint
**PUT /api/invoices/:id** (or your existing invoice update endpoint)

## Request Payload Structure

### 1. COD Invoice Edit (PH TO UAE)
When `invoice_type: 'COD'` is present in the payload, the backend should:

**Required Fields:**
- `amount` (number) - Shipping charge for COD invoice
- `delivery_base_amount` (number) - Base delivery amount
- `total_amount_cod` (number) - Total amount for COD invoice (Shipping + Delivery)
- `receiver_name` (string, optional) - Receiver name
- `receiver_address` (string, optional) - Receiver address
- `receiver_phone` (string, optional) - Receiver phone
- `notes` (string, optional) - Notes

**Fixed Values:**
- `tax_rate` = 0 (COD invoices have no tax)
- `tax_amount` = 0
- `subtotal` = `total_amount_cod` (same as total for COD)

**Backend Actions:**
1. Update `invoice.amount` with the shipping charge
2. Update `invoice.delivery_base_amount` with the base delivery amount
3. Update `invoice.total_amount_cod` with the total COD amount
4. Set `invoice.tax_rate` = 0
5. Set `invoice.tax_amount` = 0
6. Set `invoice.total_amount` = `total_amount_cod` (for consistency)
7. Set `invoice.subtotal` = `total_amount_cod`
8. Update receiver fields if provided
9. Update notes if provided

**Example Payload:**
```json
{
  "invoice_type": "COD",
  "amount": 520.00,
  "delivery_base_amount": 20.00,
  "total_amount_cod": 540.00,
  "receiver_name": "John Doe",
  "receiver_address": "Dubai, UAE",
  "receiver_phone": "+971501234567",
  "notes": "Updated COD invoice",
  "tax_rate": 0,
  "tax_amount": 0,
  "subtotal": 540.00,
  "total": 540.00
}
```

### 2. Tax Invoice Edit (PH TO UAE)
When `invoice_type: 'TAX'` is present in the payload, the backend should:

**Required Fields:**
- `delivery_charge` (number) - Delivery charge (calculated with boxes)
- `tax_amount` (number) - Tax amount (5% of delivery charge)
- `total_amount_tax_invoice` (number) - Total amount for Tax invoice (Delivery + Tax)
- `receiver_name` (string, optional) - Receiver name
- `receiver_address` (string, optional) - Receiver address
- `receiver_phone` (string, optional) - Receiver phone
- `notes` (string, optional) - Notes

**Fixed Values:**
- `tax_rate` = 5 (Tax invoices always have 5% VAT)
- `amount` = 0 (Shipping is hidden in tax invoice)
- `subtotal` = `delivery_charge` (only delivery, no shipping)

**Backend Actions:**
1. Update `invoice.delivery_charge` with the delivery charge
2. Update `invoice.total_amount_tax_invoice` with the total tax invoice amount
3. Set `invoice.tax_rate` = 5
4. Set `invoice.tax_amount` = provided tax_amount
5. Set `invoice.amount` = 0 (shipping hidden in tax invoice)
6. Set `invoice.total_amount` = `total_amount_tax_invoice` (for consistency)
7. Set `invoice.subtotal` = `delivery_charge`
8. Update receiver fields if provided
9. Update notes if provided

**Example Payload:**
```json
{
  "invoice_type": "TAX",
  "delivery_charge": 37.00,
  "tax_rate": 5,
  "tax_amount": 1.85,
  "total_amount_tax_invoice": 38.85,
  "amount": 0,
  "subtotal": 37.00,
  "total": 38.85,
  "receiver_name": "John Doe",
  "receiver_address": "Dubai, UAE",
  "receiver_phone": "+971501234567",
  "notes": "Updated Tax invoice"
}
```

## Important Notes

1. **Separate Storage**: The backend should maintain both `total_amount_cod` and `total_amount_tax_invoice` separately, as they represent different invoice types for the same shipment.

2. **Invoice Type Detection**: Check for `invoice_type` field in the payload to determine which type of edit is being performed.

3. **Field Validation**: 
   - For COD: Ensure `total_amount_cod` = `amount` + `delivery_base_amount`
   - For Tax: Ensure `total_amount_tax_invoice` = `delivery_charge` + `tax_amount`

4. **Response**: Return the updated invoice object with all fields populated, including:
   - `total_amount_cod` (for COD invoices)
   - `total_amount_tax_invoice` (for Tax invoices)
   - `delivery_base_amount` (for COD invoices)
   - All updated receiver fields
   - Updated charges and totals

5. **Audit Trail**: Log all edits with the invoice type (COD or TAX) for tracking purposes.

## Database Schema Updates (if needed)

Ensure the invoice model/schema includes:
- `total_amount_cod` (Decimal/Number)
- `total_amount_tax_invoice` (Decimal/Number)
- `delivery_base_amount` (Decimal/Number)
- `invoice_type` (String, optional - for tracking edit type)

## Testing Scenarios

1. **COD Invoice Edit**: Edit shipping charge and delivery base amount, verify `total_amount_cod` updates correctly
2. **Tax Invoice Edit**: Edit delivery charge, verify tax amount (5%) and `total_amount_tax_invoice` calculate correctly
3. **Receiver Info Edit**: Update receiver details in both COD and Tax invoice edits
4. **Mixed Edits**: Edit COD invoice, then edit Tax invoice, verify both totals are stored separately

## Frontend-Backend Contract

The frontend will:
- Send `invoice_type: 'COD'` or `invoice_type: 'TAX'` in the payload
- Calculate totals on the frontend for validation
- Expect the backend to store and return both `total_amount_cod` and `total_amount_tax_invoice`
- Re-fetch the invoice after update to ensure data consistency

The backend should:
- Accept and process both invoice types
- Validate calculations
- Store both totals separately
- Return complete invoice object with all fields

