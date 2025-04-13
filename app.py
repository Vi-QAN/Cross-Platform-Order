from flask import Flask, request, jsonify, render_template_string, send_from_directory
from flask_cors import CORS
from facebook import GraphAPI
import os
from dotenv import load_dotenv
import openai
from datetime import datetime, timedelta
import re
import json
import requests
import hmac
import hashlib
import logging
from logging import StreamHandler
from pymongo import MongoClient
from bson import ObjectId
from functools import wraps

load_dotenv()

# Facebook App Configuration
FB_APP_ID = os.getenv('FB_APP_ID')
FB_APP_SECRET = os.getenv('FB_APP_SECRET')
FB_REDIRECT_URI = os.getenv('FB_REDIRECT_URI')
META_VERIFY_TOKEN = os.getenv('META_VERIFY_TOKEN')
PAGE_ACCESS_TOKEN = os.getenv('PAGE_ACCESS_TOKEN')
MONGO_URI = os.getenv('MONGO_URI')

app = Flask(__name__, static_folder='static', static_url_path='/static')
CORS(app)

# Configure Flask app for UTF-8 encoding
app.config['JSON_AS_ASCII'] = False
app.config['JSONIFY_MIMETYPE'] = 'application/json; charset=utf-8'

# Configure logging
if not os.path.exists('logs'):
    os.makedirs('logs')
    
stream_handler = StreamHandler()
stream_handler.setFormatter(logging.Formatter(
    '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
))
stream_handler.setLevel(logging.INFO)
app.logger.addHandler(stream_handler)
app.logger.setLevel(logging.INFO)
app.logger.info('Facebook Order App startup')

# Create static directory if it doesn't exist
if not os.path.exists('static'):
    os.makedirs('static')
    os.makedirs('static/uploads')  # For uploaded images
    app.logger.info('Created static directories')

# MongoDB configuration
mongo_client = MongoClient(MONGO_URI)
mongo_db = mongo_client.facebook_messages
messages_collection = mongo_db.messages
orders_collection = mongo_db.orders
users_collection = mongo_db.users
products_collection = mongo_db.products
# Meta Webhook configuration
VERIFY_TOKEN = os.getenv('META_VERIFY_TOKEN', 'your_webhook_verify_token')

def verify_webhook_signature(request_body, signature):
    """Verify the webhook signature from Meta."""
    if not signature:
        app.logger.warning('No signature provided in webhook request')
        return False
    
    try:
        # Remove 'sha256=' prefix if present
        if signature.startswith('sha256='):
            signature = signature[7:]
        
        # Calculate expected signature
        expected_signature = hmac.new(
            FB_APP_SECRET.encode('utf-8'),
            request_body,
            hashlib.sha256
        ).hexdigest()
        
        # Log signatures for debugging
        app.logger.info(f'Received signature: {signature}')
        app.logger.info(f'Expected signature: {expected_signature}')
        
        # Compare signatures
        is_valid = hmac.compare_digest(signature, expected_signature)
        app.logger.info(f'Signature verification result: {is_valid}')
        return is_valid
        
    except Exception as e:
        app.logger.error(f'Error verifying webhook signature: {str(e)}', exc_info=True)
        return False

@app.route('/webhook', methods=['GET'])
def verify_webhook():
    """Handle webhook verification from Meta."""
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')
    
    app.logger.info(f'Webhook verification attempt - Mode: {mode}, Token: {token}')
    
    if mode and token:
        if mode == 'subscribe' and token == VERIFY_TOKEN:
            app.logger.info('Webhook verified successfully!')
            return challenge
        else:
            app.logger.warning('Invalid verification token')
            return jsonify({"error": "Invalid verification token"}), 403
    app.logger.warning('Invalid webhook request')
    return jsonify({"error": "Invalid request"}), 400

@app.route('/webhook', methods=['POST'])
def webhook_handler():
    """Handle incoming webhook events from Meta."""
    app.logger.info('Received webhook POST request')
    
    # Verify webhook signature
    signature = request.headers.get('X-Hub-Signature-256')
    if not verify_webhook_signature(request.get_data(), signature):
        app.logger.warning('Invalid webhook signature')
        return jsonify({"error": "Invalid signature"}), 403
    
    try:
        data = request.get_json()
        app.logger.info(f'Webhook data: {json.dumps(data, indent=2)}')
        
        # Handle different types of updates
        if data.get('object') == 'page':
            for entry in data.get('entry', []):
                # Handle messaging events
                if 'messaging' in entry:
                    for messaging in entry['messaging']:
                        # Skip message_reads events
                        if 'read' in messaging:
                            app.logger.info('Skipping message_reads event')
                            continue
                        handle_messaging_event(messaging)
                   
        return jsonify({"status": "ok"})
        
    except Exception as e:
        app.logger.error(f'Error processing webhook: {str(e)}', exc_info=True)
        return jsonify({"error": str(e)}), 500

