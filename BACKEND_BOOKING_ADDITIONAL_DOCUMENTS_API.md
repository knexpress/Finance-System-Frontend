# Backend API: Booking Additional Documents (Confirmation Form & Trade License)

## Overview
This document specifies the backend API requirements for handling additional documents in booking creation and retrieval. These documents are specific to "UAE to Pinas" and "Pinas to UAE" booking types.

## Additional Documents

### Document Types
1. **Confirmation Form** - Optional document for UAE to Pinas and Pinas to UAE bookings
2. **Trade License** - Optional document for UAE to Pinas and Pinas to UAE bookings

## API Endpoints

### 1. Create Booking (POST `/api/bookings`)

#### Request Body
The booking creation request should accept the following additional fields in the `identityDocuments` object:

```json
{
  "service": "uae-to-pinas" | "pinas-to-uae",
  "service_code": "UAE_TO_PH" | "PH_TO_UAE",
  "identityDocuments": {
    "eidFrontImage": "data:image/...;base64,..." | null,
    "eidBackImage": "data:image/...;base64,..." | null,
    "philippinesIdFront": "data:image/...;base64,...",
    "philippinesIdBack": "data:image/...;base64,...",
    "confirmationForm": "data:image/...;base64,..." | null,  // NEW FIELD
    "tradeLicense": "data:image/...;base64,..." | null,      // NEW FIELD
    "customerImage": "data:image/...;base64,..." | null,
    "customerImages": ["data:image/...;base64,..."] | null
  },
  // ... other booking fields
}
```

#### Field Specifications

##### `identityDocuments.confirmationForm`
- **Type**: `string | null`
- **Format**: Base64-encoded image data URI (e.g., `data:image/jpeg;base64,...`)
- **Required**: No (optional)
- **Valid For**: 
  - `UAE_TO_PH` (UAE to Pinas) bookings
  - `PH_TO_UAE` (Pinas to UAE) bookings
- **Description**: Confirmation form document image
- **Storage**: Should be stored in the `identityDocuments` object within the booking document

##### `identityDocuments.tradeLicense`
- **Type**: `string | null`
- **Format**: Base64-encoded image data URI (e.g., `data:image/jpeg;base64,...`)
- **Required**: No (optional)
- **Valid For**: 
  - `UAE_TO_PH` (UAE to Pinas) bookings
  - `PH_TO_UAE` (Pinas to UAE) bookings
- **Description**: Trade license document image
- **Storage**: Should be stored in the `identityDocuments` object within the booking document

#### Database Storage

##### Collection: `bookings`

The booking document should store these fields as follows:

```javascript
{
  _id: ObjectId("..."),
  service: "uae-to-pinas" | "pinas-to-uae",
  service_code: "UAE_TO_PH" | "PH_TO_UAE",
  identityDocuments: {
    eidFrontImage: String | null,
    eidBackImage: String | null,
    philippinesIdFront: String,
    philippinesIdBack: String,
    confirmationForm: String | null,  // NEW: Store base64 image data
    tradeLicense: String | null,      // NEW: Store base64 image data
    customerImage: String | null,
    customerImages: [String] | null
  },
  // ... other booking fields
  createdAt: Date,
  updatedAt: Date
}
```

**Important Notes:**
- Both `confirmationForm` and `tradeLicense` are **optional fields**
- They should be stored as **base64-encoded strings** (full data URI format)
- If not provided, these fields should be `null` or omitted from the document
- These fields should be preserved when updating bookings
- These fields should be included when retrieving booking data

### 2. Get Booking (GET `/api/bookings/:id`)

#### Response
The booking retrieval endpoint should return the `identityDocuments` object with all fields, including:

