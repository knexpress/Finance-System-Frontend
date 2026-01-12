# Backend: Image Storage and Retrieval for Booking System

## Overview
This document describes how the backend should store and retrieve identity document images for the booking system to ensure proper display in the frontend.

## Image Storage Format

### Current Format (Base64 in MongoDB)
Images are currently stored as **base64-encoded strings** directly in the MongoDB `bookings` collection under the `identityDocuments` field:

```javascript
{
  identityDocuments: {
    eidFrontImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ...",
    eidBackImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ...",
    philippinesIdFront: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ...",
    philippinesIdBack: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ..."
  }
}
```

## API Endpoint Requirements

### GET /api/bookings/:id (Booking Details)
When retrieving a booking, ensure that:

1. **All image fields are included** in the response
2. **Base64 strings are complete** (not truncated)
3. **Data URL prefix is preserved** (`data:image/...;base64,`)
4. **No image compression or transformation** is applied (return as stored)

**Response Format:**
```json
{
  "success": true,
  "data": {
    "_id": "booking_id",
    "service": "uae-to-pinas",
    "service_code": "UAE_TO_PH",
    "identityDocuments": {
      "eidFrontImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ...",
      "eidBackImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ...",
      "philippinesIdFront": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ...",
      "philippinesIdBack": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ..."
    },
    "sender": { ... },
    "receiver": { ... },
    ...
  }
}
```

### GET /api/bookings (List Bookings)
For list endpoints, you may choose to:
- **Option 1**: Include full base64 strings (can be large)
- **Option 2**: Include placeholder/null for images, require detail endpoint for full data

**Recommended: Option 2** for performance:
```json
{
  "success": true,
  "data": [
    {
      "_id": "booking_id",
      "service": "uae-to-pinas",
      "identityDocuments": {
        "eidFrontImage": null,  // Use detail endpoint for full image
        "eidBackImage": null,
        "philippinesIdFront": null,
        "philippinesIdBack": null
      },
      ...
    }
  ]
}
```

## Image Field Structure

### Required Fields in identityDocuments

#### For UAE_TO_PH Bookings:
- `eidFrontImage`: string (base64) - **Required**
- `eidBackImage`: string (base64) - **Required**
- `philippinesIdFront`: string (base64) - **Required**
- `philippinesIdBack`: string (base64) - **Required**

#### For PH_TO_UAE Bookings:
- `philippinesIdFront`: string (base64) - **Required**
- `philippinesIdBack`: string (base64) - **Required**
- `eidFrontImage`: string (base64) | null - **Optional**
- `eidBackImage`: string (base64) | null - **Optional**

## Validation Requirements

1. **Base64 Format**: All image strings must include the data URL prefix: `data:image/{type};base64,{base64String}`
2. **Image Type**: Supported types: `image/png`, `image/jpeg`, `image/jpg`
3. **Size Limit**: Recommend max 10MB per image (before base64 encoding)
4. **Null Handling**: For optional images, send `null` (not empty string or undefined)
5. **⚠️ CRITICAL: NO HTML ENCODING**: Base64 strings must **NOT** be HTML-encoded. The string `data:image/png;base64,...` should be stored and returned as-is, **NOT** as `data:image&#x2F;png;base64,...`. HTML encoding breaks image display in browsers.

## Frontend Display Requirements

The frontend expects images in the following format:
- **Full base64 data URL** starting with `data:image/...;base64,`
- Images are displayed directly using `<img src={imageString} />`
- No additional processing or transformation needed

## Testing Checklist

Ensure the following work correctly:

1. ✅ Booking creation with 4 images (UAE_TO_PH)
2. ✅ Booking creation with 2-4 images (PH_TO_UAE)
3. ✅ Booking retrieval includes all image fields
4. ✅ Images display correctly in booking review modal
5. ✅ Images display correctly in booking detail view
6. ✅ Optional images (EID for PH_TO_UAE) handle null correctly
7. ✅ Large images (>5MB) are handled without errors
8. ✅ Base64 strings are not truncated in responses

## Example: Storing Booking with Images

```javascript
// When creating a booking via POST /api/bookings
{
  "service": "uae-to-pinas",
  "service_code": "UAE_TO_PH",
  "identityDocuments": {
    "eidFrontImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ...",
    "eidBackImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ...",
    "philippinesIdFront": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ...",
    "philippinesIdBack": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ..."
  },
  // ... other fields
}
```

## Example: Retrieving Booking with Images

```javascript
// Response from GET /api/bookings/:id
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "service": "uae-to-pinas",
    "service_code": "UAE_TO_PH",
    "identityDocuments": {
      "eidFrontImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ...",
      "eidBackImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ...",
      "philippinesIdFront": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ...",
      "philippinesIdBack": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQ..."
    },
    "sender": { ... },
    "receiver": { ... },
    "items": [ ... ],
    "createdAt": "2026-01-06T12:00:00.000Z",
    "updatedAt": "2026-01-06T12:00:00.000Z"
  }
}
```

## Important Notes

1. **Do NOT compress or transform** base64 images when storing or retrieving
2. **Do NOT remove** the `data:image/...;base64,` prefix
3. **⚠️ CRITICAL: Do NOT HTML-encode base64 strings** - Store and return them as raw strings. HTML encoding (e.g., `&#x2F;` instead of `/`) breaks image display in browsers.
4. **Ensure** MongoDB document size limits are respected (16MB max document size)
5. **Consider** GridFS for very large images if document size becomes an issue
6. **Validate** image format and size on the backend before storing
7. **Do NOT sanitize base64 strings** - They should be stored and returned exactly as received from the frontend (with the `data:image/...;base64,` prefix intact)
8. **Index** appropriately if you need to search/filter by image presence

## Alternative: File Storage (Future Enhancement)

If base64 storage becomes problematic due to size:

1. Store images in file system or cloud storage (S3, etc.)
2. Store file paths/URLs in MongoDB
3. Provide separate image endpoints: `GET /api/bookings/:id/images/:imageType`
4. Update frontend to fetch images separately

For now, base64 storage is acceptable for the current requirements.

