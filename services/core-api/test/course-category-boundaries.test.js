const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'course-category-boundaries-test-key';

const CourseCategory = require('../models/CourseCategory');
const PlatformConfig = require('../models/PlatformConfig');
const controller = require('../controllers/courseCategoryController');

function queryResult(rows, capture) {
    return {
        sort(value) { capture.sort = value; return this; },
        skip(value) { capture.skip = value; return this; },
        limit(value) { capture.limit = value; return this; },
        async lean() { return rows; },
    };
}

test('admin course categories bound pagination and expose platform display metadata only', async () => {
    const originalCategoryFind = CourseCategory.find;
    const originalCategoryCount = CourseCategory.countDocuments;
    const originalPlatformFind = PlatformConfig.find;
    const categoryCapture = {};
    const platformCapture = {};
    let platformProjection = null;

    CourseCategory.countDocuments = async () => 1;
    CourseCategory.find = () => queryResult([{ _id: 'category-1', name: 'Course' }], categoryCapture);
    PlatformConfig.find = (filter, projection) => {
        platformProjection = projection;
        return queryResult([{ platformCode: 'mx', name: 'MX', status: true }], platformCapture);
    };

    try {
        let response;
        await controller.getAdminCategories(
            { query: { page: '-2', limit: '10000' } },
            { json(body) { response = body; } },
        );

        assert.equal(response.success, true);
        assert.equal(response.data.page, 1);
        assert.equal(response.data.limit, 100);
        assert.equal(categoryCapture.skip, 0);
        assert.equal(categoryCapture.limit, 100);
        assert.equal(platformCapture.limit, 200);
        assert.equal(platformProjection, 'platformCode name status');
        assert.equal('secretKey' in response.data._platforms[0], false);
        assert.equal('url' in response.data._platforms[0], false);
    } finally {
        CourseCategory.find = originalCategoryFind;
        CourseCategory.countDocuments = originalCategoryCount;
        PlatformConfig.find = originalPlatformFind;
    }
});
