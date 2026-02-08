// src/routers/chapterRoutes.ts
import express from 'express';
import {
    createChapter,
    getChaptersByManuscript,
    updateChapter,
    deleteChapter,
} from '../controllers/chapterController';
import { protect } from '../middleware/authMiddleware';
import catchAsync from '../utils/catchAsync';

const router = express.Router();

// Public Routes
router.get('/manuscript/:manuscriptId', catchAsync(getChaptersByManuscript));

// Protected Routes
router.use(protect);

router.post('/', catchAsync(createChapter));
router.patch('/:id', catchAsync(updateChapter));
router.delete('/:id', catchAsync(deleteChapter));

export default router;
