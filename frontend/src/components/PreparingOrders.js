import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Chip,
  Grid,
  Divider,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Card,
  CardContent,
  CardMedia,
} from '@mui/material';
import ImageDialog from './ImageDialog';

const API_URL = process.env.REACT_APP_API_URL;

// Add default headers for all fetch calls
const defaultHeaders = {
  'ngrok-skip-browser-warning': 'true'
};

const PreparingOrders = () => {
  const [customerOrders, setCustomerOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [note, setNote] = useState('');
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    fetchPreparingOrders();
  }, []);

  const fetchPreparingOrders = async () => {
    try {
      const response = await fetch(`${API_URL}/api/orders/preparing`, {
        headers: {
          ...defaultHeaders,
          'User-Id': localStorage.getItem('facebookId')
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch preparing orders');
      }
      const data = await response.json();
      setCustomerOrders(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      // If marking as completed, move to billing
      if (newStatus === 'completed') {
        const moveResponse = await fetch(`${API_URL}/api/orders/${orderId}/move-to-billing`, {
          method: 'POST',
          headers: {
            ...defaultHeaders,
            'Content-Type': 'application/json',
            'User-Id': localStorage.getItem('facebookId')
          }
        });
        
        if (!moveResponse.ok) {
          throw new Error('Failed to move order to billing');
        }
      }

      fetchPreparingOrders();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddNote = (order) => {
    setSelectedOrder(order);
    setNote(order.preparation_notes || '');
    setNoteDialogOpen(true);
  };

  const handleSaveNote = async () => {
    if (!selectedOrder) return;

    try {
      const response = await fetch(`${API_URL}/api/orders/${selectedOrder._id}/preparation-notes`, {
        method: 'PUT',
        headers: {
          ...defaultHeaders,
          'Content-Type': 'application/json',
          'User-Id': localStorage.getItem('facebookId')
        },
        body: JSON.stringify({ notes: note })
      });

      if (!response.ok) {
        throw new Error('Failed to update notes');
      }

      setNoteDialogOpen(false);
      fetchPreparingOrders();
    } catch (err) {
      setError(err.message);
    }
  };


  const handleImageClick = (order) => {
    if (order.image_url) {
      setSelectedImage({
        url: order.image_url,
        title: order.item_name
      });
      setImageDialogOpen(true);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box m={2}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box p={{ xs: 1, sm: 2 }}>
      <Typography variant="h5" gutterBottom>
        Preparing Orders
      </Typography>
      <Grid container spacing={{ xs: 1, sm: 2 }}>
        {customerOrders.map((customer) => (
          <Grid item xs={12} key={customer.customer_name}>
            <Card>
              <CardContent>
                <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} mb={2}>
                  <Typography variant="h6">
                    {customer.customer_name}
                  </Typography>
                  <Typography variant="subtitle1" color="primary">
                    Total Items: {customer.total_items}
                  </Typography>
                </Box>
                
                <Divider sx={{ my: 2 }} />
                
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Product</TableCell>
                        <TableCell>Image</TableCell>
                        <TableCell>Color</TableCell>
                        <TableCell>Quantity</TableCell>
                        <TableCell>Notes</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {customer.orders.map((order) => (
                        <TableRow key={order._id}>
                          <TableCell>{order.item_name}</TableCell>
                          <TableCell>
                            {order.image_url ? (
                              <Box
                                sx={{
                                  cursor: 'pointer',
                                  '&:hover': {
                                    opacity: 0.8,
                                  },
                                }}
                                onClick={() => handleImageClick(order)}
                              >
                                <CardMedia
                                  component="img"
                                  height={{ xs: 40, sm: 60 }}
                                  src={order.image_url}
                                  imgProps={{
                                    headers: {
                                      'ngrok-skip-browser-warning': 'true'
                                    }
                                  }}
                                  alt={order.item_name}
                                  sx={{ objectFit: 'contain' }}
                                />
                              </Box>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>{order.color || '-'}</TableCell>
                          <TableCell>{order.quantity}</TableCell>
                          <TableCell>
                            {order.preparation_notes || '-'}
                          </TableCell>
                          <TableCell>
                            <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} gap={1}>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => handleStatusChange(order._id, 'completed')}
                                fullWidth
                              >
                                Mark as Completed
                              </Button>
                              <Button
                                size="small"
                                variant="contained"
                                color="primary"
                                onClick={() => handleAddNote(order)}
                                fullWidth
                              >
                                Add Note
                              </Button>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Note Dialog */}
      <Dialog 
        open={noteDialogOpen} 
        onClose={() => setNoteDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Add Note for Order</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Note"
            fullWidth
            multiline
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNoteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveNote} color="primary">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Image Dialog */}
      <ImageDialog
        open={imageDialogOpen}
        onClose={() => setImageDialogOpen(false)}
        imageUrl={selectedImage?.url}
        title={selectedImage?.title}
      />
    </Box>
  );
};

export default PreparingOrders; 