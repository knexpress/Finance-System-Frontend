# Backend Implementation: Invoice Data in Audit Reports

## Overview
This document outlines the backend requirements for including invoice data (specifically `tax_rate` and `service_code`) in audit reports so the frontend can properly display "Leviable Item" and "Service Type" columns.

## Requirements

### 1. Include Invoice Data in Audit Reports

When generating or returning audit reports, the backend should include invoice data with the following fields:

**Required Invoice Fields:**
- `tax_rate`: The tax rate from the invoice (0, 5, etc.)
- `service_code`: The service code from the invoice (e.g., "UAE_TO_PH", "PH_TO_UAE")

### 2. Data Structure

The audit report should include invoice data in one of these formats:

**Option 1: Embedded Invoice Object**
```json
{
  "_id": "report_id",
  "report_data": {
    "invoice": {
      "_id": "invoice_id",
      "tax_rate": 5,
      "service_code": "UAE_TO_PH",
      "invoice_id": "INV-000164",
      "total_amount": 1500.00,
      // ... other invoice fields
    },
    "awb_number": "PHL6AC1XR47HQ5K",
    // ... other report data
  }
}
```

**Option 2: Invoice Fields at Report Data Level**
```json
{
  "_id": "report_id",
  "report_data": {
    "tax_rate": 5,
    "service_code": "UAE_TO_PH",
    "invoice_id": "invoice_id",
    "awb_number": "PHL6AC1XR47HQ5K",
    // ... other report data
  }
}
```

**Option 3: Populated Invoice Reference**
```json
{
  "_id": "report_id",
  "report_data": {
    "invoice_id": {
      "_id": "invoice_id",
      "tax_rate": 5,
      "service_code": "UAE_TO_PH",
      // ... other invoice fields
    },
    "awb_number": "PHL6AC1XR47HQ5K",
    // ... other report data
  }
}
```

### 3. Frontend Logic

The frontend will determine:

**Leviable Item:**
- If `tax_rate === 0` or `tax_rate === null` or `tax_rate === undefined` → **"Non-Leviable"**
- Otherwise → **"Leviable"**

**Service Type:**
- Uses `service_code` from invoice (e.g., "UAE_TO_PH", "PH_TO_UAE")
- Falls back to `service_type` if `service_code` is not available

### 4. Implementation Example

**When Creating Audit Report:**
```javascript
// When generating audit report from invoice
const auditReport = {
  report_data: {
    invoice_id: invoice._id,
    invoice: {
      _id: invoice._id,
      tax_rate: invoice.tax_rate, // Include tax_rate
      service_code: invoice.service_code, // Include service_code
      invoice_id: invoice.invoice_id,
      total_amount: invoice.total_amount,
      // ... other invoice fields
    },
    awb_number: invoice.request_id?.awb_number,
    // ... other report data
  }
};
```

**When Fetching Audit Reports:**
```javascript
// GET /api/reports
router.get('/', authenticate, async (req, res) => {
  try {
    const reports = await Report.find()
      .populate({
        path: 'report_data.invoice_id',
        select: 'tax_rate service_code invoice_id total_amount', // Include tax_rate and service_code
        model: 'Invoice'
      })
      .lean();
    
    return res.json({
      success: true,
      data: reports
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});
```

### 5. Database Schema Updates

Ensure the `reports` collection can store invoice data:

**Option 1: Embedded Invoice Object**
```javascript
{
  _id: ObjectId,
  report_data: {
    invoice: {
      _id: ObjectId,
      tax_rate: Number, // 0, 5, etc.
      service_code: String, // "UAE_TO_PH", "PH_TO_UAE", etc.
      invoice_id: String,
      total_amount: Number,
      // ... other invoice fields
    },
    // ... other report data
  }
}
```

**Option 2: Invoice Reference with Populate**
```javascript
{
  _id: ObjectId,
  report_data: {
    invoice_id: ObjectId, // Reference to Invoice collection
    tax_rate: Number, // Denormalized for quick access
    service_code: String, // Denormalized for quick access
    // ... other report data
  }
}
```

### 6. Migration Strategy

If existing audit reports don't have invoice data:

1. **Backfill Script:**
   - Find all audit reports with `invoice_id` but missing `tax_rate` or `service_code`
   - Fetch invoice data from `invoices` collection
   - Update audit reports with invoice data

2. **Example Migration:**
```javascript
async function backfillInvoiceData() {
  const reports = await Report.find({
    'report_data.invoice_id': { $exists: true },
    $or: [
      { 'report_data.tax_rate': { $exists: false } },
      { 'report_data.service_code': { $exists: false } }
    ]
  });
  
  for (const report of reports) {
    const invoiceId = report.report_data.invoice_id;
    const invoice = await Invoice.findById(invoiceId);
    
    if (invoice) {
      report.report_data.tax_rate = invoice.tax_rate;
      report.report_data.service_code = invoice.service_code;
      await report.save();
    }
  }
}
```

### 7. Testing Checklist

- [ ] Audit reports include `tax_rate` from invoice
- [ ] Audit reports include `service_code` from invoice
- [ ] Leviable Item shows "Non-Leviable" when tax_rate is 0
- [ ] Leviable Item shows "Leviable" when tax_rate is 5 or other non-zero value
- [ ] Service Type shows correct service_code (e.g., "UAE_TO_PH")
- [ ] Historical reports without invoice data still work (fallback to additional_info2)
- [ ] Regular reports with invoice data show correct leviable and service type
- [ ] Backfill script successfully updates existing reports

### 8. Notes

- The frontend will check multiple locations for `tax_rate` and `service_code`:
  - `report_data.invoice.tax_rate`
  - `report_data.tax_rate`
  - `report_data.invoice.service_code`
  - `report_data.service_code`
- For historical uploads, if invoice data is not available, the frontend will fall back to `additional_info2` for leviable item
- Service Type will show "N/A" if service_code is not available
- Tax rate can be stored as Number or Decimal128 (frontend handles both)