```json
{
  "success": true,
  "data": {
    "_id": "...",
    "service": "uae-to-pinas",
    "service_code": "UAE_TO_PH",
    "identityDocuments": {
      "eidFrontImage": "data:image/...;base64,..." | null,
      "eidBackImage": "data:image/...;base64,..." | null,
      "philippinesIdFront": "data:image/...;base64,...",
      "philippinesIdBack": "data:image/...;base64,...",
      "confirmationForm": "data:image/...;base64,..." | null,  // Include if exists
      "tradeLicense": "data:image/...;base64,..." | null,      // Include if exists
      "customerImage": "data:image/...;base64,..." | null,
      "customerImages": ["data:image/...;base64,..."] | null
    },
    // ... other booking fields
  }
}
```

### 3. Get Booking for Review (GET `/api/bookings/:id/review`)

#### Response
Same structure as Get Booking. Should include `confirmationForm` and `tradeLicense` in the response.

### 4. Update Booking (PUT `/api/bookings/:id`)

#### Request Body
When updating a booking, the `identityDocuments` object can include:

```json
{
  "identityDocuments": {
    "confirmationForm": "data:image/...;base64,..." | null,
    "tradeLicense": "data:image/...;base64,..." | null
    // ... other identity document fields
  }
}
```

**Behavior:**
- If `confirmationForm` is provided, update the field (can be set to `null` to remove)
- If `tradeLicense` is provided, update the field (can be set to `null` to remove)
- If these fields are not included in the update request, leave them unchanged

## Business Logic

### Validation Rules

1. **Service Type Validation**:
   - `confirmationForm` and `tradeLicense` are only valid for:
     - `UAE_TO_PH` (UAE to Pinas) bookings
     - `PH_TO_UAE` (Pinas to UAE) bookings
   - For other service types, these fields should be ignored or rejected

2. **Image Format Validation**:
   - Both fields must be valid base64-encoded image data URIs
   - Supported formats: JPEG, PNG, WebP
   - Maximum size: 10MB per image (before base64 encoding)
   - Validate that the data URI format is correct: `data:image/[type];base64,[data]`

3. **Optional Fields**:
   - Both fields are optional
   - A booking can have:
     - Neither document
     - Only confirmation form
     - Only trade license
     - Both documents

### Data Processing

1. **Storage**:
   - Store the complete base64 data URI as received from the frontend
   - Do not modify or process the base64 string
   - Preserve the original format: `data:image/[type];base64,[data]`

2. **Retrieval**:
   - Always include `confirmationForm` and `tradeLicense` in booking responses
   - Return `null` if the field doesn't exist
   - Do not filter out these fields even if they are `null`

3. **Updates**:
   - Allow updating these fields independently
   - Allow setting to `null` to remove a document
   - Preserve existing values if not included in update request

## Error Handling

### Validation Errors

1. **Invalid Image Format**:
   ```json
   {
     "success": false,
     "error": "Invalid image format for confirmationForm. Expected base64 data URI."
   }
   ```

2. **Image Too Large**:
   ```json
   {
     "success": false,
     "error": "confirmationForm image exceeds maximum size of 10MB."
   }
   ```

3. **Invalid Service Type**:
   ```json
   {
     "success": false,
     "error": "confirmationForm and tradeLicense are only valid for UAE_TO_PH and PH_TO_UAE service types."
   }
   ```

## Example Requests

### Example 1: Create Booking with Both Documents

```json
POST /api/bookings
{
  "service": "uae-to-pinas",
  "service_code": "UAE_TO_PH",
  "awb": "AE123456789",
  "sender": {
    "fullName": "John Doe",
    "address": "Dubai, UAE",
    "phone": "+971501234567"
  },
  "receiver": {
    "fullName": "Jane Smith",
    "address": "Manila, Philippines",
    "phone": "+639123456789"
  },
  "identityDocuments": {
    "eidFrontImage": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "eidBackImage": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "philippinesIdFront": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "philippinesIdBack": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "confirmationForm": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "tradeLicense": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
  },
  "items": [
    {
      "name": "Electronics",
      "qty": 2
    }
  ]
}
```

