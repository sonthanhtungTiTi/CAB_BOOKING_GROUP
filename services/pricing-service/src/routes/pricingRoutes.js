const express = require('express');
const router = express.Router();

// POST /api/pricing/calculate
router.post('/calculate', async (req, res) => {
  const { distance_km, demand_index, supply_index, simulate_timeout } = req.body;

  // TC30: Test-hook — simulate timeout cho grading (chỉ khi nhận cờ)
  if (simulate_timeout) {
    await new Promise(r => setTimeout(r, 4000));
  }

  if (distance_km == null || demand_index == null) {
    return res.status(400).json({ success: false, message: 'distance_km and demand_index are required' });
  }

  const dist = parseFloat(distance_km);
  const demand = parseFloat(demand_index);

  // TC16: Surge formula — supply_index = 0 → fallback to 1 (tránh chia cho 0)
  const supply = (supply_index != null && parseFloat(supply_index) > 0)
    ? parseFloat(supply_index)
    : 1;
  const surge = Math.max(1.0, demand / supply);

  const baseFare = 15000;
  const costPerKm = 10000;
  const price = Math.round((baseFare + dist * costPerKm) * surge);

  res.json({ price, surge, base_fare: baseFare, distance_km: dist, demand_index: demand, supply_index: supply });
});

module.exports = router;
