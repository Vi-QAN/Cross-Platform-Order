# Facebook Order Manager

A web application that helps you manage orders from Facebook messages. The application uses Facebook's API to read messages, processes them using OpenAI's GPT model to extract order details, and stores them in a database.

## Features

- Facebook authentication
- Automatic message processing
- Order details extraction (customer name, item, size, color, price)
- Clean and modern UI
- Real-time order display

## Prerequisites

- Python 3.8+
- Node.js 14+
- Facebook Developer Account
- OpenAI API Key

## Security Setup

1. **Facebook App Setup**:
   - Go to [Facebook Developers](https://developers.facebook.com/)
   - Create a new app or select existing app
   - Go to "Settings" > "Basic"
   - Copy your App ID and App Secret
   - Add Facebook Login product
   - Configure OAuth redirect URI: `http://localhost:3000/callback`

2. **Environment Variables**:
   - Copy `.env.example` to `.env`
   - Fill in your credentials:
     ```
     FB_APP_ID=your_app_id_here
     FB_APP_SECRET=your_app_secret_here
     FB_REDIRECT_URI=http://localhost:3000/callback
     OPENAI_API_KEY=your_openai_api_key_here
     ```
   - NEVER commit the `.env` file to version control

3. **Security Best Practices**:
   - Keep your app credentials secure
   - Use HTTPS in production
   - Implement proper session management
   - Regularly rotate your API keys
   - Monitor your app's usage and permissions

## Setup

1. Clone the repository
2. Install backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

4. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Fill in your Facebook App ID and Secret
   - Add your OpenAI API Key

## Running the Application

1. Start the backend server:
   ```bash
   python app.py
   ```

2. Start the frontend development server:
   ```bash
   cd frontend
   npm start
   ```

3. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Click "Login with Facebook" to authenticate
2. Grant necessary permissions for message access
3. View processed orders in the dashboard
4. Orders are automatically processed from Facebook messages

## Security Notes

- Never commit your `.env` file
- Keep your API keys secure
- Use HTTPS in production
- Implement proper session management
- Regularly audit your app's permissions
- Monitor for suspicious activity

## License

MIT 