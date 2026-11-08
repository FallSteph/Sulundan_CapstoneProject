const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const User = require("./models/User");

async function migrate() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not defined in .env");

    console.log("Connecting to MongoDB...");
    await mongoose.connect(uri);
    console.log("Connected to MongoDB.");

    console.log("Migrating users with role 'SENIOR_FACULTY' to 'FACULTY'...");
    const result = await User.updateMany({ role: "SENIOR_FACULTY" }, { role: "FACULTY" });
    
    console.log(`Migration completed successfully! Updated ${result.modifiedCount} users.`);
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

migrate();
