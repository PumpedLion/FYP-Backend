// src/routers/chapterRoutes.ts
import express from 'express';
import {
    createChapter,
    getChaptersByManuscript,
    getChapterById,
    updateChapter,
    deleteChapter,
} from '../controllers/chapterController';
import { protect } from '../middleware/authMiddleware';
import catchAsync from '../utils/catchAsync';

const router = express.Router();

// Public Routes
router.get('/manuscript/:manuscriptId', catchAsync(getChaptersByManuscript));
router.get('/:id', catchAsync(getChapterById));

// Protected Routes
router.use(protect);

router.post('/', catchAsync(createChapter));
router.patch('/:id', catchAsync(updateChapter));
router.delete('/:id', catchAsync(deleteChapter));

export default router;