def handle_messaging_event(messaging):
    """Handle incoming messaging events."""
    try:
        app.logger.info(f'Processing messaging event: {json.dumps(messaging, indent=2)}')
        # Extract message data
        sender_id = messaging.get('sender', {}).get('id')
        recipient_id = messaging.get('recipient', {}).get('id')
        timestamp = messaging.get('timestamp')
        message = messaging.get('message', {})
        
        # Store message in MongoDB
        message_data = {
            'sender_id': sender_id,
            'recipient_id': recipient_id,
            'timestamp': timestamp,
            'message': message.get('text', ''),
            'created_at': datetime.utcnow(),
            'conversation_id': messaging.get('conversation', {}).get('id'),
            'from': messaging.get('sender', {}).get('name', 'Unknown'),
            'message_id': message.get('mid'),
            'seq': message.get('seq'),
            'attachments': message.get('attachments', []),
            'quick_reply': message.get('quick_reply'),
            'is_echo': message.get('is_echo', False)
        }
        
        # Insert message into MongoDB
        message_result = messages_collection.insert_one(message_data)
        message_db_id = message_result.inserted_id
        app.logger.info(f'Message stored in MongoDB with ID: {message_db_id}')
        # Check if message starts with "create user" command
        if 'text' in message and message['text'].lower().startswith('create user'):
            try:
                # Extract Facebook ID from the end of message
                message_parts = message['text'].split()
                if len(message_parts) >= 3:
                    facebook_id = message_parts[-1]
                    
                    # Insert into users collection
                    # Find user with facebook_id and update sender_id
                    existing_user = users_collection.find_one({'facebook_id': facebook_id})
                    if existing_user:
                        users_collection.update_one(
                            {'facebook_id': facebook_id},
                            {'$set': {'mapped_sender_id': sender_id}}
                        )

                    app.logger.info(f'Map new user with Facebook ID: {facebook_id}')
                    
                    # Send confirmation message
                    return jsonify({"status": "User created successfully"})
                    
            except Exception as e:
                app.logger.error(f'Error creating user: {str(e)}')
                return jsonify({"error": str(e)}), 500
        # Handle different message types
        elif 'text' in message:
            handle_text_message(sender_id, message['text'], message_db_id)
        elif 'attachments' in message:
            handle_attachments(sender_id, message['attachments'], message_db_id)
            
    except Exception as e:
        app.logger.error(f'Error handling messaging event: {str(e)}', exc_info=True)

def handle_text_message(sender_id, text, message_db_id):
    """Handle text messages."""
    try:
        app.logger.info(f'Processing text message from {sender_id}: {text}')
        
        # Check if this is a short message that could be a customer name
        if len(text.split()) < 4 and len(text.split()) >= 1:
            # Check if there's a pending image order for this sender
            pending_image = orders_collection.find_one({
                'sender_id': sender_id,
                'customer_name_status': 'pending',
            })
            
            if pending_image:
                # Update the pending image order with customer name
                orders_collection.update_one(
                    {'_id': pending_image['_id']},
                    {
                        '$set': {
                            'customer_name': text,
                            'customer_name_status': 'updated',
                        }
                    }
                )
                return       
        # Process as potential order message
        elif len(text.split()) >= 4:
            structured_order = process_order_message(text, message_db_id, sender_id)
            
            if not structured_order:
                return jsonify({"error": "Failed to process message"}), 500
        
    except Exception as e:
        app.logger.error(f'Error handling text message: {str(e)}', exc_info=True)

def handle_attachments(sender_id, attachments, message_db_id):
    """Handle message attachments."""
    try:
        for attachment in attachments:
            attachment_type = attachment.get('type')
            payload = attachment.get('payload', {})
            
            if attachment_type == 'image':
                # Handle image attachment
                image_url = payload.get('url')
                id = datetime.utcnow().strftime('%Y%m%d%H%M%S')
                
                # Check for recent short message that could be customer name
                recent_message = messages_collection.find_one({
                    'sender_id': sender_id,
                    'created_at': {'$gte': datetime.utcnow() - timedelta(minutes=5)},
                    'message': {'$exists': True, '$ne': ''}
                }, sort=[('created_at', -1)])

                customer_name = None
                customer_name_status = 'pending'
                
                if recent_message and len(recent_message.get('message', '').split()) <= 4:
                    customer_name = recent_message['message']
                    customer_name_status = 'updated'
                
                # Create order data with image
                order_data = {
                    'sender_id': sender_id,
                    'customer_name': customer_name,
                    'message': f"Image order from {sender_id}",
                    'image_url': image_url,
                    'item_name': f"Image Order {id}",
                    'status': 'pickup',
                    'customer_name_status': customer_name_status,
                    'created_at': datetime.utcnow(),
                    'updated_at': datetime.utcnow(),
                    'quantity': 1,
                    'message_id': message_db_id
                }
                                
                # Insert into orders collection
                result = orders_collection.insert_one(order_data)
                app.logger.info(f'Image order stored in MongoDB with ID: {result.inserted_id}')
                
    except Exception as e:
        app.logger.error(f'Error handling attachments: {str(e)}', exc_info=True)
    
