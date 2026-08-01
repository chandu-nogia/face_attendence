const Student = require('../models/Student');

const DEFAULT_THRESHOLD = parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.85');

function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Match an incoming face embedding against enrolled students.
 * Narrows by classId first when provided (fast path for ~40–60 students per class).
 * School-wide fallback still filters to students with embeddings only.
 */
async function findBestMatch(embedding, classId = null, threshold = DEFAULT_THRESHOLD) {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    return { matched: false, reason: 'Invalid embedding' };
  }

  const filter = {
    status: 'active',
    faceEmbedding: { $exists: true, $not: { $size: 0 } },
  };
  if (classId) {
    filter.classId = classId;
  }

  const candidates = await Student.find(filter)
    .select('name rollNo classId faceEmbedding photoUrls')
    .lean();

  if (!candidates.length) {
    return { matched: false, reason: 'No enrolled faces found' };
  }

  let best = null;
  let bestScore = -1;

  for (const student of candidates) {
    const score = cosineSimilarity(embedding, student.faceEmbedding);
    if (score > bestScore) {
      bestScore = score;
      best = student;
    }
  }

  if (!best || bestScore < threshold) {
    return {
      matched: false,
      reason: 'No match above threshold',
      bestScore,
      threshold,
    };
  }

  return {
    matched: true,
    student: best,
    confidence: Number(bestScore.toFixed(4)),
    threshold,
  };
}

module.exports = {
  cosineSimilarity,
  findBestMatch,
  DEFAULT_THRESHOLD,
};
