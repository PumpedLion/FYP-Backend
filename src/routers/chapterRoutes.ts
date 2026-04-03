// src/routers/chapterRoutes.ts
import express from 'express';
import {
    createChapter,
    getChaptersByManuscript,
    getChapterById,
    updateChapter,
    deleteChapter,
} from '../controllers/chapterController';
import { protect, optionalAuth } from '../middleware/authMiddleware';
import catchAsync from '../utils/catchAsync';

const router = express.Router();

// Public Routes (Optional Auth to identify author/editor vs reader)
router.get('/manuscript/:manuscriptId', optionalAuth, catchAsync(getChaptersByManuscript));
router.get('/:id', optionalAuth, catchAsync(getChapterById));

// Protected Routes
router.use(protect);

router.post('/', catchAsync(createChapter));
router.patch('/:id', catchAsync(updateChapter));
router.delete('/:id', catchAsync(deleteChapter));

export default router;
