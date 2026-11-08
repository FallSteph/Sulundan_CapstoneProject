const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// Load the model
const Template = require("./models/Template");

// Database connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/lalalalai";

async function updateTemplate() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB.");

    const type = "form17";
    const fileName = "form17_v2.docx";
    const filePath = path.resolve(__dirname, "templates", "form17", fileName);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Deactivate previous templates of this type
    await Template.updateMany({ type }, { is_active: false });
    console.log(`Deactivated previous ${type} templates.`);

    // Create new active template
    const newTemplate = new Template({
      type,
      title: "Form 17 Syllabus Evaluation Checklist",
      file_name: fileName,
      file_path: filePath,
      version: 2,
      is_active: true,
    });

    await newTemplate.save();
    console.log(`New ${type} template activated: ${fileName}`);

    process.exit(0);
  } catch (err) {
    console.error("Error updating template:", err);
    process.exit(1);
  }
}

updateTemplate();
