require('dotenv').config();
module.exports = {
  port: +process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nexusflow',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  ingestKey: process.env.INGEST_KEY || '',
  retentionDays: +process.env.RETENTION_DAYS || 30,
};
