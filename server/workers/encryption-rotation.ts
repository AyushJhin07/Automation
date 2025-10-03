import { registerQueueWorker } from './queueWorker.js';
import { encryptionRotationService } from '../services/EncryptionRotationService.js';
import { getErrorMessage } from '../types/common.js';

registerQueueWorker('encryption.rotate', async (job) => {
  try {
    await encryptionRotationService.processJob(job.data.jobId);
    console.log(`🔁 Completed encryption rotation job ${job.data.jobId}`);
  } catch (error) {
    console.error(`❌ Encryption rotation job ${job.data.jobId} failed:`, getErrorMessage(error));
    throw error;
  }
});

console.log('🛡️ Encryption rotation worker registered and awaiting jobs.');
