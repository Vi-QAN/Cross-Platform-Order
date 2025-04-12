import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Container,
  Tabs,
  Tab,
  Typography,
  AppBar,
  Toolbar,
  Button,
  CircularProgress,
  Alert,
  ThemeProvider,
  createTheme,
  FormControlLabel,
  Checkbox
} from '@mui/material';
import OrderSummary from './components/OrderSummary';
import PreparingOrders from './components/PreparingOrders';
import BillingOrders from './components/BillingOrders';
import HistoryOrders from './components/HistoryOrders';
import UserManagement from './components/UserManagement';
import BusinessIcon from '@mui/icons-material/Business';

// Create a theme instance
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

const API_URL = process.env.REACT_APP_API_URL;

// Add default headers for all fetch calls
const defaultHeaders = {
  'ngrok-skip-browser-warning': 'true'
};

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function App() {
  const [tabValue, setTabValue] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedRole, setSelectedRole] = useState('staff');
  
  useEffect(() => {
    // Check if user is already authenticated
    const facebookId = localStorage.getItem('facebookId');
    const userRole = localStorage.getItem('userRole');
    if (facebookId && userRole) {
      setUser({
        id: facebookId,
        role: userRole
      });
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleLogin = async (role) => {
    try {
      const response = await fetch(`${API_URL}/api/login`, {
        headers: defaultHeaders
      });
      const data = await response.json();
      localStorage.setItem('selected_role', role); // Store selected role in localStorage
      window.location.href = data.auth_url;
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const role = localStorage.getItem('selected_role') || 'staff'; // Get role from localStorage
    
    if (code && !isProcessing) {
      try {
        setIsProcessing(true);
        setLoading(true);
        
        // First, send the code to the backend
        const response = await fetch(`${API_URL}/api/callback?code=${code}&role=${role}`, {
          headers: defaultHeaders
        });
        const data = await response.json();
        
        if (data.access_token) {
          // Store the access token in localStorage
          localStorage.setItem('fb_token', data.access_token);
          localStorage.setItem('facebookId', data.user.facebook_id);
          localStorage.setItem('userRole', data.user.user_role);
          setUser({
            id: data.user.facebook_id,
            role: data.user.user_role
          });
          setIsAuthenticated(true);
          // Remove the code and role from localStorage
          localStorage.removeItem('selected_role');
          // Remove the code from URL
          window.history.replaceState({}, document.title, window.location.pathname);
        } else if (data.error) {
          console.error('Callback error:', data.error);
          // Clear any existing tokens
          localStorage.removeItem('fb_token');
          localStorage.removeItem('selected_role');
          setIsAuthenticated(false);
          // Show error message to user
          setError(data.error);
        }
      } catch (error) {
        console.error('Callback error:', error);
        // Clear any existing tokens
        localStorage.removeItem('fb_token');
        localStorage.removeItem('facebookId');
        localStorage.removeItem('userRole');
        localStorage.removeItem('selected_role');
        setIsAuthenticated(false);
        // Show error message to user
        setError('Failed to complete login. Please try again.');
      } finally {
        setLoading(false);
        setIsProcessing(false);
      }
    }
  };

  // Check for callback code when component mounts
  useEffect(() => {
      handleCallback();
  }, [isProcessing]);

  const handleLogout = () => {
    localStorage.removeItem('fb_token');
    localStorage.removeItem('facebookId');
    localStorage.removeItem('userRole');
    setIsAuthenticated(false);
    setUser(null);
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  if (loading) return <CircularProgress />;

  if (!isAuthenticated) {
    return (
      <ThemeProvider theme={theme}>
        <Container maxWidth="sm">
          <Box sx={{ mt: 8, textAlign: 'center' }}>
            <Typography variant="h4" gutterBottom>
              Facebook Order Manager
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={selectedRole === 'owner'}
                  onChange={(e) => {
                    setSelectedRole(e.target.checked ? 'owner' : 'staff');
                  }}
                  icon={<BusinessIcon />}
                  checkedIcon={<BusinessIcon />}
                />
              }
              label="Login as Owner"
              sx={{ py: 2 }}
            />
            <Button
              variant="contained"
              color="primary"
              size="large"
              onClick={() => handleLogin(selectedRole)}
            >
              Login with Facebook
            </Button>
          </Box>
        </Container>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ flexGrow: 1 }}>
        <AppBar position="static">
          <Toolbar>
            <Typography 
              variant="h6" 
              component="div" 
              sx={{ 
                flexGrow: 1,
                fontSize: { xs: '1rem', sm: '1.25rem' }
              }}
            >
              Facebook Order Manager
            </Typography>
            <Typography 
              variant="subtitle1" 
              color="inherit" 
              sx={{ 
                mr: 2,
                display: { xs: 'none', sm: 'block' }
              }}
            >
              ID: {user?.id}
            </Typography>
            <Button 
              color="inherit" 
              onClick={handleLogout}
              sx={{
                fontSize: { xs: '0.8rem', sm: '0.875rem' }
              }}
            >
              Logout
            </Button>
          </Toolbar>
        </AppBar>

        {error && (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange}>
            <Tab label="Order Summary" />
            <Tab label="Preparing Orders" />
            {user?.role === 'owner' && <Tab label="Billing Orders" />}
            {user?.role === 'owner' && <Tab label="History" />}
            {user?.role === 'owner' && <Tab label="User Management" />}
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <OrderSummary />
        </TabPanel>
        <TabPanel value={tabValue} index={1}>
          <PreparingOrders />
        </TabPanel>
        {user?.role === 'owner' && (
          <TabPanel value={tabValue} index={2}>
            <BillingOrders />
          </TabPanel>
        )}
        {user?.role === 'owner' && (
          <TabPanel value={tabValue} index={3}>
            <HistoryOrders />
          </TabPanel>
        )}
        {user?.role === 'owner' && (
          <TabPanel value={tabValue} index={4}>
            <UserManagement />
          </TabPanel>
        )}
      </Box>
    </ThemeProvider>
  );
}

export default App;
