const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const MajorCategory = require('../src/models/MajorCategory');
const Category = require('../src/models/Category');
const Question = require('../src/models/Question');
const ExamResult = require('../src/models/ExamResult');
const ExamProgress = require('../src/models/ExamProgress');
const { ADMIN_SCOPE, buildScopeAssignment } = require('../src/utils/libraryScope');

async function run() {
    await connectDatabase();

    try {
        const results = await Promise.all([
            MajorCategory.updateMany(
                { scopeType: { $exists: false } },
                { $set: buildScopeAssignment(ADMIN_SCOPE) }
            ),
            Category.updateMany(
                { scopeType: { $exists: false } },
                { $set: buildScopeAssignment(ADMIN_SCOPE) }
            ),
            Question.updateMany(
                { scopeType: { $exists: false } },
                { $set: buildScopeAssignment(ADMIN_SCOPE) }
            ),
            ExamResult.updateMany(
                { scopeType: { $exists: false } },
                {
                    $set: {
                        ...buildScopeAssignment(ADMIN_SCOPE),
                        'categorySnapshot.scopeType': ADMIN_SCOPE,
                        'categorySnapshot.ownerOpenid': null,
                    },
                }
            ),
            ExamProgress.updateMany(
                { scopeType: { $exists: false } },
                { $set: buildScopeAssignment(ADMIN_SCOPE) }
            ),
        ]);

        console.log('Library scope backfill completed.');
        results.forEach((result, index) => {
            console.log(`Task ${index + 1}: matched ${result.matchedCount}, modified ${result.modifiedCount}`);
        });
    } finally {
        await disconnectDatabase();
    }
}

run().catch(async (error) => {
    console.error('Library scope backfill failed:', error);
    try {
        await disconnectDatabase();
    } catch (disconnectError) {
        console.error('Disconnect failed:', disconnectError);
    }
    process.exit(1);
});
