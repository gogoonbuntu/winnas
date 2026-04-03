const express = require('express');
const { deviceOps, sessionOps } = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All device routes require authentication
router.use(authMiddleware);

// GET /api/devices - List all devices
router.get('/', (req, res) => {
  try {
    const devices = deviceOps.getAll();
    res.json({ devices });
  } catch (err) {
    console.error('List devices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/devices/pending - List pending devices
router.get('/pending', (req, res) => {
  try {
    const devices = deviceOps.getPending();
    res.json({ devices });
  } catch (err) {
    console.error('List pending devices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/devices/:id/approve - Approve a device
router.put('/:id/approve', (req, res) => {
  try {
    const device = deviceOps.getById(req.params.id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    deviceOps.updateStatus(req.params.id, 'approved');
    res.json({ success: true, message: 'Device approved' });
  } catch (err) {
    console.error('Approve device error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/devices/:id/block - Block a device
router.put('/:id/block', (req, res) => {
  try {
    const device = deviceOps.getById(req.params.id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    // Delete all sessions for this device
    sessionOps.deleteByDeviceId(req.params.id);
    deviceOps.updateStatus(req.params.id, 'blocked');
    res.json({ success: true, message: 'Device blocked' });
  } catch (err) {
    console.error('Block device error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/devices/:id - Remove a device
router.delete('/:id', (req, res) => {
  try {
    const device = deviceOps.getById(req.params.id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    // Don't allow removing the current device
    if (device.id === req.deviceId) {
      return res.status(400).json({ error: 'Cannot remove current device' });
    }
    sessionOps.deleteByDeviceId(req.params.id);
    deviceOps.delete(req.params.id);
    res.json({ success: true, message: 'Device removed' });
  } catch (err) {
    console.error('Remove device error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
