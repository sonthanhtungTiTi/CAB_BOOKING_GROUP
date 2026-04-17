const { Kafka, logLevel } = require('kafkajs');

let kafkaInstance = null;
let producer = null;

/**
 * Lấy hoặc tạo Kafka instance (Singleton)
 */
function getKafkaClient() {
  if (!kafkaInstance) {
    const brokers = (process.env.KAFKA_BROKER || '127.0.0.1:9092').split(',');
    kafkaInstance = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID || 'cab-booking',
      brokers,
      logLevel: logLevel.WARN,
      retry: {
        initialRetryTime: 300,
        retries: 5,
      },
    });
  }
  return kafkaInstance;
}

/**
 * Láy hoặc kết nối Kafka Producer (Singleton)
 */
async function getProducer() {
  if (!producer) {
    const kafka = getKafkaClient();
    producer = kafka.producer({
      allowAutoTopicCreation: true,
    });
    await producer.connect();
    console.log('[Kafka] Producer connected successfully');
  }
  return producer;
}

/**
 * Publish một Event/Message vào Topic với Kafka Producer
 * @param {string} topic Tên Topic, ví dụ: 'user.registered'
 * @param {object} payload Dữ liệu truyền đi, sẽ được ép sang JSON string
 * @param {string} [key] Khóa định danh cho Message, giúp route về chung một Partition (nếu cần)
 */
async function publishEvent(topic, payload, key = null) {
  const p = await getProducer();
  await p.send({
    topic,
    messages: [
      {
        key: key || null,
        value: JSON.stringify(payload),
        headers: {
          timestamp: new Date().toISOString(),
          source: process.env.KAFKA_CLIENT_ID || 'unknown',
        },
      },
    ],
  });
  console.log(`[Kafka] Published event to [${topic}]:`, payload);
}

/**
 * Chạy Kafka Consumer lắng nghe Topics
 * @param {string} groupId ID của Consumer Group (Mỗi Microservice nên có một Group ID khác nhau)
 * @param {string[]} topics Mảng các Topics cần lắng nghe
 * @param {Function} onMessage Hàm xử lý (topic, partition, parsedPayload)
 */
async function startConsumer(groupId, topics, onMessage) {
  const kafka = getKafkaClient();
  const consumer = kafka.consumer({ groupId });

  await consumer.connect();
  console.log(`[Kafka] Consumer group "${groupId}" connected`);

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
    console.log(`[Kafka] Subscribed to topic: ${topic}`);
  }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const valueStr = message.value ? message.value.toString() : null;
        let payload = null;
        if (valueStr) {
          payload = JSON.parse(valueStr);
        }
        await onMessage(topic, partition, payload);
      } catch (err) {
        console.error(`[Kafka] Error processing message on topic ${topic}:`, err.message);
      }
    },
  });

  return consumer;
}

module.exports = {
  getKafkaClient,
  getProducer,
  publishEvent,
  startConsumer,
};
