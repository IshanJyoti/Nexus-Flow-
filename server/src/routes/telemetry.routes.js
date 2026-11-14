import { Router } from "express";
import { getDatabase } from "../config/database.js";

const router = Router();

function isValidTelemetry(body) {
  return body &&
    typeof body.sensorId === "string" && body.sensorId.trim().length > 0 &&
    typeof body.temperature === "number" && Number.isFinite(body.temperature);
}

router.post("/", async (req, res, next) => {
  try {
    if (!isValidTelemetry(req.body)) {
      return res.status(400).json({
        error: "sensorId (string) and temperature (finite number) are required"
      });
    }

    const point = {
      timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
      metadata: {
        sensorId: req.body.sensorId.trim(),
        deviceType: req.body.deviceType || "turbine"
      },
      temperature: req.body.temperature,
      unit: req.body.unit || "C"
    };

    if (Number.isNaN(point.timestamp.getTime())) {
      return res.status(400).json({ error: "timestamp must be a valid date" });
    }

    await getDatabase().collection("telemetry").insertOne(point);
    req.app.get("io").emit("telemetry:point", point);

    res.status(201).json({ message: "Telemetry stored", data: point });
  } catch (error) {
    next(error);
  }
});

router.post("/batch", async (req, res, next) => {
  try {
    const readings = req.body?.readings;
    if (!Array.isArray(readings) || readings.length === 0 || readings.length > 1000) {
      return res.status(400).json({ error: "readings must be an array containing 1 to 1000 items" });
    }

    for (const reading of readings) {
      if (!isValidTelemetry(reading)) {
        return res.status(400).json({ error: "Every reading needs sensorId and numeric temperature" });
      }
    }

    const documents = readings.map((reading) => ({
      timestamp: reading.timestamp ? new Date(reading.timestamp) : new Date(),
      metadata: {
        sensorId: reading.sensorId.trim(),
        deviceType: reading.deviceType || "turbine"
      },
      temperature: reading.temperature,
      unit: reading.unit || "C"
    }));

    if (documents.some((doc) => Number.isNaN(doc.timestamp.getTime()))) {
      return res.status(400).json({ error: "Each timestamp must be a valid date" });
    }

    await getDatabase().collection("telemetry").insertMany(documents, { ordered: false });
    req.app.get("io").emit("telemetry:batch", documents);

    res.status(201).json({ message: "Batch stored", insertedCount: documents.length });
  } catch (error) {
    next(error);
  }
});

router.get("/latest", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    const readings = await getDatabase().collection("telemetry")
      .find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    res.json({ data: readings.reverse() });
  } catch (error) {
    next(error);
  }
});

export default router;
