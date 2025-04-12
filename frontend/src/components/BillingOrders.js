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
  IconButton,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import ImageDialog from './ImageDialog';

const API_URL = process.env.REACT_APP_API_URL;

// Add default headers for all fetch calls
const defaultHeaders = {
  'ngrok-skip-browser-warning': 'true'
};

const BillingOrders = () => {
  const [customerOrders, setCustomerOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [note, setNote] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportText, setExportText] = useState('');
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    fetchBillingOrders();
  }, []);

  const fetchBillingOrders = async () => {
    try {
      const response = await fetch(`${API_URL}/api/orders/billing`, {
        headers: {
          ...defaultHeaders,
          'User-Id': localStorage.getItem('facebookId')
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch billing orders');
      }
      const data = await response.json();
      setCustomerOrders(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAllAsPaid = async (customer) => {
    try {
      const response = await fetch(`${API_URL}/api/orders/mark-all-paid`, {
        method: 'POST',
        headers: {
          ...defaultHeaders,
          'Content-Type': 'application/json',
          'User-Id': localStorage.getItem('facebookId')
        },
        body: JSON.stringify({ customer_name: customer.customer_name })
      });

      if (!response.ok) {
        throw new Error('Failed to mark orders as paid');
      }

      fetchBillingOrders();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddNote = (order) => {
    setSelectedOrder(order);
    setNote(order.billing?.notes || '');
    setNoteDialogOpen(true);
  };

  const handleSaveNote = async () => {
    if (!selectedOrder) return;

    try {
      const response = await fetch(`${API_URL}/api/orders/${selectedOrder._id}/billing-notes`, {
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
      fetchBillingOrders();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleExport = (customer) => {
    let text = '';
    text += `\nOrder Details for ${customer.customer_name}:\n`;
    text += '----------------------------------------\n';
    
    customer.orders.forEach((order) => {
      text += `\n${order.quantity} ${order.item_name} ${order.color} - $${order.subtotal.toFixed(2)}\n`;
      if (order.billing?.notes) {
        text += `Notes: ${order.billing.notes}\n`;
      }
    });

    text += `\nTotal Amount: $${customer.total_amount.toFixed(2)}`;
    setExportText(text);
    setExportDialogOpen(true);
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(exportText);
  };

  const handlePriceEdit = (order) => {
    setSelectedOrder(order);
    setNewPrice(order.price.toString());
    setPriceDialogOpen(true);
  };

  const handlePriceUpdate = async () => {
    if (!selectedOrder) return;

    try {
      const response = await fetch(`${API_URL}/api/orders/${selectedOrder._id}/update-price`, {
        method: 'PUT',
        headers: {
          ...defaultHeaders,
          'Content-Type': 'application/json',
          'User-Id': localStorage.getItem('facebookId')
        },
        body: JSON.stringify({ price: parseFloat(newPrice) })
      });

      if (!response.ok) {
        throw new Error('Failed to update price');
      }

      fetchBillingOrders();
      setPriceDialogOpen(false);
      setSelectedOrder(null);
      setNewPrice('');
    } catch (error) {
      console.error('Error updating price:', error);
      setError('Failed to update price');
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
        Billing Orders
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
                  <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} gap={2}>
                    <Typography variant="subtitle1" color="primary">
                      Total Amount: ${customer.total_amount.toFixed(2)}
                    </Typography>
                    <Button
                      variant="contained"
                      color="success"
                      onClick={() => handleMarkAllAsPaid(customer)}
                    >
                      Mark All as Paid
                    </Button>
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={() => handleExport(customer)}
                    >
                      Export Orders
                    </Button>
                  </Box>
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
                          <TableCell>{order.color || '-'}</TableCell>
                          <TableCell>{order.quantity}</TableCell>
                          <TableCell>
                            <Box display="flex" alignItems="center">
                              ${order.price.toFixed(2)}
                              <IconButton
                                size="small"
                                onClick={() => handlePriceEdit(order)}
                                sx={{ ml: 1 }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </TableCell>
                          <TableCell>${order.subtotal.toFixed(2)}</TableCell>
                          <TableCell>
                            {order.billing_notes || '-'}
                          </TableCell>
                          <TableCell>
                            <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} gap={1}>
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
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Export Dialog */}
      <Dialog 
        open={exportDialogOpen} 
        onClose={() => setExportDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Order Summary</DialogTitle>
        <DialogContent sx={{ 
          minHeight: { xs: '60vh', sm: '400px' }, 
          maxHeight: '80vh', 
          p: { xs: 1, sm: 3 },
          display: 'flex',
          flexDirection: 'column',
          gap: 2
        }}>
          <TextField
            fullWidth
            multiline
            value={exportText}
            onChange={(e) => setExportText(e.target.value)}
            InputProps={{
              readOnly: !isEditing,
              sx: {
                fontFamily: 'monospace',
                fontSize: { xs: '12px', sm: '14px' },
                lineHeight: 1.5,
                height: '100%'
              }
            }}
            sx={{
              height: '100%',
              '& .MuiInputBase-root': {
                height: '100%'
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCopyToClipboard} color="primary">
            Copy to Clipboard
          </Button>
          <Button 
            onClick={() => setIsEditing(!isEditing)}
            color={isEditing ? "secondary" : "primary"}
          >
            {isEditing ? 'Done Editing' : 'Edit'}
          </Button>
          <Button onClick={() => setExportDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Price Edit Dialog */}
      <Dialog open={priceDialogOpen} onClose={() => setPriceDialogOpen(false)}>
        <DialogTitle>Edit Order Price</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Price"
            type="number"
            fullWidth
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            inputProps={{ min: 0, step: 0.01 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPriceDialogOpen(false)}>Cancel</Button>
          <Button onClick={handlePriceUpdate} variant="contained" color="primary">
            Update Price
          </Button>
        </DialogActions>
      </Dialog>

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

export default BillingOrders; 