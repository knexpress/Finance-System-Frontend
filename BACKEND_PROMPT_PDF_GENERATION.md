# Backend API Requirements for Booking PDF Generation

## Overview
The frontend has a "Download PDF" button in the Booking Review Modal that generates a PDF document for booking requests. This document specifies the backend API requirements to support this functionality.

## API Endpoint

### GET `/bookings/:id/review`

**Purpose**: Fetch complete booking data from the `invoiceRequestCollection` (or equivalent booking collection) with all nested data required for PDF generation.

**Request**:
```
GET /api/bookings/:id/review
Headers:
  Authorization: Bearer <token>
```

**Response Format**:
The endpoint should return a complete booking object with all nested structures. The response should match the following structure:

```json
{
  "success": true,
  "data": {
    "_id": "booking_id_here",
    "booking_id": "optional_booking_id",
    
    // Service Information
    "service": "UAE_TO_PH" | "PH_TO_UAE" | "UAE_TO_PINAS" | etc.,
    "service_code": "UAE_TO_PH" | "PH_TO_UAE" | etc.,
    
    // AWB Number (can be in multiple locations)
    "awb": "AWB123456789",
    "awb_number": "AWB123456789",
    "awbNumber": "AWB123456789",
    
    // Sender Information (can be nested in sender object or top-level)
    "sender": {
      "fullName": "John Doe",
      "name": "John Doe",
      "completeAddress": "123 Main St, Dubai, UAE",
      "address": "123 Main St, Dubai, UAE",
      "contactNo": "+971501234567",
      "phone": "+971501234567",
      "phoneNumber": "+971501234567",
      "emailAddress": "john@example.com",
      "email": "john@example.com",
      "agentName": "Sales Agent Name",
      "deliveryOption": "warehouse" | "pickup",
      "insured": true | false,
      "declaredAmount": 1000,
      "declared_amount": 1000
    },
    
    // Alternative: Sender data at top level
    "customer_name": "John Doe",
    "customer_phone": "+971501234567",
    "customer_email": "john@example.com",
    "sender_address": "123 Main St, Dubai, UAE",
    "senderAddress": "123 Main St, Dubai, UAE",
    "origin_place": "Dubai, UAE",
    "origin": "Dubai, UAE",
    "sales_agent_name": "Sales Agent Name",
    "agentName": "Sales Agent Name",
    "agent": {
      "name": "Sales Agent Name",
      "full_name": "Sales Agent Name",
      "fullName": "Sales Agent Name"
    },
    "created_by_employee": {
      "full_name": "Employee Name",
      "fullName": "Employee Name",
      "name": "Employee Name"
    },
    "sender_delivery_option": "warehouse" | "pickup",
    
    // Receiver Information (can be nested in receiver object or top-level)
    "receiver": {
      "fullName": "Jane Smith",
      "name": "Jane Smith",
      "completeAddress": "456 Oak Ave, Manila, Philippines",
      "address": "456 Oak Ave, Manila, Philippines",
      "contactNo": "+639123456789",
      "phone": "+639123456789",
      "phoneNumber": "+639123456789",
      "emailAddress": "jane@example.com",
      "email": "jane@example.com",
      "deliveryOption": "warehouse" | "address",
      "numberOfBoxes": 3
    },
    
    // Alternative: Receiver data at top level
    "receiver_name": "Jane Smith",
    "receiverName": "Jane Smith",
    "receiver_phone": "+639123456789",
    "receiverPhone": "+639123456789",
    "receiver_email": "jane@example.com",
    "receiverEmail": "jane@example.com",
    "receiver_address": "456 Oak Ave, Manila, Philippines",
    "receiverAddress": "456 Oak Ave, Manila, Philippines",
    "receiver_delivery_option": "warehouse" | "address",
    "number_of_boxes": 3,
    "numberOfBoxes": 3,
    
    // Items/Commodities (can be in multiple array formats)
    "items": [
      {
        "id": "item_id_1",
        "_id": "item_id_1",
        "commodity": "Electronics",
        "name": "Electronics",
        "description": "Electronics",
        "item": "Electronics",
        "title": "Electronics",
        "qty": 2,
        "quantity": 2,
        "count": 2
      }
    ],
    "orderItems": [...], // Alternative array name
    "listedItems": [...], // Alternative array name
    
    // Identity Documents Images (PRIMARY SOURCE - identityDocuments)
    "identityDocuments": {
      "eidFrontImage": "data:image/jpeg;base64,..." | "https://...",
      "eidBackImage": "data:image/jpeg;base64,..." | "https://...",
      "philippinesIdFront": "data:image/jpeg;base64,..." | "https://...",
      "philippinesIdBack": "data:image/jpeg;base64,..." | "https://...",
      "customerImage": "data:image/jpeg;base64,..." | "https://...",
      "customerImages": [
        "data:image/jpeg;base64,...",
        "data:image/jpeg;base64,..."
      ]
    },
    
    // Alternative: Images in collections
    "collections": {
      "identityDocuments": {
        "eidFrontImage": "...",
        "eidBackImage": "...",
        "philippinesIdFront": "...",
        "philippinesIdBack": "...",
        "customerImage": "...",
        "customerImages": [...]
      }
    },
    
    // Alternative: Images at top level
    "id_front_image": "data:image/jpeg;base64,...",
    "idFrontImage": "data:image/jpeg;base64,...",
    "id_back_image": "data:image/jpeg;base64,...",
    "idBackImage": "data:image/jpeg;base64,...",
    "philippinesIdFront": "data:image/jpeg;base64,...",
    "philippines_id_front": "data:image/jpeg;base64,...",
    "philippinesIdBack": "data:image/jpeg;base64,...",
    "philippines_id_back": "data:image/jpeg;base64,...",
    "customerImage": "data:image/jpeg;base64,...",
    "customerImages": ["data:image/jpeg;base64,..."],
    "face_scan_image": "data:image/jpeg;base64,...",
    "faceScanImage": "data:image/jpeg;base64,...",
    
    // Additional Information
    "declarationText": "Customer declaration text...",
    "declaration_text": "Customer declaration text...",
    "notes": "Additional notes...",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "created_at": "2024-01-01T00:00:00.000Z",
    "submissionTimestamp": "2024-01-01T00:00:00.000Z",
    
    // Nested request_id (if booking is linked to invoice request)
    "request_id": {
      "_id": "request_id_here",
      "service": "UAE_TO_PH",
      "service_code": "UAE_TO_PH",
      "awb": "AWB123456789",
      "awb_number": "AWB123456789",
      "sender": {
        "insured": true,
        "declaredAmount": 1000
      },
      "verification": {
        // Verification data if needed
      }
    },
    
    // Booking reference (if exists)
    "booking": {
      "awb_number": "AWB123456789"
    }
  }
}
```

