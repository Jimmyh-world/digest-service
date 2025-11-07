import express from 'express';
import { generateDigest } from './services/digest-generator.js';

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' })); // Large payload for 100 articles

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'digest-service',
    uptime: process.uptime()
  });
});

// Main digest generation endpoint
app.post('/generate-digest', async (req, res) => {
  try {
    const { client_id, articles, country } = req.body;

    // Validate input
    if (!client_id || !articles || articles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'client_id and articles are required'
      });
    }

    console.log(`[DIGEST] Processing ${articles.length} articles for client ${client_id}`);
    const startTime = Date.now();

    // Generate digest
    const result = await generateDigest({ client_id, articles, country });

    const duration = Date.now() - startTime;
    console.log(`[DIGEST] Completed in ${duration}ms`);

    // Return success response
    res.json({
      success: true,
      ...result,
      _metadata: {
        ...result.metadata,
        processing_time_ms: duration
      }
    });

  } catch (error) {
    console.error('[DIGEST] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[DIGEST] Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`[DIGEST] Service running on port ${PORT}`);
  console.log(`[DIGEST] Ready to process digests`);
});
