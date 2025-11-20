# MongoDB Connection Fix

## Issue
MongoDB connection is failing with `querySrv ECONNREFUSED` error.

## Solution

Update your `.env` file with the correct MongoDB URI format:

```env
MONGODB_URI=mongodb+srv://chakit_db_user:qQeqzZ8Gy8lFg0T6@chakitwebknot.4jdlwhq.mongodb.net/kairo?retryWrites=true&w=majority
```

**Key changes:**
1. Added `/kairo` database name before the `?`
2. Added `retryWrites=true&w=majority` query parameters

## Alternative: Use Local MongoDB

If you prefer to use local MongoDB:

```env
MONGODB_URI=mongodb://localhost:27017/kairo
```

Then start MongoDB locally:
```bash
# macOS with Homebrew
brew services start mongodb-community

# Or just run mongod
mongod
```

## Verify Connection

Test your MongoDB URI:
```bash
# Replace with your actual URI
mongosh "mongodb+srv://chakit_db_user:qQeqzZ8Gy8lFg0T6@chakitwebknot.4jdlwhq.mongodb.net/kairo?retryWrites=true&w=majority"
```

## MongoDB Atlas Checklist

1. ✅ Cluster is running (not paused)
2. ✅ Network Access allows your IP (or 0.0.0.0/0 for development)
3. ✅ Database User credentials are correct
4. ✅ Connection string format is correct with database name

## Note

The server will now start even if MongoDB fails to connect (for development flexibility). 
However, database features will be unavailable until MongoDB is connected.