### Example 2: Create Booking with Only Confirmation Form

```json
POST /api/bookings
{
  "service": "pinas-to-uae",
  "service_code": "PH_TO_UAE",
  "identityDocuments": {
    "philippinesIdFront": "data:image/jpeg;base64,...",
    "philippinesIdBack": "data:image/jpeg;base64,...",
    "confirmationForm": "data:image/jpeg;base64,...",
    "tradeLicense": null
  }
}
```

### Example 3: Get Booking Response

```json
GET /api/bookings/507f1f77bcf86cd799439011
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "service": "uae-to-pinas",
    "service_code": "UAE_TO_PH",
    "awb": "AE123456789",
    "identityDocuments": {
      "eidFrontImage": "data:image/jpeg;base64,...",
      "eidBackImage": "data:image/jpeg;base64,...",
      "philippinesIdFront": "data:image/jpeg;base64,...",
      "philippinesIdBack": "data:image/jpeg;base64,...",
      "confirmationForm": "data:image/jpeg;base64,...",
      "tradeLicense": "data:image/jpeg;base64,...",
      "customerImage": null,
      "customerImages": null
    }
  }
}
```

### Example 4: Update Booking to Add Trade License

```json
PUT /api/bookings/507f1f77bcf86cd799439011
{
  "identityDocuments": {
    "tradeLicense": "data:image/jpeg;base64,..."
  }
}
```

## Database Schema

### MongoDB Collection: `bookings`

```javascript
{
  _id: ObjectId,
  service: String,              // "uae-to-pinas" | "pinas-to-uae" | ...
  service_code: String,         // "UAE_TO_PH" | "PH_TO_UAE" | ...
  awb: String,
  sender: Object,
  receiver: Object,
  items: Array,
  identityDocuments: {
    eidFrontImage: String | null,
    eidBackImage: String | null,
    philippinesIdFront: String,
    philippinesIdBack: String,
    confirmationForm: String | null,  // NEW FIELD
    tradeLicense: String | null,      // NEW FIELD
    customerImage: String | null,
    customerImages: [String] | null
  },
  status: String,
  review_status: String,
  createdAt: Date,
  updatedAt: Date
}
```

## Migration Notes

If existing bookings in the database don't have these fields:

1. **No Migration Required**: These are optional fields
2. **Default Behavior**: When querying, return `null` for missing fields
3. **Backward Compatibility**: Existing bookings without these fields should continue to work normally

## Testing Checklist

- [ ] Create booking with both `confirmationForm` and `tradeLicense`
- [ ] Create booking with only `confirmationForm`
- [ ] Create booking with only `tradeLicense`
- [ ] Create booking without either document
- [ ] Retrieve booking and verify both documents are included
- [ ] Update booking to add `confirmationForm`
- [ ] Update booking to add `tradeLicense`
- [ ] Update booking to remove `confirmationForm` (set to null)
- [ ] Verify documents are only accepted for `UAE_TO_PH` and `PH_TO_UAE` service types
- [ ] Verify image format validation
- [ ] Verify image size validation (10MB limit)
- [ ] Test with invalid base64 format
- [ ] Test with non-image data URI

## Frontend Integration Notes

The frontend sends these fields as part of the `identityDocuments` object when creating bookings. The backend should:

1. Accept and validate the fields
2. Store them in the database
3. Return them in all booking retrieval endpoints
4. Allow updating them independently

## Summary

- **Fields**: `confirmationForm` and `tradeLicense` in `identityDocuments` object
- **Type**: Base64-encoded image data URIs (strings)
- **Required**: No (optional)
- **Valid For**: `UAE_TO_PH` and `PH_TO_UAE` service types only
- **Storage**: Store in `bookings` collection under `identityDocuments` object
- **Retrieval**: Always include in booking responses (return `null` if not present)
- **Updates**: Allow independent updates, including setting to `null` to remove

