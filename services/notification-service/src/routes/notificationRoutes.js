const express = require('express');
const router = express.Router();

// POST /api/notifications/send
router.post('/send', (req, res) => {
  const { user_id, message } = req.body;
  if (!user_id || !message) {
    return res.status(400).json({ success: false, message: 'user_id and message are required' });
  }
  
  console.log(`[Notification] Sent to ${user_id}: "${message}"`);
  res.json({ user_id, message, sent: true, sent_at: new Date().toISOString() });
});

module.exports = router;