@app.route('/api/login', methods=['GET'])
def login():
    # Request necessary permissions for messaging and user data
    permissions = [
        'email',                  # Basic email permission
        'public_profile',         # Basic profile information
        'pages_messaging',        # Manage messages
        'pages_show_list',        # View pages
        'pages_read_engagement',  # Read page engagement
        'pages_manage_metadata',  # Manage page metadata
        'pages_read_user_content' # Read user content on pages
    ]
    
    # Create the authorization URL with all required parameters
    auth_url = (
        f"https://www.facebook.com/v22.0/dialog/oauth?"
        f"client_id={FB_APP_ID}"
        f"&redirect_uri={FB_REDIRECT_URI}"
        f"&scope={','.join(permissions)}"
        "&response_type=code"
        "&state=random_state_string"  # Add state parameter for security
    )
    return jsonify({"auth_url": auth_url})

def owner_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        owner_id = request.headers.get('User-Id')
        if not owner_id:
            return jsonify({'error': 'User ID is required'}), 401

        # Check if user exists and is an owner
        user = users_collection.find_one({'facebook_id': owner_id})
        if not user or user.get('role') != 'owner':
            return jsonify({'error': 'Owner access required'}), 403

        return f(*args, **kwargs)
    return decorated_function

def user_id_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = request.headers.get('User-Id')
        if not user_id:
            return jsonify({'error': 'User ID is required', 'redirect': '/api/login'}), 401

        # Check if user exists
        user = users_collection.find_one({'facebook_id': user_id})
        if not user:
            return jsonify({'error': 'User not found', 'redirect': '/api/login'}), 404

        # Store user role in request for downstream use
        request.user_role = user['role']
        # Store user ID in request for downstream use
        if user['role'] == 'staff':
            # For staff, get the owner ID
            owner = users_collection.find_one({'facebook_id': user['owner_id']})
            if not owner:
                return jsonify({'error': 'User not found', 'redirect': '/api/login'}), 404
            request.belong_to = owner['mapped_sender_id']
        else:
            # For other roles, use their own ID
            request.belong_to = user['mapped_sender_id']

        return f(*args, **kwargs)
    return decorated_function


