/**
 * outboxPublisher.js — TC38 + TC73: Outbox Pattern Background Worker
 *
 * Đọc outbox_events chưa xử lý → publish lên Kafka → đánh dấu processed.
 * Chạy mỗi 2 giây (setInterval).
 *
 * TC73: Nếu Kafka down → CATCH lỗi, KHÔNG xóa record, KHÔNG crash vòng lặp.
 *       Khi Kafka up lại → tự động gửi bù (retry tự nhiên).
 */
const { kafka } = require('shared');
const BookingModel = require('../models/bookingModel');

let running = false;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_LOG = 5; // Chỉ log tối đa 5 lần liên tiếp, tránh spam

async function processOutbox() {
  if (running) return; // tránh chạy chồng
  running = true;

  try {
    const events = await BookingModel.getUnprocessedOutboxEvents(20);

    if (events.length === 0) {
      // Reset counter khi không có event nào
      if (consecutiveFailures > 0) consecutiveFailures = 0;
      return;
    }

    for (const event of events) {
      try {
        await kafka.publishEvent(event.topic, event.payload);
        await BookingModel.markOutboxEventProcessed(event.id);
        console.log(`[Outbox] Published event #${event.id} to topic "${event.topic}"`);

        // TC73: Reset failure counter sau khi publish thành công
        if (consecutiveFailures > 0) {
          console.log(`[Outbox] ✅ Kafka recovered after ${consecutiveFailures} failed attempts`);
          consecutiveFailures = 0;
        }
      } catch (err) {
        // ═══════════════════════════════════════════════════════
        // TC73: Kafka Down — KHÔNG xóa event, KHÔNG crash vòng lặp
        // Event giữ nguyên processed=false → sẽ retry ở lần chạy tiếp
        // ═══════════════════════════════════════════════════════
        consecutiveFailures++;

        if (consecutiveFailures <= MAX_CONSECUTIVE_LOG) {
          console.warn(
            `[Outbox] ⚠️ Kafka publish failed for event #${event.id} ` +
            `(attempt ${consecutiveFailures}): ${err.message}`
          );
        } else if (consecutiveFailures === MAX_CONSECUTIVE_LOG + 1) {
          console.warn(
            `[Outbox] ⚠️ Kafka still down — suppressing further logs. ` +
            `${events.length} events buffered in DB, will auto-retry.`
          );
        }

        // QUAN TRỌNG: KHÔNG gọi markOutboxEventProcessed()
        // Event sẽ giữ nguyên processed=false → retry ở lần chạy tiếp
        // KHÔNG break — thử event tiếp theo (có thể Kafka chỉ từ chối 1 topic)
      }
    }
  } catch (err) {
    // TC73: Ngay cả DB query lỗi cũng KHÔNG crash vòng lặp
    console.error('[Outbox] ❌ Error reading outbox (DB issue?):', err.message);
  } finally {
    running = false;
  }
}

function startOutboxPublisher(intervalMs = 2000) {
  console.log(`[Outbox] Background publisher started (interval: ${intervalMs}ms)`);
  setInterval(processOutbox, intervalMs);
}

module.exports = { startOutboxPublisher, processOutbox };
