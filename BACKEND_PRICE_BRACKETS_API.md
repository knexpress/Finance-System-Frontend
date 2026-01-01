# Backend Implementation: Price Brackets API

## Overview
This document outlines the backend API requirements for managing and serving price brackets (weight-based pricing) for different shipping routes. The frontend relies on these APIs to calculate shipping rates dynamically.

**CRITICAL:** The price brackets page (`/dashboard/price-brackets`) displays real-time data from the database and when Finance users update brackets, those changes MUST be persisted to the database immediately. The frontend expects immediate database updates with no caching delays.

## Requirements

### 1. Get Price Brackets Endpoint

**Endpoint:** `GET /api/price-brackets/:route`

**Purpose:** Retrieve all price brackets for a specific shipping route.

**Path Parameters:**
- `route` (required): Either `PH_TO_UAE` or `UAE_TO_PH`

**Request Example:**
```
GET /api/price-brackets/PH_TO_UAE
GET /api/price-brackets/UAE_TO_PH
```

**Response Format:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "bracket_id_1",
      "min": 1,
      "max": 15,
      "rate": 39,
      "label": "1-15 KG",
      "route": "PH_TO_UAE",
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T10:00:00Z"
    },
    {
      "_id": "bracket_id_2",
      "min": 16,
      "max": 29,
      "rate": 38,
      "label": "16-29 KG",
      "route": "PH_TO_UAE",
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T10:00:00Z"
    },
    {
      "_id": "bracket_id_3",
      "min": 30,
      "max": null,
      "rate": 36,
      "label": "30+ KG",
      "route": "PH_TO_UAE",
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

**Alternative Response Format (if using nested structure):**
```json
{
  "success": true,
  "data": {
    "route": "PH_TO_UAE",
    "brackets": [
      {
        "_id": "bracket_id_1",
        "min": 1,
        "max": 15,
        "rate": 39,
        "label": "1-15 KG"
      }
    ]
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Invalid route. Must be PH_TO_UAE or UAE_TO_PH"
}
```

**Status Codes:**
- `200 OK`: Success
- `400 Bad Request`: Invalid route parameter
- `404 Not Found`: Route not found (if route doesn't exist in database)
- `500 Internal Server Error`: Server error

### 2. Update Price Brackets Endpoint

**Endpoint:** `PUT /api/price-brackets/:route`

**Purpose:** Update all price brackets for a specific route. This endpoint should **IMMEDIATELY** save changes to the database and replace all existing brackets for the route with the new ones provided.

**CRITICAL REQUIREMENTS:**
- ✅ Changes MUST be saved to the database immediately (no caching, no delays)
- ✅ Changes MUST be visible in subsequent GET requests immediately
- ✅ Use database transactions to ensure atomicity
- ✅ Invalidate any server-side caches after update
- ✅ Return updated brackets in response so frontend can verify the save
- ✅ Commit transaction before returning success response
- ✅ Do NOT use delayed writes, background jobs, or eventual consistency

**Path Parameters:**
- `route` (required): Either `PH_TO_UAE` or `UAE_TO_PH`

**Request Body:**
```json
{
  "brackets": [
    {
      "min": 1,
      "max": 15,
      "rate": 39,
      "label": "1-15 KG"
    },
    {
      "min": 16,
      "max": 29,
      "rate": 38,
      "label": "16-29 KG"
    },
    {
      "min": 30,
      "max": null,
      "rate": 36,
      "label": "30+ KG"
    }
  ]
}
```

**Response Format:**
```json
{
  "success": true,
  "data": {
    "route": "PH_TO_UAE",
    "brackets": [
      {
        "_id": "bracket_id_1",
        "min": 1,
        "max": 15,
        "rate": 39,
        "label": "1-15 KG",
        "route": "PH_TO_UAE",
        "updated_at": "2024-01-15T10:30:00Z"
      }
    ],
    "deleted_count": 5,
    "inserted_count": 3,
    "message": "Price brackets updated successfully in database"
  }
}
```

**IMPORTANT Response Fields:**
- `brackets`: The actual saved brackets from database (verify by reading back after save)
- `deleted_count`: Number of old brackets that were deleted
- `inserted_count`: Number of new brackets that were inserted
- `message`: Confirmation message that data was saved to database

**Error Response:**
```json
{
  "success": false,
  "error": "Validation failed: Maximum weight must be greater than minimum weight"
}
```

**Status Codes:**
- `200 OK`: Success
- `400 Bad Request`: Validation error or invalid route
- `401 Unauthorized`: User not authenticated
- `403 Forbidden`: User not authorized (should be Finance department only)
- `500 Internal Server Error`: Server error

### 3. Database Schema

#### 3.1 Price Brackets Collection

**Collection Name:** `price_brackets` (or `priceBrackets`)

**Schema:**
```javascript
{
  _id: ObjectId,
  route: String,        // 'PH_TO_UAE' or 'UAE_TO_PH'
  min: Number,         // Minimum weight in KG (must be >= 0)
  max: Number | null,  // Maximum weight in KG (null = unlimited/open-ended)
  rate: Number,        // Rate per kilogram in AED (must be >= 0)
  label: String,       // Display label (e.g., "1-15 KG", "200+ KG", "SPECIAL RATE")
  created_at: Date,
  updated_at: Date,
  created_by: ObjectId, // Optional: Employee who created it
  updated_by: ObjectId  // Optional: Employee who last updated it
}
```

**Indexes:**
```javascript
// Compound index for efficient route-based queries
db.price_brackets.createIndex({ route: 1, min: 1 });

// Unique constraint to prevent duplicate brackets (optional)
// Ensure no overlapping brackets for the same route
```

### 4. Validation Rules

#### 4.1 Bracket Validation

When creating or updating brackets, validate:

1. **Route Validation:**
   - Must be either `PH_TO_UAE` or `UAE_TO_PH`
   - Case-insensitive matching is acceptable

2. **Min Weight:**
   - Must be a number
   - Must be >= 0
   - Required field

3. **Max Weight:**
   - Must be a number or null
   - If provided (not null), must be > min
   - If null, represents unlimited/open-ended bracket

4. **Rate:**
   - Must be a number
   - Must be >= 0
   - Required field

5. **Label:**
   - Must be a string
   - Optional (can be auto-generated from min/max)
   - Recommended format: "1-15 KG" or "200+ KG"

6. **Bracket Overlap:**
   - Ensure brackets don't overlap for the same route
   - Example: If bracket A is 1-15 KG, bracket B cannot be 10-20 KG
   - Open-ended brackets (max = null) should be checked last

#### 4.2 Business Logic Validation

1. **At Least One Bracket:**
   - Each route must have at least one bracket
   - Cannot delete all brackets for a route

2. **Complete Coverage:**
   - Recommended: Brackets should cover all possible weights (0 to infinity)
   - At minimum, ensure there's an open-ended bracket (max = null) for weights beyond the highest closed bracket

### 5. Implementation Example

```javascript
// routes/price-brackets.js
const express = require('express');
const router = express.Router();
const PriceBracket = require('../models/PriceBracket');
const { authenticate, authorizeFinance } = require('../middleware/auth');

// GET /api/price-brackets/:route
router.get('/:route', authenticate, async (req, res) => {
  try {
    const { route } = req.params;
    const normalizedRoute = route.toUpperCase();
    
    // Validate route
    if (normalizedRoute !== 'PH_TO_UAE' && normalizedRoute !== 'UAE_TO_PH') {
      return res.status(400).json({
        success: false,
        error: 'Invalid route. Must be PH_TO_UAE or UAE_TO_PH'
      });
    }
    
    // Fetch brackets from database, sorted by min weight ascending
    const brackets = await PriceBracket.find({ route: normalizedRoute })
      .sort({ min: 1 })
      .lean();
    
    // If no brackets found, return empty array (frontend will use defaults)
    return res.json({
      success: true,
      data: brackets
    });
    
  } catch (error) {
    console.error('Error fetching price brackets:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// PUT /api/price-brackets/:route
router.put('/:route', authenticate, authorizeFinance, async (req, res) => {
  try {
    const { route } = req.params;
    const { brackets } = req.body;
    const normalizedRoute = route.toUpperCase();
    
    // Validate route
    if (normalizedRoute !== 'PH_TO_UAE' && normalizedRoute !== 'UAE_TO_PH') {
      return res.status(400).json({
        success: false,
        error: 'Invalid route. Must be PH_TO_UAE or UAE_TO_PH'
      });
    }
    
    // Validate brackets array
    if (!Array.isArray(brackets) || brackets.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Brackets array is required and must not be empty'
      });
    }
    
    // Validate each bracket
    for (const bracket of brackets) {
      // Validate min
      if (typeof bracket.min !== 'number' || bracket.min < 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid min weight: ${bracket.min}. Must be a number >= 0`
        });
      }
      
      // Validate max
      if (bracket.max !== null && (typeof bracket.max !== 'number' || bracket.max <= bracket.min)) {
        return res.status(400).json({
          success: false,
          error: `Invalid max weight: ${bracket.max}. Must be null or a number > min`
        });
      }
      
      // Validate rate
      if (typeof bracket.rate !== 'number' || bracket.rate < 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid rate: ${bracket.rate}. Must be a number >= 0`
        });
      }
      
      // Validate label (optional but recommended)
      if (bracket.label && typeof bracket.label !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Label must be a string'
        });
      }
    }
    
    // Check for overlapping brackets
    const sortedBrackets = [...brackets].sort((a, b) => a.min - b.min);
    for (let i = 0; i < sortedBrackets.length - 1; i++) {
      const current = sortedBrackets[i];
      const next = sortedBrackets[i + 1];
      
      // If current bracket has a max, it should not overlap with next bracket
      if (current.max !== null && current.max >= next.min) {
        return res.status(400).json({
          success: false,
          error: `Bracket overlap detected: ${current.label || `${current.min}-${current.max}`} overlaps with ${next.label || `${next.min}-${next.max}`}`
        });
      }
    }
    
    // Use transaction to ensure atomicity and immediate database persistence
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Delete all existing brackets for this route
      const deleteResult = await PriceBracket.deleteMany({ route: normalizedRoute }, { session });
      
      // Insert new brackets
      const bracketsToInsert = brackets.map(bracket => ({
        route: normalizedRoute,
        min: bracket.min,
        max: bracket.max === '' ? null : bracket.max,
        rate: bracket.rate,
        label: bracket.label || generateLabel(bracket.min, bracket.max),
        created_at: new Date(),
        updated_at: new Date(),
        created_by: req.user._id,
        updated_by: req.user._id
      }));
      
      const insertedBrackets = await PriceBracket.insertMany(bracketsToInsert, { session });
      
      // CRITICAL: Commit transaction to ensure data is persisted to database
      await session.commitTransaction();
      session.endSession();
      
      // CRITICAL: Invalidate any server-side caches (Redis, in-memory, etc.)
      // This ensures subsequent GET requests return fresh data from database
      if (cacheService) {
        await cacheService.invalidate(`price-brackets:${normalizedRoute}`);
        await cacheService.invalidate('price-brackets:*');
      }
      
      // Verify the save by fetching from database (optional but recommended)
      const verifiedBrackets = await PriceBracket.find({ route: normalizedRoute })
        .sort({ min: 1 })
        .lean();
      
      return res.json({
        success: true,
        data: {
          route: normalizedRoute,
          brackets: verifiedBrackets, // Return verified brackets from database
          deleted_count: deleteResult.deletedCount,
          inserted_count: insertedBrackets.length,
          message: 'Price brackets updated successfully in database'
        }
      });
      
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
    
  } catch (error) {
    console.error('Error updating price brackets:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error while updating brackets'
    });
  }
});

// Helper function to generate label from min/max
function generateLabel(min, max) {
  if (max === null) {
    if (min === 0) {
      return 'SPECIAL RATE';
    }
    return `${min}+ KG`;
  }
  return `${min}-${max} KG`;
}

module.exports = router;
```

### 6. Model Definition (Mongoose Example)

```javascript
// models/PriceBracket.js
const mongoose = require('mongoose');

const priceBracketSchema = new mongoose.Schema({
  route: {
    type: String,
    required: true,
    enum: ['PH_TO_UAE', 'UAE_TO_PH'],
    uppercase: true
  },
  min: {
    type: Number,
    required: true,
    min: 0
  },
  max: {
    type: Number,
    default: null,
    validate: {
      validator: function(value) {
        if (value === null) return true;
        return value > this.min;
      },
      message: 'Max weight must be greater than min weight'
    }
  },
  rate: {
    type: Number,
    required: true,
    min: 0
  },
  label: {
    type: String,
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  }
});

// Index for efficient route-based queries
priceBracketSchema.index({ route: 1, min: 1 });

// Update updated_at before saving
priceBracketSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model('PriceBracket', priceBracketSchema);
```

### 7. Authorization

**GET Endpoint:**
- Requires authentication (any logged-in user can view brackets)

**PUT Endpoint:**
- Requires authentication
- Requires Finance department authorization
- Only Finance department members should be able to update brackets

**Authorization Middleware Example:**
```javascript
const authorizeFinance = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  
  if (req.user.department?.name !== 'Finance') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Only Finance department can update price brackets'
    });
  }
  
  next();
};
```

### 8. Default Brackets (Initial Data)

If the database is empty, you may want to seed it with default brackets:

**PH_TO_UAE Default Brackets:**
```javascript
[
  { route: 'PH_TO_UAE', min: 1, max: 15, rate: 39, label: '1-15 KG' },
  { route: 'PH_TO_UAE', min: 16, max: 29, rate: 38, label: '16-29 KG' },
  { route: 'PH_TO_UAE', min: 30, max: 69, rate: 36, label: '30-69 KG' },
  { route: 'PH_TO_UAE', min: 70, max: 199, rate: 34, label: '70-199 KG' },
  { route: 'PH_TO_UAE', min: 200, max: 299, rate: 31, label: '200-299 KG' },
  { route: 'PH_TO_UAE', min: 300, max: null, rate: 30, label: '300+ KG' },
  { route: 'PH_TO_UAE', min: 0, max: null, rate: 29, label: 'SPECIAL RATE' }
]
```

**UAE_TO_PH Default Brackets:**
```javascript
[
  { route: 'UAE_TO_PH', min: 1, max: 15, rate: 39, label: '1-15 KG' },
  { route: 'UAE_TO_PH', min: 16, max: 29, rate: 38, label: '16-29 KG' },
  { route: 'UAE_TO_PH', min: 30, max: 69, rate: 36, label: '30-69 KG' },
  { route: 'UAE_TO_PH', min: 70, max: 99, rate: 34, label: '70-99 KG' },
  { route: 'UAE_TO_PH', min: 100, max: 199, rate: 31, label: '100-199 KG' },
  { route: 'UAE_TO_PH', min: 200, max: null, rate: 30, label: '200+ KG' },
  { route: 'UAE_TO_PH', min: 0, max: null, rate: 29, label: 'SPECIAL RATE' },
  { route: 'UAE_TO_PH', min: 1000, max: null, rate: 28, label: '1 TON UP' }
]
```

### 9. Testing Checklist

- [ ] GET endpoint returns brackets for PH_TO_UAE route
- [ ] GET endpoint returns brackets for UAE_TO_PH route
- [ ] GET endpoint returns 400 for invalid route
- [ ] GET endpoint returns empty array if no brackets exist (frontend will use defaults)
- [ ] PUT endpoint updates brackets for valid route
- [ ] PUT endpoint validates min weight >= 0
- [ ] PUT endpoint validates max weight > min (if not null)
- [ ] PUT endpoint validates rate >= 0
- [ ] PUT endpoint prevents overlapping brackets
- [ ] PUT endpoint requires at least one bracket
- [ ] PUT endpoint requires Finance department authorization
- [ ] PUT endpoint rejects unauthorized users (non-Finance)
- [ ] PUT endpoint uses transaction for atomicity
- [ ] Brackets are sorted by min weight in response
- [ ] Label is auto-generated if not provided
- [ ] Timestamps (created_at, updated_at) are set correctly

### 10. Performance Considerations

1. **Caching:**
   - **IMPORTANT:** GET requests should NOT use aggressive caching
   - Frontend expects real-time data and fetches every 30 seconds
   - If using server-side cache (Redis), set TTL to 0 or very short (30-60 seconds max)
   - **CRITICAL:** Always invalidate cache immediately after PUT updates
   - Consider not caching at all for price brackets since they need to be real-time
   
2. **Database Persistence:**
   - **MUST** use database transactions for PUT operations
   - **MUST** commit transaction before returning response
   - **MUST** verify data is saved by reading back from database
   - Do NOT rely on in-memory storage or delayed writes

2. **Indexing:**
   - Index on `route` and `min` for efficient queries
   - This ensures fast lookups when fetching brackets for a route

3. **Response Size:**
   - Brackets are typically small (5-10 per route)
   - No pagination needed

### 11. Database Persistence Requirements

**CRITICAL:** When Finance users update brackets via the price-brackets page:

1. **Immediate Database Write:**
   - Changes MUST be written to database immediately
   - Use database transactions to ensure atomicity
   - Commit transaction before returning success response
   - Do NOT use delayed writes, background jobs, or eventual consistency

2. **Verification:**
   - After saving, verify by reading back from database
   - Return the verified brackets in the response
   - This ensures frontend receives exactly what was saved

3. **Cache Invalidation:**
   - Immediately invalidate any server-side caches
   - Clear Redis cache if used
   - Clear in-memory cache if used
   - Ensure next GET request returns fresh data from database

4. **Error Handling:**
   - If database write fails, return error immediately
   - Do NOT return success if database write failed
   - Rollback transaction on any error
   - Return specific error message to frontend

5. **Response Format:**
   - Return the actual saved brackets from database
   - Include counts (deleted_count, inserted_count) for verification
   - Include success message confirming database save

### 12. Notes

- The frontend fetches brackets every 30 seconds automatically
- The frontend also fetches brackets on component mount
- Changes should take effect immediately (no cache on GET requests)
- The frontend handles both response formats (array or nested object with brackets property)
- Empty brackets array is acceptable (frontend will use hardcoded defaults)
- Route names are case-insensitive (backend should normalize to uppercase)
- **CRITICAL:** Price brackets page shows real-time data - all changes must be immediately persisted to database
- Frontend expects immediate database updates with no delays or eventual consistency

