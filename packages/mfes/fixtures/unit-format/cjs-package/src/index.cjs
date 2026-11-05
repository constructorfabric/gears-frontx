const { helper } = require('./helper.cjs');

module.exports = { entry: () => `cjs(${helper()})` };