## Critical Requirements

### 1. Image Data Format
- Images MUST be returned as either:
  - **Base64 data URLs**: `"data:image/jpeg;base64,/9j/4AAQSkZJRg..."` OR
  - **Full HTTP/HTTPS URLs**: `"https://storage.example.com/images/photo.jpg"`
- Images should NOT be returned as:
  - Relative paths only (e.g., `"/uploads/image.jpg"`)
  - File IDs without full URLs
  - Binary data (unless properly encoded)

### 2. Priority Order for Data Fields
The frontend checks fields in this priority order:

**Service Code**:
1. `booking.service`
2. `booking.service_code`
3. `booking.request_id?.service`
4. `booking.request_id?.service_code`

**AWB Number**:
1. `booking.awb`
2. `booking.awb_number`
3. `booking.awbNumber`
4. `booking.request_id?.awb`
5. `booking.request_id?.awb_number`
6. `booking.booking?.awb_number`

**Sender Data**:
1. `booking.sender.fullName` (preferred)
2. `booking.sender.name`
3. `booking.customer_name`
4. `booking.name`

**Receiver Data**:
1. `booking.receiver.fullName` (preferred)
2. `booking.receiver.name`
3. `booking.receiver_name`
4. `booking.receiverName`

**Identity Documents** (PRIMARY SOURCE):
1. `booking.identityDocuments.eidFrontImage` (preferred)
2. `booking.collections.identityDocuments.eidFrontImage`
3. `booking.id_front_image`
4. `booking.idFrontImage`

