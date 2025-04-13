import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Grid,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Card,
  CardContent,
  CardMedia,
  IconButton,
} from '@mui/material';
import ImageDialog from './ImageDialog';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';

const API_URL = process.env.REACT_APP_API_URL;

// Add default headers for all fetch calls
const defaultHeaders = {
  'ngrok-skip-browser-warning': 'true'
};

const OrderSummary = () => {
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [price, setPrice] = useState('');
  const [priceError, setPriceError] = useState('');
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  useEffect(() => {
    fetchSummaries();
  }, []);

  const fetchSummaries = async () => {
    try {
      const response = await fetch(`${API_URL}/api/order-summaries`, {
        headers: {
          ...defaultHeaders,
          'User-Id': localStorage.getItem('facebookId')
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch order summaries');
      }
      const data = await response.json();
      setSummaries(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImageClick = (summary) => {
    if (summary.image_url) {
      setSelectedImage({
        url: summary.image_url,
        title: summary.product_name
      });
    }
  };

  const handleImageUpload = async (event, productName) => {
    const file = event.target.files[0];
    if (!file) return;

    // Reset any previous errors
    setUploadError(null);

    // Create FormData object
    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch(`${API_URL}/api/order-summaries/${encodeURIComponent(productName)}/image`, {
        method: 'PUT',
        headers: {
          ...defaultHeaders,
          'User-Id': localStorage.getItem('facebookId')
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload image');
      }

      // Refresh the summaries to show the new image
      await fetchSummaries();
    } catch (err) {
      setUploadError(`Failed to upload image: ${err.message}`);
    }
  };

  const handleSetPrice = (product) => {
    setSelectedProduct(product);
    setPrice(product.price || '');
    setPriceDialogOpen(true);
  };

  const handlePriceChange = (event) => {
    const value = event.target.value;
    setPrice(value);
    setPriceError('');
  };

  const handleSavePrice = async () => {
    if (!price || isNaN(price) || parseFloat(price) < 0) {
      setPriceError('Please enter a valid price');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/order-summaries/${selectedProduct.product_name}/price`, {
        method: 'PUT',
        headers: {
          ...defaultHeaders,
          'Content-Type': 'application/json',
          'User-Id': localStorage.getItem('facebookId')
        },
        body: JSON.stringify({ price: parseFloat(price) }),
      });

      if (!response.ok) {
        throw new Error('Failed to update price');
      }

      setPriceDialogOpen(false);
      fetchSummaries();
    } catch (err) {
      setPriceError(err.message);
    }
  };

  const handleMoveToPreparing = async (productName) => {
    try {
      const response = await fetch(`${API_URL}/api/orders/move-to-preparing`, {
        method: 'POST',
        headers: {
          ...defaultHeaders,
          'Content-Type': 'application/json',
          'User-Id': localStorage.getItem('facebookId')
        },
        body: JSON.stringify({ product_name: productName }),
      });

      if (!response.ok) {
        throw new Error('Failed to move orders to preparing');
      }

      fetchSummaries(); // Refresh the summaries
    } catch (err) {
      setError(err.message);
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
        Order Summary
      </Typography>
      {uploadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {uploadError}
        </Alert>
      )}
      <Grid container spacing={{ xs: 1, sm: 2 }}>
        {summaries.map((summary) => (
          <Grid item xs={12} sm={6} md={4} key={summary.product_name}>
            <Card>
              <Box position="relative">
                {summary.image_url ? (
                  <>
                    <Box
                      sx={{
                        cursor: 'pointer',
                        '&:hover': {
                          opacity: 0.8,
                        },
                      }}
                      onClick={() => handleImageClick(summary)}
                    >
                      <CardMedia
                        component="img"
                        height={{ xs: 150, sm: 200 }}
                        image={summary.image_url}
                        alt={summary.product_name}
                        sx={{ objectFit: 'contain' }}
                      />
                    </Box>
                    <IconButton
                      component="label"
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        },
                      }}
                    >
                      <input
                        type="file"
                        hidden
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e, summary.product_name)}
                      />
                      <AddPhotoAlternateIcon />
                    </IconButton>
                  </>
                ) : (
                  <Box
                    sx={{
                      height: 200,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#f5f5f5',
                    }}
                  >
                    <IconButton
                      component="label"
                      sx={{
                        p: 3,
                        '&:hover': {
                          backgroundColor: 'rgba(0, 0, 0, 0.04)',
                        },
                      }}
                    >
                      <input
                        type="file"
                        hidden
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e, summary.product_name)}
                      />
                      <AddPhotoAlternateIcon sx={{ fontSize: 40 }} />
                    </IconButton>
                  </Box>
                )}
              </Box>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {summary.product_name}
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
                    {Object.entries(summary.color_breakdown || {}).map(([color, quantity]) => (
                      <Chip
                        key={color}
                        label={`${color}: ${quantity}`}
                        color="primary"
                        variant="outlined"
                        sx={{ 
                          m: 0.5,
                          fontSize: { xs: '0.875rem', sm: '1rem' },
                          padding: { xs: '4px 8px', sm: '8px 16px' }
                        }}
                      />
                    ))}
                  </Box>
                <Typography color="textSecondary" gutterBottom>
                  Total Quantity: {summary.total_quantity}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Price: ${summary.price || 'Not set'}
                </Typography>
                <Box mt={2} display="flex" flexDirection={{ xs: 'column', sm: 'row' }} gap={1}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => handleMoveToPreparing(summary.product_name)}
                    fullWidth
                  >
                    Move to Preparing
                  </Button>
                  <Button
                    variant="outlined"
                    color="primary"
                    onClick={() => handleSetPrice(summary)}
                    fullWidth
                  >
                    Update Price
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Price Setting Dialog */}
      <Dialog 
        open={priceDialogOpen} 
        onClose={() => setPriceDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Set Price for {selectedProduct?.product_name}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Price"
            type="number"
            fullWidth
            value={price}
            onChange={handlePriceChange}
            error={!!priceError}
            helperText={priceError}
            inputProps={{ min: 0, step: 0.01 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPriceDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSavePrice} color="primary">Save</Button>
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

export default OrderSummary; 