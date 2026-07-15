const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const ExamResult = require('../src/models/ExamResult');
const Category = require('../src/models/Category');
const Question = require('../src/models/Question');
const { buildCategorySnapshot, buildExamDetails } = require('../src/utils/resultSnapshot');

async function backfillExamSnapshots() {
    await connectDatabase();

    const results = await ExamResult.find({
        $or: [
            { details: { $exists: false } },
            { details: { $size: 0 } },
            { categorySnapshot: { $exists: false } },
            { categorySnapshot: null },
        ],
    });

    let updatedCount = 0;
    let skippedCount = 0;

    for (const result of results) {
        const category = await Category.findById(result.categoryId).lean();
        const questions = await Question.find({ categoryId: result.categoryId }).lean();

        if (!questions.length) {
            skippedCount += 1;
            continue;
        }

        const { details } = buildExamDetails(questions, result.answers || {});
        result.details = details;
        result.categorySnapshot = category ? buildCategorySnapshot(category) : null;
        await result.save();
        updatedCount += 1;
    }

    console.log(`Backfill complete. Updated: ${updatedCount}, skipped: ${skippedCount}`);
}

backfillExamSnapshots()
    .catch((error) => {
        console.error('Backfill failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await disconnectDatabase();
    });
