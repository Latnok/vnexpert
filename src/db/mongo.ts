import { MongoClient, type Db } from "mongodb";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongo(): Promise<Db> {
  if (db) {
    return db;
  }
  client = new MongoClient(config.mongodbUri);
  await client.connect();
  db = client.db();
  logger.info({ db: db.databaseName }, "MongoDB connected");
  return db;
}

export function getDb(): Db {
  if (!db) {
    throw new Error("Mongo not connected");
  }
  return db;
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

