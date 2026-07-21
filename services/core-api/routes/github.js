const { createCt8Router } = require('./ct8Router');

// Compatibility surface for deployed runners and older clients.
module.exports = createCt8Router({ legacy: true });
