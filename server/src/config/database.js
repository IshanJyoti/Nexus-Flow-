import { MongoClient } from "mongodb";

let client;
let db;

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing. Add it to server/.env");

  client = new MongoClient(uri);
  await client.connect();

  db = client.db(process.env.DB_NAME || "nexusflow");

  const collections = await db.listCollections({ name: "telemetry" }).toArray();
  if (collections.length === 0) {
    await db.createCollection("telemetry", {
      timeseries: {
        timeField: "timestamp",
        metaField: "metadata",
        granularity: "seconds"
      },
      expireAfterSeconds: 60 * 60 * 24 * 30
    });
    console.log("Created MongoDB Time-Series collection: telemetry");
  } else {
    console.log("Using existing telemetry collection");
  }

  return db;
}

export function getDatabase() {
  if (!db) throw new Error("Database is not connected");
  return db;
}

export async function closeDatabase() {
  if (client) await client.close();
}