@app.route('/api/callback', methods=['GET'])
def callback():
    try:
        # Get the authorization code and state from the callback
        code = request.args.get('code')
        role = request.args.get('role', 'staff')  # Default to staff if not specified
        
        app.logger.info(f'Callback received - Code: {code}, Role: {role}')
        
        if not code:
            app.logger.error('No code provided in callback')
            return jsonify({"error": "No code provided"}), 400
        
        # Exchange code for access token
        token_url = (
            f"https://graph.facebook.com/v22.0/oauth/access_token?"
            f"client_id={FB_APP_ID}"
            f"&client_secret={FB_APP_SECRET}"
            f"&redirect_uri={FB_REDIRECT_URI}"
            f"&code={code}"
        )
        
        app.logger.info(f'Requesting access token from: {token_url}')
        response = requests.get(token_url)
        data = response.json()
        
        app.logger.info(f'Token response: {json.dumps(data, indent=2)}')
        
        if 'error' in data:
            error = data['error']
            app.logger.error(f'Facebook API error: {json.dumps(error, indent=2)}')
            return jsonify({"error": error}), 400
            
        if 'access_token' not in data:
            app.logger.error('No access token in response')
            return jsonify({"error": "Failed to get access token"}), 400
        
        # Get user's information
        graph = GraphAPI(access_token=data['access_token'])
        user_info = graph.get_object('me', fields='id,name,email')
        
        # Check if user exists in database
        existing_user = users_collection.find_one({'facebook_id': user_info['id']})
        
        if not existing_user:
            # Create new user with selected role
            new_user = {
                'facebook_id': user_info['id'],
                'name': user_info.get('name'),
                'email': user_info.get('email'),
                'role': role,
                'created_at': datetime.utcnow(),
                'status': 'active',
                'owner_id': 0
            }
            users_collection.insert_one(new_user)
            app.logger.info(f'Created new owner user: {user_info["id"]}')
                
        app.logger.info(f'Updated access token for user: {user_info["id"]}')
        return jsonify({
            "access_token": data['access_token'],
            "user": {
                "facebook_id": user_info['id'],
                "user_role": existing_user['role'] if existing_user else role
            }
        })
        
    except Exception as e:
        app.logger.error(f'Error in callback: {str(e)}', exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/api/messages', methods=['GET'])
def get_messages():
    """Get messages from MongoDB."""
    try:
        # Get query parameters
        limit = int(request.args.get('limit', 50))
        skip = int(request.args.get('skip', 0))
        conversation_id = request.args.get('conversation_id')
        
        # Build query
        query = {}
        if conversation_id:
            query['conversation_id'] = conversation_id
            
        # Get messages from MongoDB
        messages = list(messages_collection.find(
            query,
            {'_id': 0}  # Exclude MongoDB _id field
        ).sort('timestamp', -1).skip(skip).limit(limit))
        
        # Convert ObjectId to string for JSON serialization
        for message in messages:
            message['id'] = str(message.get('_id', ''))
            if '_id' in message:
                del message['_id']
        
        return jsonify({
            "messages": messages,
            "total": messages_collection.count_documents(query)
        })
        
    except Exception as e:
        app.logger.error(f'Error fetching messages: {str(e)}', exc_info=True)
        return jsonify({"error": str(e)}), 500

def process_order_message(message_text, message_db_id, sender_id):
    """Process order message using ChatGPT to extract structured information."""
    try:
        # Set OpenAI API key
        openai.api_key = os.getenv('OPENAI_API_KEY')

        # Create prompt for ChatGPT
        prompt = f"""You are an order parsing assistant. Your task is to extract structured order information from the following message:

        {message_text}

        The message follows this pattern:
        [product_name] [quantity1 for customer 1] [color1 for customer 1] (customer1) [quantity1 for customer 2] [color1 for customer 2] [quantity2 for customer 2] [color2 for customer 2] (customer2) ...

        IMPORTANT: Parse the ACTUAL message above, not the example. Return a JSON object with this structure:
        {{
            "product_name": "Name of the product",
            "orders": [
                {{
                    "customer_name": "Customer name",
                    "items": [
                        {{
                            "color": "Color name",
                            "quantity": number
                        }}
                    ]
                }}
            ]
        }}

        Now, please parse the actual message provided above and return the structured data."""

        # Call OpenAI API with GPT-4
        response = openai.chat.completions.create(
            model="gpt-4-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that extracts structured order information from single-line messages. You understand that each customer can have multiple color orders, and the format is: [product_name] [quantity1 for customer 1] [color1 for customer 1] (customer1) [quantity1 for customer 2] [color1 for customer 2] [quantity2 for customer 2] [color2 for customer 2] (customer2) ..."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1  # Lower temperature for more consistent results
        )

        # Get the structured order from the response
        structured_order = json.loads(response.choices[0].message.content)
        app.logger.info(f"Processed order message: {structured_order}")

        # Generate a unique order group ID
        order_group_id = f"order_{int(datetime.utcnow().timestamp())}"

        # Parse the structured order
        product_name = structured_order.get('product_name')
        orders = structured_order.get('orders', [])

        # Create Order records and update summary
        total_quantity = 0
        for order_data in orders:
            customer_name = order_data.get('customer_name')
            items = order_data.get('items', [])
            
            for item in items:
                product_details = insert_product(product_name)
                price = product_details['price']
                image_url = product_details['image_url']
                
                order = {
                    "customer_name": customer_name,
                    "sender_id": sender_id,
                    "item_name": product_name,
                    "color": item.get('color'),
                    "quantity": item.get('quantity', 1),
                    "status": 'pickup',
                    "order_group_id": order_group_id,
                    "created_at": datetime.utcnow(),
                    "message_id": message_db_id,
                    "price": price,
                    "image_url": image_url
                }
                orders_collection.insert_one(order)
                total_quantity += order['quantity']

        return structured_order

    except Exception as e:
        app.logger.error(f"Error processing order message: {str(e)}", exc_info=True)
        raise

def insert_product(product_name):
    """Insert a new product if it doesn't exist and return its price and image URL."""
    try:
        # Convert product name to lowercase for case-insensitive comparison
        product_name_lower = product_name.lower()
        
        # Check if product exists (case insensitive)
        existing_product = products_collection.find_one({
            'name_lower': product_name_lower
        })
        
        if not existing_product:
            # Insert new product
            product_data = {
                'name': product_name,
                'name_lower': product_name_lower,
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow(),
                'price': 0,
                'image_url': ''
            }
            result = products_collection.insert_one(product_data)
            app.logger.info(f'New product inserted with ID: {result.inserted_id}')
            return {'price': 0, 'image_url': ''}
        
        app.logger.info(f'Product already exists: {product_name}')
        return {
            'price': existing_product.get('price', 0),
            'image_url': existing_product.get('image_url', '')
        }
        
    except Exception as e:
        app.logger.error(f'Error inserting product: {str(e)}', exc_info=True)
        raise

@app.route('/api/orders', methods=['GET'])
def get_orders():
    """Get all orders."""
    try:
        orders = list(orders_collection.find({}, {'_id': 0}))
        response = []
        for order in orders:
            order_data = {
                'id': str(order['_id']),
                'customer_name': order.get('customer_name'),
                'item_name': order.get('item_name'),
                'size': order.get('size'),
                'color': order.get('color'),
                'price': order.get('price'),
                'created_at': order.get('created_at').isoformat()
            }
            response.append(order_data)
        return jsonify(response)
    except Exception as e:
        app.logger.error(f'Error fetching orders: {str(e)}', exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/api/order-summaries', methods=['GET'])
@user_id_required
def get_order_summaries():
    """Get all order summaries with color breakdowns."""
    try:
        # Get all pickup orders grouped by item_name
        pipeline = [
            {"$match": {"status": "pickup", "sender_id": request.belong_to}},
            {"$group": {
                "_id": "$item_name",
                "total_quantity": {"$sum": "$quantity"},
                "colors": {
                    "$push": {
                        "color": "$color",
                        "quantity": "$quantity"
                    }
                },
                "image_url": {
                    "$first": "$image_url"
                },
                "price": {
                    "$first": "$price"
                }
            }}
        ]
        order_groups = list(orders_collection.aggregate(pipeline))

        # Convert to summary format
        summaries = []
        for group in order_groups:
            # Skip image orders
            if group["_id"].startswith("Image Order"):
                summaries.append({
                    "product_name": group["_id"],
                    "total_quantity": 1,
                    "color_breakdown": {},
                    "image_url": group["image_url"]
                })
                continue

            # Calculate color breakdown
            color_breakdown = {}
            for color_info in group["colors"]:
                color = color_info["color"]
                if color not in color_breakdown:
                    color_breakdown[color] = 0
                color_breakdown[color] += color_info["quantity"]

            summaries.append({
                "product_name": group["_id"],
                "total_quantity": group["total_quantity"],
                "color_breakdown": color_breakdown,
                "image_url": group["image_url"],
                "price": group["price"]
            })

        return jsonify(summaries)
        
    except Exception as e:
        app.logger.error(f'Error getting order summaries: {str(e)}', exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/api/order-summaries/<product_name>/image', methods=['PUT'])
def update_product_image(product_name):
    """Update the image for a product."""
    try:
        if 'image' not in request.files:
            return jsonify({"error": "No image file provided"}), 400

        image_file = request.files['image']
        if image_file.filename == '':
            return jsonify({"error": "No selected file"}), 400

        if not image_file.content_type.startswith('image/'):
            return jsonify({"error": "File must be an image"}), 400

        # Generate unique filename
        timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        filename = f"{product_name.lower().replace(' ', '_')}_{timestamp}.{image_file.filename.split('.')[-1]}"
        
        # Save file to local storage
        upload_folder = os.path.join(app.static_folder, 'uploads')
        if not os.path.exists(upload_folder):
            os.makedirs(upload_folder)
            
        file_path = os.path.join(upload_folder, filename)
        image_file.save(file_path)
        
        # Generate URL for the saved image
        # Generate full URL including domain for the image
        image_url = request.host_url.rstrip('/') + f"/static/uploads/{filename}"
        
        # Update all orders for this product with the new image URL
        orders_collection.update_many(
            {"item_name": product_name},
            {"$set": {"image_url": image_url}}
        )

        # Update product in products collection
        result = products_collection.update_one(
            {"name_lower": product_name.lower()},
            {"$set": {"image_url": image_url}}
        )

        if result.modified_count == 0:
            return jsonify({"error": "Product not found"}), 404

        return jsonify({
            "message": "Product image updated successfully", 
            "product_name": product_name,
            "image_url": image_url
        })

    except Exception as e:
        app.logger.error(f'Error updating product image: {str(e)}', exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/api/order-summaries/<product_name>/price', methods=['PUT'])
def update_product_price(product_name):
    """Update the price for a product."""
    try:
        data = request.get_json()
        if not data or 'price' not in data:
            return jsonify({"error": "Price is required"}), 400

        price = float(data['price'])
        if price < 0:
            return jsonify({"error": "Price cannot be negative"}), 400

        # Update all orders for this product with the new price
        result = orders_collection.update_many(
            {"item_name": product_name},
            {"$set": {"price": price}}
        )

        result = products_collection.update_one(
            {"name_lower": product_name.lower()},
            {"$set": {"price": price}}
        )

        if result.modified_count == 0:
            return jsonify({"error": "Product not found"}), 404

        return jsonify({
            "message": "Product price updated successfully",
            "product_name": product_name,
            "price": price
        })

    except Exception as e:
        app.logger.error(f'Error updating product price: {str(e)}', exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/api/orders/preparing', methods=['GET'])
@user_id_required
def get_preparing_orders():
    """Get orders in preparation phase, grouped by customer."""
    try:
       
        # Get all orders in preparing status
        orders = list(orders_collection.find(
            {"status": "preparing", 
             "sender_id": request.belong_to
            }))
        
        # Group orders by customer
        customer_orders = {}
        for order in orders:
            # Use a default customer name if none is provided
            customer_name = order.get('customer_name', 'Unknown Customer')
            if customer_name not in customer_orders:
                customer_orders[customer_name] = {
                    'customer_name': customer_name,
                    'orders': [],
                    'total_items': 0
                }

            # Create a copy of the order without MongoDB-specific fields
            order_data = {
                '_id': str(order['_id']),  # Convert ObjectId to string
                'customer_name': customer_name,
                'item_name': order.get('item_name', 'Unknown Item'),
                'color': order.get('color', 'N/A'),
                'quantity': order.get('quantity', 0),
                'status': order.get('status', 'preparing'),
                'order_group_id': order.get('order_group_id'),
                'image_url': order.get('image_url', ''),
                'preparation_notes': order.get('preparation_notes', ''),
                'preparation_started_at': order.get('preparation_started_at'),
                'created_at': order.get('created_at').isoformat() if order.get('created_at') else None,
                'updated_at': order.get('updated_at').isoformat() if order.get('updated_at') else None
            }
            
            # Add order to customer's list
            customer_orders[customer_name]['orders'].append(order_data)
            customer_orders[customer_name]['total_items'] += order.get('quantity', 0)
        
        # Convert to list and sort by customer name
        result = list(customer_orders.values())
        result.sort(key=lambda x: x['customer_name'] or 'Unknown Customer')
        
        return jsonify(result)
    except Exception as e:
        app.logger.error(f'Error fetching preparing orders: {str(e)}', exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/api/orders/billing', methods=['GET'])
def get_billing_orders():
    """Get orders in billing phase, grouped by customer."""
    try:
        # Get all orders in billing status
        orders = list(orders_collection.find({"status": "billing"}))
        
        # Group orders by customer
        customer_orders = {}
        for order in orders:
            customer_name = order.get('customer_name')
            if customer_name not in customer_orders:
                customer_orders[customer_name] = {
                    'customer_name': customer_name,
                    'orders': [],
                    'total_amount': 0
                }
            
            # Create a copy of the order without MongoDB-specific fields
            order_data = {
                '_id': str(order['_id']),
                'customer_name': order.get('customer_name'),
                'item_name': order.get('item_name'),
                'color': order.get('color'),
                'quantity': order.get('quantity', 0),
                'price': order.get('price', 0),
                'image_url': order.get('image_url', ''),
                'subtotal': order.get('price', 0) * order.get('quantity', 0),
                'status': order.get('status'),
                'order_group_id': order.get('order_group_id'),
                'billing_notes': order.get('billing_notes', ''),
                'created_at': order.get('created_at').isoformat() if order.get('created_at') else None,
                'updated_at': order.get('updated_at').isoformat() if order.get('updated_at') else None
            }
            
            # Add order to customer's list and update total
            customer_orders[customer_name]['orders'].append(order_data)
            customer_orders[customer_name]['total_amount'] += order_data['subtotal']
        
        # Convert to list and sort by customer name
        result = list(customer_orders.values())
        result.sort(key=lambda x: x['customer_name'] or 'Unknown Customer')
        
        return jsonify(result)
    except Exception as e:
        app.logger.error(f'Error fetching billing orders: {str(e)}', exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/api/orders/<order_id>/move-to-billing', methods=['POST'])
def move_to_billing(order_id):
    """Move an order to billing phase."""
    try:
        order = orders_collection.find_one({"_id": ObjectId(order_id)})
        if not order:
            return jsonify({"error": "Order not found"}), 404
        
        # Update order status and add image URL if it exists
        update_data = {"status": "billing"}
            
        orders_collection.update_one(
            {"_id": ObjectId(order_id)},
            {"$set": update_data}
        )

        return jsonify({"message": "Order moved to billing phase"})
    except Exception as e:
        app.logger.error(f'Error moving order to billing: {str(e)}', exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/api/orders/<order_id>/preparation-notes', methods=['PUT'])
def update_preparation_notes(order_id):
    """Update the preparation notes for an order."""
    try:
        data = request.get_json()
        if not data or 'notes' not in data:
            return jsonify({"error": "Notes are required"}), 400

        update_data = {
            "updated_at": datetime.utcnow()
        }

        if 'notes' in data:
            update_data['preparation_notes'] = data['notes']

        orders_collection.update_one(
            {"_id": ObjectId(order_id)},
            {"$set": update_data}
        )

        return jsonify({"message": "Preparation notes updated successfully"})

    except Exception as e:
        app.logger.error(f'Error updating preparation notes: {str(e)}', exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/api/orders/move-to-preparing', methods=['POST'])
@owner_required
def move_orders_to_preparing():
    """Move all orders for a product to preparing status."""
    try:
        data = request.get_json()
        if not data or 'product_name' not in data:
            return jsonify({"error": "Product name is required"}), 400

        product_name = data['product_name']
        
        # Find all orders for this product with pickup status
        orders = list(orders_collection.find({
            "item_name": product_name,
            "status": "pickup"
        }))
        
        if not orders:
            return jsonify({"message": "No orders found to move"}), 200

        # Update each order and create preparation records
        for order in orders:
            # Update order status and add image URL if it exists
            update_data = {
                "status": "preparing",
                "updated_at": datetime.utcnow()
            }
                
            orders_collection.update_one(
                {"_id": order['_id']},
                {"$set": update_data}
            )

        return jsonify({
            "message": f"Successfully moved {len(orders)} orders to preparing status"
        })

    except Exception as e:
        app.logger.error(f'Error moving orders to preparing: {str(e)}', exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/api/orders/history', methods=['GET'])
@user_id_required
@owner_required
def get_history_orders():
    """Get completed orders, grouped by customer."""
    try:
        # Get all orders with status "completed"
        orders = list(orders_collection.find(
            {"status": "completed", 
             "sender_id": request.belong_to
            }))
        
        # Group orders by customer
        customer_orders = {}
        for order in orders:
            customer_name = order.get('customer_name')
            if customer_name not in customer_orders:
                customer_orders[customer_name] = {
                    'customer_name': customer_name,
                    'orders': [],
                    'total_amount': 0
                }
            
            # Create a copy of the order without MongoDB-specific fields
            order_data = {
                '_id': str(order['_id']),
                'customer_name': order.get('customer_name'),
                'item_name': order.get('item_name'),
                'color': order.get('color'),
                'quantity': order.get('quantity', 0),
                'price': order.get('price', 0),
                'image_url': order.get('image_url'),
                'subtotal': order.get('price', 0) * order.get('quantity', 0),
                'status': order.get('status'),
                'order_group_id': order.get('order_group_id'),
                'created_at': order.get('created_at').isoformat() if order.get('created_at') else None,
                'updated_at': order.get('updated_at').isoformat() if order.get('updated_at') else None,
            }
            
            # Add order to customer's list and update total
            customer_orders[customer_name]['orders'].append(order_data)
            customer_orders[customer_name]['total_amount'] += order_data['subtotal']
        
        # Convert to list and sort by customer name
        result = list(customer_orders.values())
        result.sort(key=lambda x: x['customer_name'])
        
        return jsonify(result)
    except Exception as e:
        app.logger.error(f'Error fetching history orders: {str(e)}', exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/api/orders/mark-all-paid', methods=['POST'])
@owner_required
def mark_all_orders_paid():
    """Mark all orders for a customer as paid and move them to history."""
    try:
        data = request.get_json()
        if not data or 'customer_name' not in data:
            return jsonify({"error": "Customer name is required"}), 400

        customer_name = data['customer_name']
        current_time = datetime.utcnow()
        
        # Find all orders for this customer with billing status
        orders = list(orders_collection.find({
            "customer_name": customer_name,
            "status": "billing"
        }))
        
        if not orders:
            return jsonify({"message": "No orders found to mark as paid"}), 200

        # Update all orders for this customer
        orders_collection.update_many(
            {
                "customer_name": customer_name,
                "status": "billing"
            },
            {
                "$set": {
                    "status": "completed",
                    "billing_status": "paid",
                    "billing_paid_at": current_time,
                    "updated_at": current_time
                }
            }
        )

        return jsonify({
            "message": f"Successfully marked {len(orders)} orders as paid for customer {customer_name}"
        })

    except Exception as e:
        app.logger.error(f'Error marking orders as paid: {str(e)}', exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/api/orders/<order_id>/update-price', methods=['PUT'])
@owner_required
def update_order_price(order_id):
    """Update the price for a single order in billing phase."""
    try:
        data = request.get_json()
        if not data or 'price' not in data:
            return jsonify({"error": "Price is required"}), 400

        price = float(data['price'])
        if price < 0:
            return jsonify({"error": "Price cannot be negative"}), 400

        # Find the order and verify it's in billing status
        order = orders_collection.find_one({
            "_id": ObjectId(order_id),
            "status": "billing"
        })

        if not order:
            return jsonify({"error": "Order not found or not in billing phase"}), 404

        # Update the order price
        result = orders_collection.update_one(
            {"_id": ObjectId(order_id)},
            {
                "$set": {
                    "price": price,
                    "updated_at": datetime.utcnow()
                }
            }
        )

        if result.modified_count == 0:
            return jsonify({"error": "Failed to update order price"}), 500

        return jsonify({
            "message": "Order price updated successfully",
            "order_id": order_id,
            "price": price
        })

    except Exception as e:
        app.logger.error(f'Error updating order price: {str(e)}', exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/api/users/facebook-search', methods=['GET'])
@owner_required
def search_facebook_users():
    try:
        query = request.args.get('q', '')
        if not query:
            return jsonify({'error': 'Search query is required'}), 400

        # Search users collection with case-insensitive regex pattern
        # This will match both English and Vietnamese text
        users = list(users_collection.find({
            'name': {'$regex': query, '$options': 'i'},
            'role': 'staff'
        }, {
            '_id': 0,
            'facebook_id': 1, 
            'name': 1,
            'email': 1,
            'status': 1
        }))

        if not users:
            return jsonify([])  # Return empty list if no matches

        return jsonify(users)

    except Exception as e:
        print(f"Error searching Facebook users: {str(e)}")
        return jsonify({'error': 'Failed to search Facebook users'}), 500

@app.route('/api/users/add-staff', methods=['POST'])
@owner_required
def add_staff():
    try:
        data = request.get_json()
        if not data or 'facebook_id' not in data:
            return jsonify({'error': 'Facebook user ID is required'}), 400

        # Get the owner's ID from the request headers
        owner_id = request.headers.get('User-Id')
        if not owner_id:
            return jsonify({'error': 'Owner ID is required'}), 400

        # Update owner's staff list
        users_collection.update_one(
            {'facebook_id': data['facebook_id']},
            {'$set': {'owner_id': owner_id}}
        )

        return jsonify({'message': 'Staff added successfully'}), 201

    except Exception as e:
        print(f"Error adding staff: {str(e)}")
        return jsonify({'error': 'Failed to import Facebook user'}), 500

@app.route('/api/users', methods=['GET'])
@owner_required
def get_users():
    try:
        owner_id = request.headers.get('User-Id')
        if not owner_id:
            return jsonify({'error': 'Owner ID is required'}), 400

        # Get owner's staff list
        owner = users_collection.find_one({'facebook_id': owner_id})
        if not owner:
            return jsonify({'error': 'Owner not found'}), 404

        # Get all staff members
        staff_ids = owner.get('staffs', [])
        staff_members = list(users_collection.find(
            {'facebook_id': {'$in': staff_ids}},
            {'password': 0}  # Exclude password
        ))

        # Convert ObjectId to string
        for staff in staff_members:
            staff['_id'] = str(staff['_id'])

        return jsonify(staff_members)
    except Exception as e:
        print(f"Error fetching users: {str(e)}")
        return jsonify({'error': 'Failed to fetch users'}), 500

@app.route('/api/users/<staff_id>', methods=['DELETE'])
@owner_required
def delete_user(staff_id):
    try:
        owner_id = request.headers.get('User-Id')
        if not owner_id:
            return jsonify({'error': 'Owner ID is required'}), 400

        # Remove staff from owner's staff list
        users_collection.update_one(
            {'facebook_id': owner_id},
            {'$pull': {'staffs': staff_id}}
        )

        # Delete the staff member
        result = users_collection.delete_one({'facebook_id': staff_id})
        if result.deleted_count == 0:
            return jsonify({'error': 'User not found'}), 404

        return jsonify({'message': 'User deleted successfully'})
    except Exception as e:
        print(f"Error deleting user: {str(e)}")
        return jsonify({'error': 'Failed to delete user'}), 500

@app.route('/privacy', methods=['GET'])
def privacy_policy():
    """Serve the privacy policy page."""
    template = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Privacy Policy</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                color: #333;
            }
            h1, h2 {
                color: #2c3e50;
            }
            .container {
                background: #fff;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .last-updated {
                color: #666;
                font-style: italic;
                margin-top: 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Privacy Policy</h1>
            
            <h2>1. Information We Collect</h2>
            <p>We collect information that you provide directly to us when using our Facebook application:</p>
            <ul>
                <li>Basic profile information (name, email)</li>
                <li>Facebook user ID</li>
                <li>Messages and communications through our platform</li>
                <li>Order information and transaction history</li>
            </ul>

            <h2>2. How We Use Your Information</h2>
            <p>We use the collected information to:</p>
            <ul>
                <li>Process and manage your orders</li>
                <li>Communicate with you about your orders</li>
                <li>Improve our services</li>
                <li>Comply with legal obligations</li>
            </ul>

            <h2>3. Data Storage and Security</h2>
            <p>We store your information securely in our database and implement appropriate security measures to protect your data.</p>

            <h2>4. Data Sharing</h2>
            <p>We do not sell or share your personal information with third parties except as required by law or with your explicit consent.</p>

            <h2>5. Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
                <li>Access your personal information</li>
                <li>Correct inaccurate data</li>
                <li>Request deletion of your data</li>
                <li>Opt-out of communications</li>
            </ul>

            <h2>6. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please contact us through our Facebook page.</p>

            <div class="last-updated">
                Last updated: {{ current_date }}
            </div>
        </div>
    </body>
    </html>
    """
    
    return render_template_string(
        template,
        current_date=datetime.utcnow().strftime("%B %d, %Y")
    )

@app.route('/static/<path:filename>')
def serve_static(filename):
    """Serve static files from the static directory."""
    try:
        return send_from_directory(app.static_folder, filename)
    except Exception as e:
        app.logger.error(f'Error serving static file {filename}: {str(e)}')
        return jsonify({'error': 'File not found'}), 404

@app.route('/api/health')
def health_check():
    """Health check endpoint for Render."""
    try:
        # Check MongoDB connection
        users_collection.find_one()
        return jsonify({"status": "healthy"}), 200
    except Exception as e:
        app.logger.error(f'Health check failed: {str(e)}')
        return jsonify({"status": "unhealthy", "error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True) 