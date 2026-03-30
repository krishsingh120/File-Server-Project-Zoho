const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");

const {
  fileProcessingQueue,
  QUEUE_NAMES,
} = require("../providers/bullmq.provider");

const serverAdapter = new ExpressAdapter();

// URL where Bull Board will be available
serverAdapter.setBasePath("/admin/bull-board");

createBullBoard({
  queues: [new BullMQAdapter(fileProcessingQueue)],
  serverAdapter,
});

module.exports = serverAdapter;