**Customer Images**:
1. `booking.identityDocuments.customerImages[]` (array, preferred)
2. `booking.collections.identityDocuments.customerImages[]`
3. `booking.customerImages[]`
4. `booking.identityDocuments.customerImage` (singular)
5. `booking.customerImage`

### 3. Required Fields for PDF Generation

**Minimum Required**:
- `_id` or `booking_id` (for reference number)
- `service` or `service_code` (to determine route)
- Sender name and address
- Receiver name and address
- At least one contact number (sender or receiver)

**Optional but Recommended**:
- AWB number
- Items/commodities list
- Identity document images
- Customer face images
- Declaration text
- Delivery options
- Agent name

### 4. Error Handling

**Success Response**:
```json
{
  "success": true,
  "data": { /* booking object */ }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Error message here"
}
```

**HTTP Status Codes**:
- `200`: Success
- `404`: Booking not found
- `401`: Unauthorized
- `500`: Server error

### 5. Performance Considerations

- The endpoint should return complete data in a single request (avoid multiple round trips)
- Images should be included in the response (not fetched separately)
- Consider caching for frequently accessed bookings
- Response time should be < 2 seconds for typical bookings

### 6. Data Collection Source

The endpoint should query the **`invoiceRequestCollection`** (or equivalent booking collection) and return the complete booking document with all nested relationships populated.

## Testing Checklist

- [ ] Endpoint returns complete booking data
- [ ] All image fields are populated with base64 or full URLs
- [ ] Sender and receiver data is accessible (nested or top-level)
- [ ] Items/commodities array is populated
- [ ] Service code is correctly identified
- [ ] AWB number is available (if assigned)
- [ ] Identity documents images are accessible
- [ ] Customer face images are accessible
- [ ] Declaration text is included
- [ ] Delivery options are specified
- [ ] Error handling works for missing bookings
- [ ] Authentication/authorization is enforced

## Example Request/Response

**Request**:
```
GET /api/bookings/507f1f77bcf86cd799439011/review
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response**:
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "service": "UAE_TO_PH",
    "awb": "AWB123456789",
    "sender": {
      "fullName": "Ahmed Al-Mansoori",
      "completeAddress": "Dubai, UAE",
      "contactNo": "+971501234567",
      "emailAddress": "ahmed@example.com",
      "agentName": "John Sales",
      "deliveryOption": "warehouse"
    },
    "receiver": {
      "fullName": "Maria Santos",
      "completeAddress": "Manila, Philippines",
      "contactNo": "+639123456789",
      "emailAddress": "maria@example.com",
      "deliveryOption": "address",
      "numberOfBoxes": 2
    },
    "items": [
      {
        "id": "item1",
        "commodity": "Electronics",
        "qty": 1
      }
    ],
    "identityDocuments": {
      "eidFrontImage": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
      "eidBackImage": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
      "philippinesIdFront": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
      "philippinesIdBack": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
      "customerImages": [
        "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
        "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
      ]
    },
    "declarationText": "I declare that...",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

## Notes

- The frontend will handle fallback logic if some fields are missing
- Images can be in base64 format or full URLs - both are supported
- The PDF generator (`pdfGenerator.ts`) handles all formatting and layout
- The endpoint should prioritize returning data from `identityDocuments` structure as it's the primary source
- All date fields should be in ISO 8601 format

## Questions or Issues?

If you have questions about the data structure or need clarification on any field, please refer to the frontend code:
- `src/components/booking-review-modal.tsx` - PDF generation handler
- `pdfGenerator.ts` - PDF format specification

