# Database Indexes Strategy

## Indexes Created on MediaUploadTracker Collection

### 1. Single Field Indexes

- `fileUrl: 1` - For fast lookups and uniqueness
- `filePath: 1` - For path-based queries
- `uploadedBy: 1` - For user-based queries
- `status: 1` - For status filtering
- `createdAt: 1` - For age-based queries
- `lastCheckedAt: 1` - For tracking checks
- `usedInProduct: 1` - For usage filtering
- `deleted: 1` - For deletion status

### 2. Compound Indexes (Critical for Performance)

- `{ status: 1, createdAt: 1, deleted: 1 }` - **Primary cleanup index**
  - Used for batch processing of pending records
  - Efficiently finds old pending records
  - Filters out deleted records

- `{ status: 1, createdAt: 1 }` - **Age filtering index**
  - Used for finding records older than 24 hours
  - Optimizes the age-based cleanup

- `{ fileUrl: 1, status: 1 }` - **Product lookup optimization**
  - Speeds up checking if file is used in products
  - Helps during the verification phase

## Why These Indexes?

### Query Patterns

1. **Cleanup Batch**:

   ```javascript
   { status: "PENDING", deleted: false, createdAt: { $lte: cutoffDate } }

   Uses compound index { status: 1, createdAt: 1, deleted: 1 }
   ```

2. _Product Lookup_:

```javascript
{ $or: [{ "variants.images": fileUrl }, { "variants.video": fileUrl }] }
Requires proper indexing on Product collection arrays
```
