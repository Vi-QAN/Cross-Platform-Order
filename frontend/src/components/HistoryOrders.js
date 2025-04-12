import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Table,
  Paper,
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

const HistoryOrders = () => {
  const [customerOrders, setCustomerOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [note, setNote] = useState('');
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    fetchHistoryOrders();
  }, []);

  const fetchHistoryOrders = async () => {
    try {
      const response = await fetch(`${API_URL}/api/orders/history`, {
        headers: {
          ...defaultHeaders,
          'User-Id': localStorage.getItem('facebookId')
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch history orders');
      }
      const data = await response.json();
      setCustomerOrders(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = (order) => {
    setSelectedOrder(order);
    setNote(order.billing_notes || '');
    setNoteDialogOpen(true);
  };

  const handleSaveNote = async () => {
    try {
      const response = await fetch(`${API_URL}/api/orders/${selectedOrder._id}/billing-notes`, {
        method: 'PUT',
        headers: {
          ...defaultHeaders,
          'Content-Type': 'application/json',
          'User-Id': localStorage.getItem('facebookId')
        },
        body: JSON.stringify({ notes: note }),
      });

      if (!response.ok) {
        throw new Error('Failed to update notes');
      }

      setNoteDialogOpen(false);
      fetchHistoryOrders();
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
        Order History
      </Typography>
      <Grid container spacing={{ xs: 1, sm: 2 }}>
        {customerOrders.map((customer) => (
          <Grid item xs={12} key={customer.customer_name}>
            <Paper elevation={2} sx={{ p: 2 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  {customer.customer_name}
                </Typography>
                <Typography variant="subtitle1" color="primary">
                  Total Amount: ${customer.total_amount.toFixed(2)}
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
                      <TableCell>Price</TableCell>
                      <TableCell>Subtotal</TableCell>
                      <TableCell>Status</TableCell>
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
                                  image={order.image_url}
                                  alt={order.item_name}
                                  sx={{ objectFit: 'contain' }}
                                />
                              </Box>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                        <TableCell>{order.color}</TableCell>
                        <TableCell>{order.quantity}</TableCell>
                        <TableCell>${order.price?.toFixed(2) || '0.00'}</TableCell>
                        <TableCell>${((order.price || 0) * order.quantity).toFixed(2)}</TableCell>
                        <TableCell>
                          <Chip
                            label={order.status || 'completed'}
                            color="success"
                          />
                        </TableCell>
                        <TableCell>
                          {order.billing?.notes || '-'}
                        </TableCell>
                        <TableCell>
                          <Box display="flex" gap={1}>
                            <Button
                              size="small"
                              variant="outlined"
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
            </Paper>
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

export default HistoryOrders; 