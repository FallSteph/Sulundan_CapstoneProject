const mongoose = require('mongoose');
require('dotenv').config();

async function checkTemplates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const Template = mongoose.model('Template', new mongoose.Schema({}, { strict: false }));
    const templates = await Template.find({}).lean();
    console.log(JSON.stringify(templates, null, 2));
    await mongoose.connection.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
checkTemplates();
