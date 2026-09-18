/**
 * One-off migration: convert Date-typed createdAt/updatedAt to epoch milliseconds (Number).
 * Usage: node scripts/migrate-timestamps.js   (reads MONGODB_URI, defaults to local)
 */
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/pixelforge";
const FIELDS = ["createdAt", "updatedAt", "publishedAt", "lastLoginAt"];

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  for (const name of ["users", "projects"]) {
    const col = db.collection(name);
    let converted = 0;
    for (const field of FIELDS) {
      const cursor = col.find({ [field]: { $type: "date" } }, { projection: { [field]: 1 } });
      for await (const doc of cursor) {
        await col.updateOne({ _id: doc._id }, { $set: { [field]: doc[field].getTime() } });
        converted++;
      }
    }
    console.log(`${name}: converted ${converted} field(s)`);
  }
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
