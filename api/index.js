let handler;

try {
    // Try to load the main Express app
    handler = require('../server.js');
} catch (err) {
    // If initialization crashes (sync error), export a fallback handler that returns the exact error
    handler = (req, res) => {
        res.status(500).json({
            error: 'Serverless Initialization Failed',
            message: err.message,
            stack: err.stack,
            dirname: __dirname,
            cwd: process.cwd()
        });
    };
}

module.exports = handler;
