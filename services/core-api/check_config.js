const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const PlatformConfig = require('./models/PlatformConfig');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/miniprogram')
  .then(async () => {
    const configs = await PlatformConfig.find({});
    console.log(JSON.stringify(configs, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
