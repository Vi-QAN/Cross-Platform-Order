import React from 'react';
import { Box, Button, Typography } from '@mui/material';

const Login = ({ onLogin }) => {
  return (
    <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
      <Typography variant="h5" gutterBottom>
        Welcome to Facebook Order Management
      </Typography>
      <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 2 }}>
        Please login with your Facebook account to manage your orders
      </Typography>
      <Button
        variant="contained"
        color="primary"
        size="large"
        onClick={onLogin}
      >
        Login with Facebook
      </Button>
    </Box>
  );
};

export default Login; 