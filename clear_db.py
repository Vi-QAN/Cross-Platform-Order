from pymongo import MongoClient
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def clear_database():
    """Clear all collections in the MongoDB database."""
    try:
        # MongoDB connection
        MONGO_URI = "mongodb://localhost:49153"
        client = MongoClient(MONGO_URI)
        db = client.facebook_messages

        # List of collections to clear
        collections = [
            'messages',
            'orders',
            'products',
            'users'
        ]

        # Clear each collection
        for collection_name in collections:
            collection = db[collection_name]
            count = collection.count_documents({})
            collection.delete_many({})
            logger.info(f"Cleared {count} documents from {collection_name}")

        logger.info("Database cleared successfully")
        return True

    except Exception as e:
        logger.error(f"Error clearing database: {str(e)}")
        return False

if __name__ == "__main__":
    logger.info("Starting database cleanup...")
    if clear_database():
        logger.info("Database cleanup completed successfully")
    else:
        logger.error("Database cleanup failed") 