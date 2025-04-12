import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Alert,
  Card,
  CardContent,
  Chip,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Facebook as FacebookIcon,
} from '@mui/icons-material';

const API_URL = process.env.REACT_APP_API_URL;

// Add default headers for all fetch calls
const defaultHeaders = {
  'ngrok-skip-browser-warning': 'true'
};

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [facebookUsers, setFacebookUsers] = useState([]);
  const [showFacebookResults, setShowFacebookResults] = useState(false);
  const [facebookSearchLoading, setFacebookSearchLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/users`, {
        headers: {
          ...defaultHeaders,
          'User-Id': localStorage.getItem('facebookId'),
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookSearch = async () => {
    try {
      setFacebookSearchLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/users/facebook-search?q=${searchQuery}`, {
        headers: {
          ...defaultHeaders,
          'User-Id': localStorage.getItem('facebookId'),
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to search Facebook users');
      }
      
      const data = await response.json();
      setFacebookUsers(data);
      setShowFacebookResults(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setFacebookSearchLoading(false);
    }
  };

  const handleAddStaff = async (facebookUser) => {
    try {
      setError(null);
      const response = await fetch(`${API_URL}/api/users/import-facebook`, {
        method: 'POST',
        headers: {
          ...defaultHeaders,
          'Content-Type': 'application/json',
          'User-Id': localStorage.getItem('facebookId'),
        },
        body: JSON.stringify({
          ...facebookUser,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add staff');
      }
      
      setShowFacebookResults(false);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (staffId) => {
    if (!window.confirm('Are you sure you want to delete this staff member?')) {
      return;
    }

    try {
      setError(null);
      const response = await fetch(`${API_URL}/api/users/${staffId}`, {
        method: 'DELETE',
        headers: {
          ...defaultHeaders,
          'User-Id': localStorage.getItem('facebookId'),
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete user');
      }
      
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Box p={{ xs: 1, sm: 2 }}>
      <Typography variant="h5" gutterBottom>
        Staff Management
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" gap={2} flexDirection={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <TextField
              fullWidth
              label="Search Facebook Users"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowFacebookResults(false);
              }}
              onKeyPress={(e) => e.key === 'Enter' && handleFacebookSearch()}
            />
            <Button
              variant="contained"
              color="secondary"
              startIcon={<FacebookIcon />}
              onClick={handleFacebookSearch}
              disabled={facebookSearchLoading}
              sx={{ minWidth: { xs: '100%', sm: 'auto' } }}
            >
              {facebookSearchLoading ? 'Searching...' : 'Search Facebook'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {showFacebookResults ? (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Facebook Users
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {facebookUsers.map((user) => (
                    <TableRow key={user.facebook_id}>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>{user.email || 'Not available'}</TableCell>
                      <TableCell>
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          onClick={() => handleAddStaff(user)}
                        >
                          Add as Staff
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.facebook_id}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Chip
                      label={user.status}
                      color={user.status === 'active' ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton onClick={() => handleDelete(user.facebook_id)} color="error">
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default UserManagement; 