import { Router } from 'express'; import * as controller from '../controllers/invitation.controller.js'; import { requireAuth } from '../middleware/auth.js';
const router = Router(); router.use(requireAuth); router.get('/', controller.list); router.get('/preview', controller.preview); router.post('/respond', controller.respond); export default router;
