import { MongoClient, MongoClientOptions, ServerApiVersion } from "mongodb";

const options: MongoClientOptions = {
  maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE ?? 10),
  minPoolSize: 0,
  maxIdleTimeMS: 30_000,
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
};

const globalForMongo = globalThis as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

export async function getMongoClient() {
  // Resolve the URI lazily so importing this module never throws at build time
  // (e.g. Next.js "Collecting page data"); the env var is only required at request time.
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI 환경 변수가 설정되지 않았습니다.");
  }

  if (!globalForMongo._mongoClientPromise) {
    globalForMongo._mongoClientPromise = new MongoClient(mongoUri, options).connect().catch((error) => {
      globalForMongo._mongoClientPromise = undefined;
      throw error;
    });
  }

  return globalForMongo._mongoClientPromise;
}

export async function getAppDb() {
  const mongoClient = await getMongoClient();
  return mongoClient.db();
}
