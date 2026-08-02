const AttendanceSettings = require('../models/AttendanceSettings');

let _cache = null;
let _cacheAt = 0;

async function getSettings() {
  const now = Date.now();
  if (_cache && now - _cacheAt < 30000) return _cache;
  let doc = await AttendanceSettings.findOne({ key: 'default' });
  if (!doc) {
    doc = await AttendanceSettings.create({ key: 'default' });
  }
  _cache = doc;
  _cacheAt = now;
  return doc;
}

function invalidateSettingsCache() {
  _cache = null;
  _cacheAt = 0;
}

module.exports = { getSettings, invalidateSettingsCache };
