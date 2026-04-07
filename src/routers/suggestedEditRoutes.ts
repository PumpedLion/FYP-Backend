// src/routers/suggestedEditRoutes.ts
import { Router } from 'express';
import {
    createSuggestedEdit,
    getSuggestedEditsForChapter,
    acceptSuggestedEdit,
    declineSuggestedEdit,
} from '../controllers/suggestedEditController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/', protect, createSuggestedEdit);
router.get('/chapter/:chapterId', protect, getSuggestedEditsForChapter);
router.patch('/:id/accept', protect, acceptSuggestedEdit);
router.patch('/:id/decline', protect, declineSuggestedEdit);

export default router;
