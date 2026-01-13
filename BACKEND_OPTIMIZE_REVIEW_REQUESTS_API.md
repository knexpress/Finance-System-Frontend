# Backend API Optimization: Review Requests Endpoint

## Problem
The `/api/bookings/verified-invoices` endpoint is returning too much data, causing slow page load times for the review-requests page (`/dashboard/review-requests`).

## Solution
Implement field selection to allow the frontend to request only the fields needed for display.

## Required Changes

### 1. Update Endpoint to Support Field Selection

**Endpoint:** `GET /api/bookings/verified-invoices`

**Query Parameter:** `fields` (optional, comma-separated list of field paths)

**Example Request:**
```
GET /api/bookings/verified-invoices?fields=_id,awb,tracking_code,awb_number,customer_name,receiver_name,origin_place,destination_place,shipment_status,batch_no,invoice_number,service_code,service,sender.completeAddress,sender.country,receiver.completeAddress,receiver.country,request_id.service_code,request_id.service,request_id.awb,request_id.tracking_code,request_id.awb_number,booking.service_code,booking.service,booking.awb,booking.tracking_code,booking.awb_number
```

### 2. Fields Required for Display

The frontend only needs these fields for the review-requests page:

**Direct Booking Fields:**
- `_id`
- `awb`
- `tracking_code`
- `awb_number`
- `customer_name`
- `receiver_name`
- `origin_place`
- `destination_place`
- `shipment_status`
- `batch_no`
- `invoice_number`
- `service_code`
- `service`

**Nested Sender Fields:**
- `sender.completeAddress`
- `sender.country`

**Nested Receiver Fields:**
- `receiver.completeAddress`
- `receiver.country`

**Nested Request ID Fields:**
- `request_id.service_code`
- `request_id.service`
- `request_id.awb`
- `request_id.tracking_code`
- `request_id.awb_number`

**Nested Booking Fields:**
- `booking.service_code`
- `booking.service`
- `booking.awb`
- `booking.tracking_code`
- `booking.awb_number`

### 3. Implementation Details

1. **Parse Fields Parameter:**
   - Split comma-separated field list
   - Handle nested fields (e.g., `sender.completeAddress`)
   - Build MongoDB projection object

2. **MongoDB Projection:**
   ```javascript
   // Example projection based on fields parameter
   const projection = {
     _id: 1,
     awb: 1,
     tracking_code: 1,
     awb_number: 1,
     customer_name: 1,
     receiver_name: 1,
     origin_place: 1,
     destination_place: 1,
     shipment_status: 1,
     batch_no: 1,
     invoice_number: 1,
     service_code: 1,
     service: 1,
     'sender.completeAddress': 1,
     'sender.country': 1,
     'receiver.completeAddress': 1,
     'receiver.country': 1,
     'request_id.service_code': 1,
     'request_id.service': 1,
     'request_id.awb': 1,
     'request_id.tracking_code': 1,
     'request_id.awb_number': 1,
     'booking.service_code': 1,
     'booking.service': 1,
     'booking.awb': 1,
     'booking.tracking_code': 1,
     'booking.awb_number': 1
   };
   ```

3. **Default Behavior:**
   - If `fields` parameter is not provided, return all fields (backward compatibility)
   - If `fields` parameter is provided, only return requested fields

### 4. Performance Benefits

- **Reduced Payload Size:** Only sending necessary data reduces network transfer time
- **Faster Database Queries:** MongoDB projection reduces data read from disk
- **Lower Memory Usage:** Less data to process and store in memory
- **Faster JSON Serialization:** Smaller objects serialize faster

### 5. Testing Checklist

- [ ] Test endpoint without `fields` parameter (should return all fields)
- [ ] Test endpoint with `fields` parameter (should return only requested fields)
- [ ] Test with nested fields (e.g., `sender.completeAddress`)
- [ ] Test with invalid field names (should handle gracefully)
- [ ] Verify response time improvement with field selection
- [ ] Verify payload size reduction
- [ ] Test with large number of bookings (100+)

### 6. Example Response Comparison

**Before (Full Response - ~5KB per booking):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "awb": "ABC123",
      "customer_name": "John Doe",
      // ... 50+ more fields including images, documents, etc.
    }
  ]
}
```

**After (Optimized Response - ~500 bytes per booking):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "awb": "ABC123",
      "customer_name": "John Doe",
      "receiver_name": "Jane Doe",
      "origin_place": "Dubai",
      "destination_place": "Manila",
      "shipment_status": "SHIPMENT_RECEIVED",
      "batch_no": "BATCH-001",
      "invoice_number": "INV-000123",
      "service_code": "UAE_TO_PH",
      "sender": {
        "completeAddress": "Dubai, UAE",
        "country": "UAE"
      },
      "receiver": {
        "completeAddress": "Manila, Philippines",
        "country": "Philippines"
      }
    }
  ]
}
```

### 7. Notes

- The frontend has been updated to request only necessary fields
- This optimization should reduce response time by 70-90% for large datasets
- Consider implementing similar field selection for other list endpoints
- Monitor API response times after deployment to verify improvements

