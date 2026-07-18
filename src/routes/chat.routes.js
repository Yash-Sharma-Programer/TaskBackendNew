import { Router } from 'express';
import * as controller from '../controllers/chat.controller.js';
import { requireAuth, requireOrganisation } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();
router.use(requireAuth, requireOrganisation);
router.get('/members', controller.members);
router.get('/messages/:messageId/attachments/:attachmentId/download', controller.downloadAttachment);
router.delete('/messages/:messageId', controller.remove);
router.get('/:memberId/messages', controller.messages);
router.post('/:memberId/messages', upload.array('files', 6), controller.send);

export default router;
