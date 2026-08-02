const {
  getAnalyticsOverview,
  getAtRiskStudents,
  getClassComparison,
} = require('../services/analyticsService');

async function overview(req, res, next) {
  try {
    const data = await getAnalyticsOverview({
      from: req.query.from,
      to: req.query.to,
      classId: req.query.classId,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function atRisk(req, res, next) {
  try {
    const data = await getAtRiskStudents({
      threshold: req.query.threshold ? Number(req.query.threshold) : 75,
      from: req.query.from,
      to: req.query.to,
      classId: req.query.classId,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function classComparison(req, res, next) {
  try {
    const data = await getClassComparison({
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { overview, atRisk, classComparison };
