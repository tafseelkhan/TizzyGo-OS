import express from 'express';
import { getRiderIdFromToken } from '../../../../controller/tizzyos/shipping/fws/fwsSearchRiderIdController';

const router = express.Router();

router.get('/get-rider-id', getRiderIdFromToken);

export default router;
